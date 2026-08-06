import test from 'node:test';
import assert from 'node:assert/strict';

import { CloudCruise } from '../dist/index.js';

const API_KEY = 'sk_test_example';
const ENCRYPTION_KEY = '0123456789abcdef'.repeat(4);

function clearCloudCruiseEnv() {
  delete process.env.CLOUDCRUISE_API_KEY;
  delete process.env.CLOUDCRUISE_ENCRYPTION_KEY;
  delete process.env.CLOUDCRUISE_BASE_URL;
}

test('CloudCruise rejects an env-sourced custom baseUrl', () => {
  clearCloudCruiseEnv();
  process.env.CLOUDCRUISE_BASE_URL = 'http://127.0.0.1:8089';

  assert.throws(
    () => new CloudCruise({ apiKey: API_KEY, encryptionKey: ENCRYPTION_KEY }),
    /Refusing to send CloudCruise API key to unapproved baseUrl "http:\/\/127\.0\.0\.1:8089"/
  );

  clearCloudCruiseEnv();
});

test('CloudCruise rejects an explicit custom baseUrl', () => {
  clearCloudCruiseEnv();

  assert.throws(
    () =>
      new CloudCruise({
        apiKey: API_KEY,
        encryptionKey: ENCRYPTION_KEY,
        baseUrl: 'https://attacker.example.com',
      }),
    /Refusing to send CloudCruise API key to unapproved baseUrl "https:\/\/attacker\.example\.com"/
  );
});

test('CloudCruise sends cc-key to the default API host', async () => {
  clearCloudCruiseEnv();

  const originalFetch = globalThis.fetch;
  let capturedUrl;
  let capturedHeaders;

  globalThis.fetch = async (url, init) => {
    capturedUrl = String(url);
    capturedHeaders = init.headers;
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const client = new CloudCruise({ apiKey: API_KEY, encryptionKey: ENCRYPTION_KEY });
    await client.workflows.getAllWorkflows();

    assert.equal(capturedUrl, 'https://api.cloudcruise.com/workflows');
    assert.equal(capturedHeaders['cc-key'], API_KEY);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('CloudCruise requires HTTPS for the default API host', () => {
  clearCloudCruiseEnv();

  assert.throws(
    () =>
      new CloudCruise({
        apiKey: API_KEY,
        encryptionKey: ENCRYPTION_KEY,
        baseUrl: 'http://api.cloudcruise.com',
      }),
    /The default CloudCruise API host requires https:/
  );
});


test('CloudCruise accepts the staging baseUrl as an allowed override', async () => {
  clearCloudCruiseEnv();

  const originalFetch = globalThis.fetch;
  let capturedUrl;

  globalThis.fetch = async (url) => {
    capturedUrl = String(url);
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const client = new CloudCruise({
      apiKey: API_KEY,
      encryptionKey: ENCRYPTION_KEY,
      baseUrl: 'https://staging-api.cloudcruise.app',
    });
    await client.workflows.getAllWorkflows();
    assert.equal(capturedUrl, 'https://staging-api.cloudcruise.app/workflows');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('CloudCruise still rejects attacker URLs after staging is added', () => {
  clearCloudCruiseEnv();
  assert.throws(
    () =>
      new CloudCruise({
        apiKey: API_KEY,
        encryptionKey: ENCRYPTION_KEY,
        baseUrl: 'https://attacker.example.com',
      }),
    /Refusing to send CloudCruise API key to unapproved baseUrl/
  );
});
