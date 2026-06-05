import test from 'node:test';
import assert from 'node:assert/strict';

import { VaultClient } from '../dist/vault/VaultClient.js';
import {
  encryptSensitiveFields
} from '../dist/vault/utils.js';

const ENCRYPTION_KEY = '0123456789abcdef'.repeat(4);

test('VaultClient.create encrypts sensitive fields and decrypts the response', async () => {
  const calls = [];

  const client = new VaultClient(async (method, path, body) => {
    calls.push({ method, path, body });
    return body;
  }, ENCRYPTION_KEY);

  const options = {
    user_name: 'user@example.com',
    password: 'super-secret',
    tfa_secret: 'totp-secret'
  };

  const result = await client.create('example.com', 'user123', options);

  assert.equal(calls.length, 1);
  const request = calls[0];
  assert.equal(request.method, 'POST');
  assert.equal(request.path, '/vault');
  assert.notEqual(request.body.user_name, options.user_name);
  assert.notEqual(request.body.password, options.password);
  assert.notEqual(request.body.tfa_secret, options.tfa_secret);

  assert.equal(result.user_name, options.user_name);
  assert.equal(result.password, options.password);
  assert.equal(result.tfa_secret, options.tfa_secret);
});

test('VaultClient.create encrypts custom proxy_value and decrypts the response', async () => {
  const calls = [];

  const client = new VaultClient(async (method, path, body) => {
    calls.push({ method, path, body });
    return body;
  }, ENCRYPTION_KEY);

  const proxyUrl = 'socks5://user:pass@proxy.example.com:1080';
  const result = await client.create('example.com', 'user123', {
    proxy_setting: 'custom',
    proxy_value: proxyUrl
  });

  assert.equal(calls[0].body.proxy_setting, 'custom');
  assert.notEqual(calls[0].body.proxy_value, proxyUrl);
  assert.equal(result.proxy_value, proxyUrl);
});

test('VaultClient.create throws if proxy_value is set without proxy_setting', async () => {
  const client = new VaultClient(async () => ({}), ENCRYPTION_KEY);

  await assert.rejects(
    client.create('example.com', 'user123', {
      proxy_value: 'socks5://user:pass@proxy.example.com:1080'
    }),
    /proxy_value requires proxy_setting/
  );
});

test('VaultClient.create leaves non-custom proxy_value as plaintext', async () => {
  const calls = [];

  const client = new VaultClient(async (method, path, body) => {
    calls.push({ method, path, body });
    return body;
  }, ENCRYPTION_KEY);

  const result = await client.create('example.com', 'user123', {
    proxy_setting: 'country',
    proxy_value: 'US'
  });

  assert.equal(calls[0].body.proxy_value, 'US');
  assert.equal(result.proxy_value, 'US');
});

test('VaultClient.create forwards concurrency, expiry, and persistence options', async () => {
  const calls = [];

  const client = new VaultClient(async (method, path, body) => {
    calls.push({ method, path, body });
    return body;
  }, ENCRYPTION_KEY);

  const options = {
    allow_multiple_sessions: true,
    prevent_concurrency_during_login: true,
    max_concurrency: 5,
    expiry_time_from_last_use: '01:00:00',
    expiry_time_from_session_data_set: '7 days 00:00:00',
    tfa_method: 'AUTHENTICATOR',
    persist_local_storage: null,
    persist_session_storage: true,
    persist_cookies: null
  };

  await client.create('example.com', 'user123', options);

  assert.equal(calls.length, 1);
  const body = calls[0].body;
  assert.equal(body.allow_multiple_sessions, true);
  assert.equal(body.prevent_concurrency_during_login, true);
  assert.equal(body.max_concurrency, 5);
  assert.equal(body.expiry_time_from_last_use, '01:00:00');
  assert.equal(body.expiry_time_from_session_data_set, '7 days 00:00:00');
  assert.equal(body.tfa_method, 'AUTHENTICATOR');
  assert.strictEqual(body.persist_local_storage, null);
  assert.strictEqual(body.persist_session_storage, true);
  assert.strictEqual(body.persist_cookies, null);
});

test('VaultClient.get decrypts entries by default', async () => {
  const encryptedEntry = await encryptSensitiveFields(
    {
      domain: 'example.com',
      permissioned_user_id: 'user123',
      user_name: 'user@example.com',
      password: 'super-secret',
      tfa_secret: 'totp-secret'
    },
    ENCRYPTION_KEY
  );

  const calls = [];
  const client = new VaultClient(async (method, path) => {
    calls.push({ method, path });
    return [encryptedEntry];
  }, ENCRYPTION_KEY);

  const result = await client.get();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].path, '/vault');

  assert.equal(result[0].user_name, 'user@example.com');
  assert.equal(result[0].password, 'super-secret');
  assert.equal(result[0].tfa_secret, 'totp-secret');
});

test('VaultClient.get respects decryptCredentials flag and query filters', async () => {
  const encryptedEntry = await encryptSensitiveFields(
    {
      domain: 'example.com',
      permissioned_user_id: 'user123',
      user_name: 'user@example.com',
      password: 'super-secret',
      tfa_secret: 'totp-secret'
    },
    ENCRYPTION_KEY
  );

  const paths = [];
  const client = new VaultClient(async (method, path) => {
    paths.push(path);
    return encryptedEntry;
  }, ENCRYPTION_KEY);

  const [result] = await client.get({
    permissioned_user_id: 'user123',
    domain: 'example.com',
    decryptCredentials: false
  });

  assert.equal(paths.length, 1);
  assert.equal(
    paths[0],
    '/vault?permissioned_user_id=user123&domain=example.com'
  );
  assert.equal(result.user_name, encryptedEntry.user_name);
  assert.equal(result.password, encryptedEntry.password);
  assert.equal(result.tfa_secret, encryptedEntry.tfa_secret);
});

test('VaultClient.update requires explicit fields and encrypts payload', async () => {
  const calls = [];
  const client = new VaultClient(async (method, path, body) => {
    calls.push({ method, path, body });
    return body;
  }, ENCRYPTION_KEY);

  const update = {
    permissioned_user_id: 'user123',
    user_name: 'user@example.com',
    password: 'super-secret',
    domain: 'example.com',
    tfa_secret: 'totp-secret'
  };

  const result = await client.update(update);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'PUT');
  assert.equal(calls[0].path, '/vault');
  assert.notEqual(calls[0].body.user_name, update.user_name);
  assert.notEqual(calls[0].body.password, update.password);
  assert.notEqual(calls[0].body.tfa_secret, update.tfa_secret);

  assert.equal(result.user_name, update.user_name);
  assert.equal(result.password, update.password);
  assert.equal(result.tfa_secret, update.tfa_secret);
});

test('VaultClient.update throws if required fields are missing', async () => {
  const client = new VaultClient(async () => {
    throw new Error('Should not be called');
  }, ENCRYPTION_KEY);

  await assert.rejects(
    () =>
      client.update({
        permissioned_user_id: 'user123',
        password: 'super-secret',
        domain: 'example.com'
      }),
    /user_name is required for vault updates/
  );
});

test('VaultClient.delete forwards delete payload unchanged', async () => {
  const calls = [];
  const client = new VaultClient(async (method, path, body) => {
    calls.push({ method, path, body });
  }, ENCRYPTION_KEY);

  const params = { domain: 'example.com', permissioned_user_id: 'user123' };
  await client.delete(params);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'DELETE');
  assert.equal(calls[0].path, '/vault');
  assert.deepEqual(calls[0].body, params);
});
