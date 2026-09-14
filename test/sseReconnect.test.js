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

// Longest first-retry delay the SDK uses is 1000ms; allow margin without making the suite slow.
const RECONNECT_WINDOW_MS = 2500;

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

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// The core contract. The server sends one event and ends the response — byte-for-byte what the
// backend's stream-lifetime cap does when it completes the Observable. A compliant SDK must open
// a replacement connection; one that treats EOF as end-of-stream would stop here and the
// consumer would never receive another event.
test('reconnects after the server cleanly ends the stream', async () => {
  let connections = 0;
  const { server, baseUrl } = await startServer((_req, res) => {
    connections += 1;
    res.write(`data: ${JSON.stringify({ event: 'tick', session_id: SESSION_ID })}\n\n`);
    // Clean EOF: no error, no socket destroy — the response simply completes.
    res.end();
  });

  const manager = new ConnectionManager(baseUrl, API_KEY);
  const subscription = manager.subscribe(SESSION_ID);

  await wait(RECONNECT_WINDOW_MS);

  subscription.close();
  await closeServer(server);

  assert.ok(
    connections >= 2,
    `expected the SDK to reconnect after a clean EOF, but the server saw ${connections} connection(s). ` +
      'If this fails, the backend stream-lifetime cap will strand this SDK every 60-75 minutes.'
  );
});

// Distinguishes "reconnects" from "reconnects once". The cap fires repeatedly for the lifetime of
// a long-running consumer, so a single retry is not enough — the SDK has to keep re-establishing
// the stream each time the server cycles it.
test('keeps reconnecting across repeated clean EOFs', async () => {
  let connections = 0;
  const { server, baseUrl } = await startServer((_req, res) => {
    connections += 1;
    res.write(`data: ${JSON.stringify({ event: 'tick', session_id: SESSION_ID })}\n\n`);
    res.end();
  });

  const manager = new ConnectionManager(baseUrl, API_KEY);
  const subscription = manager.subscribe(SESSION_ID);

  // Long enough to cover the SDK's [1s, 3s, 10s] retry ladder more than once.
  await wait(6000);

  subscription.close();
  await closeServer(server);

  assert.ok(
    connections >= 3,
    `expected repeated reconnects, but the server saw only ${connections} connection(s)`
  );
});

// Events delivered before the EOF must still reach the consumer. A reconnect that silently drops
// the final event of each cycle would be worse than no reconnect at all, because the loss would
// be invisible rather than obvious.
test('delivers events received before a clean EOF', async () => {
  const { server, baseUrl } = await startServer((_req, res) => {
    // Mirrors the wire shape the backend actually produces: Nest's @Sse turns
    // `{ type: "run.event", data: <blob> }` into an SSE `event:` field plus a JSON `data:` line,
    // and the SDK routes on data.data.payload.session_id. A looser payload is silently dropped
    // by onEvent, which would make this test pass or fail for the wrong reason.
    const envelope = { data: { payload: { session_id: SESSION_ID, status: 'execution.started' } } };
    res.write(`event: run.event\ndata: ${JSON.stringify(envelope)}\n\n`);
    res.end();
  });

  const manager = new ConnectionManager(baseUrl, API_KEY);
  const subscription = manager.subscribe(SESSION_ID);

  const received = [];
  subscription.on('run.event', (msg) => received.push(msg));

  await wait(RECONNECT_WINDOW_MS);

  subscription.close();
  await closeServer(server);

  assert.ok(
    received.length >= 1,
    'expected at least one run.event to be delivered before the stream was cycled'
  );
});
