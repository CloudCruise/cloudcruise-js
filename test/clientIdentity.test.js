import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';

import { CloudCruise } from '../dist/index.js';
import { ConnectionManager } from '../dist/utils/connectionManager.js';

const API_KEY = 'sk_test_example';
const ENCRYPTION_KEY = '0123456789abcdef'.repeat(4);
const { version: PACKAGE_VERSION } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
);

// Agent detection reads process.env by reference, so the environment is cleared and restored
// in place: the suite itself may run inside a coding agent.
const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

beforeEach(() => {
  for (const key of Object.keys(process.env)) delete process.env[key];
});

afterEach(() => {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, originalEnv);
  globalThis.fetch = originalFetch;
});

async function headersOfRestRequest() {
  let captured;
  globalThis.fetch = async (_url, init) => {
    captured = new Headers(init.headers);
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const client = new CloudCruise({ apiKey: API_KEY, encryptionKey: ENCRYPTION_KEY });
  await client.workflows.getAllWorkflows();
  return captured;
}

// The backend counts API usage per calling surface and client version from this header;
// without it SDK traffic is indistinguishable from raw API calls.
test('REST requests identify the JS SDK and its package version in X-CloudCruise-Client', async () => {
  const headers = await headersOfRestRequest();

  assert.equal(headers.get('x-cloudcruise-client'), `sdk-js/${PACKAGE_VERSION}`);
});

// The backend breaks SDK usage down by the coding agent driving it; std-env recognizes Claude
// Code from the CLAUDECODE variable it sets in the shells it runs commands in.
test('REST requests send X-CloudCruise-Agent: claude when run by Claude Code', async () => {
  process.env.CLAUDECODE = '1';

  const headers = await headersOfRestRequest();

  assert.equal(headers.get('x-cloudcruise-agent'), 'claude');
});

// A plain process is not a coding agent; the header must be absent so the backend counts the
// request under agent "none".
test('REST requests omit X-CloudCruise-Agent when no coding agent is detected', async () => {
  const headers = await headersOfRestRequest();

  assert.equal(headers.has('x-cloudcruise-agent'), false);
});

// Replit sets REPL_ID in every shell, including the ones humans type into, so it alone does
// not prove an agent is running the SDK.
test('REST requests omit X-CloudCruise-Agent when only Replit\'s REPL_ID is set', async () => {
  process.env.REPL_ID = 'repl-1';

  const headers = await headersOfRestRequest();

  assert.equal(headers.has('x-cloudcruise-agent'), false);
});

// Run events stream over a separate SSE connection that does not go through the REST request
// path; it is API traffic too and must carry the same identification.
test('the run-events SSE connection identifies the JS SDK and the coding agent', async () => {
  process.env.CLAUDECODE = '1';
  globalThis.fetch = originalFetch;
  let received;
  const server = http.createServer((req, res) => {
    received = req.headers;
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const manager = new ConnectionManager(`http://127.0.0.1:${server.address().port}`, API_KEY);
  const subscription = manager.subscribe('sess_identity_test');

  try {
    const deadline = Date.now() + 15000;
    while (!received && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 25));
    }
    assert.equal(received?.['x-cloudcruise-client'], `sdk-js/${PACKAGE_VERSION}`);
    assert.equal(received?.['x-cloudcruise-agent'], 'claude');
  } finally {
    manager.scheduleReconnect = () => {};
    manager.reconnecting = true;
    manager.conn?.close?.();
    subscription.close();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});
