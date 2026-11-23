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

test('siteSettings.getOverrides sends the user ID and domain in the query', async () => {
  const { client, calls } = recordingClient({ id: 'e1', domain: 'example.com', overridden: [] });

  await client.siteSettings.getOverrides('user123', 'example.com');

  assert.equal(
    calls[0].path,
    '/vault/site-settings/overrides?permissioned_user_id=user123&domain=example.com'
  );
});

test('siteSettings.getOverrides without a domain throws before any request', async () => {
  const { client, calls } = recordingClient({});

  await assert.rejects(() => client.siteSettings.getOverrides('user123'), /domain is required/);
  assert.equal(calls.length, 0);
});

test('siteSettings.clearOverrides sends the user ID, domain and keys with PATCH', async () => {
  const { client, calls } = recordingClient({ id: 'e1', domain: 'example.com', overridden: [] });

  await client.siteSettings.clearOverrides({
    permissioned_user_id: 'user123',
    domain: 'example.com',
    keys: ['max_concurrency', 'persist_cookies']
  });

  assert.deepEqual(calls[0], {
    method: 'PATCH',
    path: '/vault/site-settings/overrides',
    body: {
      permissioned_user_id: 'user123',
      domain: 'example.com',
      keys: ['max_concurrency', 'persist_cookies']
    }
  });
});

test('siteSettings.clearOverrides without a domain throws before any request', async () => {
  const { client, calls } = recordingClient({});

  await assert.rejects(
    () => client.siteSettings.clearOverrides({ permissioned_user_id: 'user123', keys: ['max_concurrency'] }),
    /domain is required/
  );
  assert.equal(calls.length, 0);
});

test('siteSettings.clearOverrides rejects an empty keys list before any request', async () => {
  const { client, calls } = recordingClient({});

  await assert.rejects(
    () => client.siteSettings.clearOverrides({ permissioned_user_id: 'user123', domain: 'example.com', keys: [] }),
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
    domain: 'example.com',
    user_name: 'u',
    password: 'p',
    persist_cookies: true,
    pinned_settings: ['persist_cookies', 'login_workflow_id']
  });

  assert.deepEqual(calls[0].body.pinned_settings, ['persist_cookies', 'login_workflow_id']);
});

test('VaultClient.update omits pinned_settings when absent or empty', async () => {
  const { client, calls } = recordingClient(body => ({ id: 'e1', ...body }));

  await client.update({ permissioned_user_id: 'user123', domain: 'example.com', user_name: 'u', password: 'p' });
  await client.update({ permissioned_user_id: 'user123', domain: 'example.com', user_name: 'u', password: 'p', pinned_settings: [] });

  assert.equal('pinned_settings' in calls[0].body, false);
  assert.equal('pinned_settings' in calls[1].body, false);
});
