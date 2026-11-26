import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { CloudCruise, VerificationError } from '../dist/index.js';

const API_KEY = 'sk_test_example';

function clearCloudCruiseEnv() {
  delete process.env.CLOUDCRUISE_API_KEY;
  delete process.env.CLOUDCRUISE_ENCRYPTION_KEY;
  delete process.env.CLOUDCRUISE_BASE_URL;
}

function recordFetch(respond) {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body) : undefined });
    return new Response(JSON.stringify(respond(String(url))), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { calls, restore: () => { globalThis.fetch = originalFetch; } };
}

test('a client without an encryptionKey can be created, because only the vault encrypts', () => {
  clearCloudCruiseEnv();
  assert.doesNotThrow(() => new CloudCruise({ apiKey: API_KEY }));
});

test('the vault refuses to write without an encryptionKey, naming the key, before any request is sent', async () => {
  clearCloudCruiseEnv();
  const { calls, restore } = recordFetch(() => ({}));
  try {
    const client = new CloudCruise({ apiKey: API_KEY });
    await assert.rejects(
      () => client.vault.create('https://example.com', 'user-1', { user_name: 'a', password: 'b' }),
      /Missing encryptionKey/
    );
    assert.equal(calls.length, 0);
  } finally {
    restore();
  }
});

test('vault.update and a decrypting vault.get refuse without an encryptionKey before any request is sent', async () => {
  clearCloudCruiseEnv();
  const { calls, restore } = recordFetch(() => ({}));
  try {
    const client = new CloudCruise({ apiKey: API_KEY });
    await assert.rejects(
      () => client.vault.update({ domain: 'https://example.com', permissioned_user_id: 'user-1', user_name: 'a', password: 'b' }),
      /Missing encryptionKey/
    );
    await assert.rejects(() => client.vault.get({ domain: 'https://example.com' }), /Missing encryptionKey/);
    assert.equal(calls.length, 0);
  } finally {
    restore();
  }
});

test('vault.get with decryptCredentials false works without an encryptionKey and returns the stored values unchanged', async () => {
  clearCloudCruiseEnv();
  const stored = [{ domain: 'https://example.com', permissioned_user_id: 'user-1', password: 'ciphertext' }];
  const { restore } = recordFetch(() => stored);
  try {
    const client = new CloudCruise({ apiKey: API_KEY });
    assert.deepEqual(await client.vault.get({ decryptCredentials: false }), stored);
  } finally {
    restore();
  }
});

test('runs.create sends only POST /run, drops a caller-supplied client_id, opens no event stream and returns the session id', async () => {
  clearCloudCruiseEnv();
  const { calls, restore } = recordFetch(() => ({ session_id: 'session-1' }));
  try {
    const client = new CloudCruise({ apiKey: API_KEY });
    const result = await client.runs.create({
      client_id: 'caller-provided-client',
      workflow_id: 'wf-1',
      run_input_variables: { USER: 'user-1' },
      webhook: { url: 'https://example.com/hook', event_types_subscribed: ['execution.success'], secret: 's' },
    });
    assert.deepEqual(result, { session_id: 'session-1' });
    assert.deepEqual(calls.map((c) => `${c.method} ${new URL(c.url).pathname}`), ['POST /run']);
    assert.equal(calls[0].body.client_id, undefined);
  } finally {
    restore();
  }
});

test('verifySignature answers a malformed signature header with a 401 VerificationError instead of crashing', () => {
  const client = new CloudCruise({ apiKey: API_KEY });
  const body = JSON.stringify({ event: 'execution.success', expires_at: Math.floor(Date.now() / 1000) + 60 });
  for (const header of ['no-equals-sign', 'Sha256=not-hex-zz', `Sha256=${'zz'.repeat(32)}`]) {
    assert.throws(
      () => client.webhook.verifySignature(body, header, 'secret'),
      (error) => error instanceof VerificationError && error.statusCode === 401
    );
  }
});

test('verifySignature still accepts a correctly signed body', () => {
  const client = new CloudCruise({ apiKey: API_KEY });
  const body = JSON.stringify({ event: 'execution.success', expires_at: Math.floor(Date.now() / 1000) + 60 });
  const signature = crypto.createHmac('sha256', 'secret').update(body).digest('hex');
  assert.equal(client.webhook.verifySignature(body, `Sha256=${signature}`, 'secret').event, 'execution.success');
});
