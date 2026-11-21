import test from 'node:test';
import assert from 'node:assert/strict';

import { VaultClient } from '../dist/vault/VaultClient.js';

const ENCRYPTION_KEY = '0123456789abcdef'.repeat(4);

function recordingClient(response) {
  const calls = [];
  const client = new VaultClient(async (method, path, body) => {
    calls.push({ method, path, body });
    return typeof response === 'function' ? response(body) : response;
  }, ENCRYPTION_KEY);
  return { client, calls };
}

test('VaultClient.create without a domain omits domain from the request body', async () => {
  const { client, calls } = recordingClient(body => ({ id: 'e1', domain: null, ...body }));

  const entry = await client.create(undefined, 'user123', { user_name: 'u', password: 'p' });

  assert.equal(calls[0].method, 'POST');
  assert.equal('domain' in calls[0].body, false);
  assert.equal(entry.domain, null);
});

test('VaultClient.update without a domain omits domain from the request body', async () => {
  const { client, calls } = recordingClient(body => ({ id: 'e1', domain: null, ...body }));

  await client.update({ permissioned_user_id: 'user123', user_name: 'u', password: 'p' });

  assert.equal(calls[0].method, 'PUT');
  assert.equal('domain' in calls[0].body, false);
  assert.equal(calls[0].body.permissioned_user_id, 'user123');
});

test('VaultClient.update still sends a given domain', async () => {
  const { client, calls } = recordingClient(body => ({ id: 'e1', ...body }));

  await client.update({ permissioned_user_id: 'user123', domain: 'example.com', user_name: 'u', password: 'p' });

  assert.equal(calls[0].body.domain, 'example.com');
});

test('VaultClient.delete without a domain sends only the user ID', async () => {
  const { client, calls } = recordingClient(undefined);

  await client.delete({ permissioned_user_id: 'user123' });

  assert.deepEqual(calls[0], {
    method: 'DELETE',
    path: '/vault',
    body: { permissioned_user_id: 'user123' }
  });
});

test('VaultClient.delete with a domain sends both', async () => {
  const { client, calls } = recordingClient(undefined);

  await client.delete({ permissioned_user_id: 'user123', domain: 'example.com' });

  assert.deepEqual(calls[0].body, { permissioned_user_id: 'user123', domain: 'example.com' });
});

test('VaultClient.get with only a user ID sends no domain parameter and returns the single entry', async () => {
  const { client, calls } = recordingClient({ id: 'e1', domain: null, permissioned_user_id: 'user123' });

  const entries = await client.get({ permissioned_user_id: 'user123' });

  assert.equal(calls[0].path, '/vault?permissioned_user_id=user123');
  assert.equal(entries.length, 1);
  assert.equal(entries[0].domain, null);
});

test('VaultClient.getTfaCode accepts a user ID alone, with options as the second argument', async () => {
  const { client, calls } = recordingClient({ type: 'email', code: '123456' });

  await client.getTfaCode('user123', { method: 'EMAIL' });

  assert.equal(calls[0].path, '/vault/tfa-code?permissioned_user_id=user123&method=EMAIL');
});

test('VaultClient.getTfaCode with a null domain omits the domain parameter', async () => {
  const { client, calls } = recordingClient({ type: 'email', code: '123456' });

  await client.getTfaCode('user123', null, { method: 'EMAIL' });

  assert.equal(calls[0].path, '/vault/tfa-code?permissioned_user_id=user123&method=EMAIL');
});

test('VaultClient.getTfaCode with a domain keeps the existing query', async () => {
  const { client, calls } = recordingClient({ type: 'authenticator', code: '123456' });

  await client.getTfaCode('user123', 'example.com');

  assert.equal(calls[0].path, '/vault/tfa-code?permissioned_user_id=user123&domain=example.com');
});

test('siteSettings.list reads GET /vault/site-settings', async () => {
  const sites = [{ id: 's1', domain: 'example.com', settings: {}, entry_count: 2, overrides: {} }];
  const { client, calls } = recordingClient(sites);

  const result = await client.siteSettings.list();

  assert.deepEqual(calls[0], { method: 'GET', path: '/vault/site-settings', body: undefined });
  assert.deepEqual(result, sites);
});

test('siteSettings.update sends the domain and settings, including null to clear a default, with PATCH', async () => {
  const { client, calls } = recordingClient({ id: 's1', domain: 'example.com' });

  await client.siteSettings.update({ domain: 'example.com', max_concurrency: 2, persist_cookies: null });

  assert.deepEqual(calls[0], {
    method: 'PATCH',
    path: '/vault/site-settings',
    body: { domain: 'example.com', max_concurrency: 2, persist_cookies: null }
  });
});

test('siteSettings.update without a domain throws before any request', async () => {
  const { client, calls } = recordingClient({});

  await assert.rejects(() => client.siteSettings.update({ max_concurrency: 1 }), /domain is required/);
  assert.equal(calls.length, 0);
});

test('siteSettings.listEntries puts the encoded domain in the query', async () => {
  const { client, calls } = recordingClient([]);

  await client.siteSettings.listEntries('example.com');

  assert.deepEqual(calls[0], {
    method: 'GET',
    path: '/vault/site-settings/entries?domain=example.com',
    body: undefined
  });
});

test('siteSettings.applyDefaults sends domain and optional entry_ids with PATCH', async () => {
  const { client, calls } = recordingClient({ id: 's1' });

  await client.siteSettings.applyDefaults({ domain: 'example.com' });
  await client.siteSettings.applyDefaults({ domain: 'example.com', entry_ids: ['id-1'] });

  assert.equal(calls[0].method, 'PATCH');
  assert.equal(calls[0].path, '/vault/site-settings/entries');
  assert.deepEqual(calls[0].body, { domain: 'example.com' });
  assert.deepEqual(calls[1].body, { domain: 'example.com', entry_ids: ['id-1'] });
});

test('siteSettings.getOverrides sends the user ID and only a given domain', async () => {
  const { client, calls } = recordingClient({ id: 'e1', domain: null, overridden: [] });

  await client.siteSettings.getOverrides('user123');
  await client.siteSettings.getOverrides('user123', 'example.com');

  assert.equal(calls[0].path, '/vault/site-settings/overrides?permissioned_user_id=user123');
  assert.equal(
    calls[1].path,
    '/vault/site-settings/overrides?permissioned_user_id=user123&domain=example.com'
  );
});

test('siteSettings.clearOverrides sends the user ID and keys, and omits an unset domain', async () => {
  const { client, calls } = recordingClient({ id: 'e1', domain: 'example.com', overridden: [] });

  await client.siteSettings.clearOverrides({
    permissioned_user_id: 'user123',
    keys: ['max_concurrency', 'persist_cookies']
  });

  assert.deepEqual(calls[0], {
    method: 'PATCH',
    path: '/vault/site-settings/overrides',
    body: { permissioned_user_id: 'user123', keys: ['max_concurrency', 'persist_cookies'] }
  });
});

test('siteSettings.clearOverrides rejects an empty keys list before any request', async () => {
  const { client, calls } = recordingClient({});

  await assert.rejects(
    () => client.siteSettings.clearOverrides({ permissioned_user_id: 'user123', keys: [] }),
    /at least one setting/
  );
  assert.equal(calls.length, 0);
});

test('VaultClient.create sends pinned_settings when non-empty', async () => {
  const { client, calls } = recordingClient(body => ({ id: 'e1', ...body }));

  await client.create('example.com', 'user123', {
    user_name: 'u',
    password: 'p',
    max_concurrency: 2,
    pinned_settings: ['max_concurrency']
  });

  assert.deepEqual(calls[0].body.pinned_settings, ['max_concurrency']);
});

test('VaultClient.create omits pinned_settings when absent or empty', async () => {
  const { client, calls } = recordingClient(body => ({ id: 'e1', ...body }));

  await client.create('example.com', 'user123', { user_name: 'u', password: 'p' });
  await client.create('example.com', 'user123', { user_name: 'u', password: 'p', pinned_settings: [] });

  assert.equal('pinned_settings' in calls[0].body, false);
  assert.equal('pinned_settings' in calls[1].body, false);
});

test('VaultClient.update sends pinned_settings when non-empty', async () => {
  const { client, calls } = recordingClient(body => ({ id: 'e1', ...body }));

  await client.update({
    permissioned_user_id: 'user123',
    user_name: 'u',
    password: 'p',
    persist_cookies: true,
    pinned_settings: ['persist_cookies', 'login_workflow_id']
  });

  assert.deepEqual(calls[0].body.pinned_settings, ['persist_cookies', 'login_workflow_id']);
});

test('VaultClient.update omits pinned_settings when absent or empty', async () => {
  const { client, calls } = recordingClient(body => ({ id: 'e1', ...body }));

  await client.update({ permissioned_user_id: 'user123', user_name: 'u', password: 'p' });
  await client.update({ permissioned_user_id: 'user123', user_name: 'u', password: 'p', pinned_settings: [] });

  assert.equal('pinned_settings' in calls[0].body, false);
  assert.equal('pinned_settings' in calls[1].body, false);
});
