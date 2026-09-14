import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { ConnectionManager } from '../dist/utils/connectionManager.js';

// The backend bounds how long it will hold a run-events SSE stream open (60-75 minutes) and then
// completes the response cleanly, because an orphaned stream is otherwise retained for the life
// of the pod. That cap is only safe while this SDK treats a clean EOF as "reconnect", not as
// "the stream is over". These tests pin that contract against a stand-in server, so a change to
// the reconnect logic fails here rather than silently stranding long-running consumers in
// production.
//
// ConnectionManager is driven directly rather than the CloudCruise client, because the client
// refuses a non-production baseUrl (it will not send an API key to an unapproved host) and the
// contract under test has nothing to do with that guard.
const API_KEY = 'sk_test_example';
const SESSION_ID = 'sess_contract_test';

// Generous ceilings. Every assertion polls and resolves as soon as it is satisfied, so these
// bound the failure case only — they do not add to the runtime of a passing test. Fixed sleeps
// were deliberately avoided: subscribe() returns before the background connection is established,
// so a fixed wait races a slow CI worker.
const CONNECT_TIMEOUT_MS = 15000;
const REPEAT_TIMEOUT_MS = 30000;
const POLL_INTERVAL_MS = 25;

function startServer(onConnection) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      });
      onConnection(req, res);
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
}

// Resolves as soon as the predicate holds; the timeout is a failure bound, not a delay.
async function waitFor(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return predicate();
}

// ConnectionManager owns the SSE connection and the retry loop but exposes no way to shut either
// down — subscription.close() only closes the subscriber queue. Without this, closing the server
// makes the live connection fail, which schedules a fresh retry ladder (1s/3s/10s) against a dead
// server and keeps the test worker alive ~14s past the assertion. Setting the `reconnecting` flag
// is not durable, because a successful reconnect clears it again; neutralising the scheduler is.
// The proper fix is a dispose()/close() on ConnectionManager itself, which the SDK does not
// currently expose.
function stopManager(manager) {
  manager.scheduleReconnect = () => {};
  manager.reconnecting = true;
  manager.conn?.close?.();
  manager.conn = null;
}

async function settleThenTeardown(_state, manager, subscription, server) {
  stopManager(manager);
  subscription.close();
  await closeServer(server);
}

// The core contract. The server sends one event and ends the response — byte-for-byte what the
// backend's stream-lifetime cap does when it completes the Observable. A compliant SDK must open
// a replacement connection; one that treats EOF as end-of-stream would stop here and the
// consumer would never receive another event.
test('reconnects after the server cleanly ends the stream', async () => {
  const state = { holdOpen: false };
  let connections = 0;
  const { server, baseUrl } = await startServer((_req, res) => {
    connections += 1;
    res.write(`event: run.event\ndata: ${JSON.stringify({ data: { payload: { session_id: SESSION_ID } } })}\n\n`);
    // Clean EOF: no error, no socket destroy — the response simply completes.
    if (!state.holdOpen) res.end();
  });

  const manager = new ConnectionManager(baseUrl, API_KEY);
  const subscription = manager.subscribe(SESSION_ID);

  await waitFor(() => connections >= 2, CONNECT_TIMEOUT_MS);
  const observed = connections;
  await settleThenTeardown(state, manager, subscription, server);

  assert.ok(
    observed >= 2,
    `expected the SDK to reconnect after a clean EOF, but the server saw ${observed} connection(s). ` +
      'If this fails, the backend stream-lifetime cap will strand this SDK every 60-75 minutes.'
  );
});

// Distinguishes "reconnects" from "reconnects once". The cap fires repeatedly for the lifetime of
// a long-running consumer, so a single retry is not enough — the SDK has to keep re-establishing
// the stream each time the server cycles it. Note this exercises the first rung of the retry
// ladder repeatedly, not the 3s and 10s rungs: a successful connection clears `reconnecting`, so
// the next clean EOF starts the ladder again at 1s. The later rungs only apply when a reconnect
// attempt itself fails, which is a different scenario from the one under test here.
test('keeps reconnecting across repeated clean EOFs', async () => {
  const state = { holdOpen: false };
  let connections = 0;
  const { server, baseUrl } = await startServer((_req, res) => {
    connections += 1;
    res.write(`event: run.event\ndata: ${JSON.stringify({ data: { payload: { session_id: SESSION_ID } } })}\n\n`);
    if (!state.holdOpen) res.end();
  });

  const manager = new ConnectionManager(baseUrl, API_KEY);
  const subscription = manager.subscribe(SESSION_ID);

  await waitFor(() => connections >= 3, REPEAT_TIMEOUT_MS);
  const observed = connections;
  await settleThenTeardown(state, manager, subscription, server);

  assert.ok(
    observed >= 3,
    `expected repeated reconnects, but the server saw only ${observed} connection(s)`
  );
});

// Events delivered before the EOF must still reach the consumer. A reconnect that silently drops
// the final event of each cycle would be worse than no reconnect at all, because the loss would
// be invisible rather than obvious.
//
// The write is gated until the listener is registered: subscribe() starts the connection before
// the caller can attach a handler, so an ungated server could emit the event into a channel with
// no listener. The assertion would then only pass via some later reconnect, which is not what it
// claims to test.
test('delivers events received before a clean EOF', async () => {
  const state = { holdOpen: false };
  let releaseWrite;
  const listenerReady = new Promise((resolve) => {
    releaseWrite = resolve;
  });

  const { server, baseUrl } = await startServer(async (_req, res) => {
    await listenerReady;
    // Mirrors the wire shape the backend actually produces: Nest's @Sse turns
    // `{ type: "run.event", data: <blob> }` into an SSE `event:` field plus a JSON `data:` line,
    // and the SDK routes on data.data.payload.session_id. A looser payload is silently dropped
    // by onEvent, which would make this test pass or fail for the wrong reason.
    const envelope = { data: { payload: { session_id: SESSION_ID, status: 'execution.started' } } };
    res.write(`event: run.event\ndata: ${JSON.stringify(envelope)}\n\n`);
    if (!state.holdOpen) res.end();
  });

  const manager = new ConnectionManager(baseUrl, API_KEY);
  const subscription = manager.subscribe(SESSION_ID);

  const received = [];
  subscription.on('run.event', (msg) => received.push(msg));
  releaseWrite();

  await waitFor(() => received.length >= 1, CONNECT_TIMEOUT_MS);
  const observed = received.length;
  await settleThenTeardown(state, manager, subscription, server);

  assert.ok(
    observed >= 1,
    'expected a run.event delivered on the connection that was open when the listener was registered'
  );
});
