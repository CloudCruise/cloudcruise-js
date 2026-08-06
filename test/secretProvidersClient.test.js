import test from 'node:test';
import assert from 'node:assert/strict';

import { SecretProvidersClient } from '../dist/secretProviders/SecretProvidersClient.js';

test('SecretProvidersClient.list fetches secret providers', async () => {
  const calls = [];
  const client = new SecretProvidersClient(async (method, path, body) => {
    calls.push({ method, path, body });
    return [
      {
        id: 'provider-1',
        provider_type: '1password',
        name: 'Acme 1Password',
        cache_ttl_seconds: 300
      }
    ];
  });

  const providers = await client.list();

  assert.deepEqual(calls, [
    { method: 'GET', path: '/secret-providers', body: undefined }
  ]);
  assert.equal(providers[0].id, 'provider-1');
  assert.equal(providers[0].provider_type, '1password');
});

test('SecretProvidersClient.listItems fetches provider items', async () => {
  const calls = [];
  const client = new SecretProvidersClient(async (method, path, body) => {
    calls.push({ method, path, body });
    return [
      {
        id: 'item-1',
        title: 'Acme Prod',
        vaultName: 'Automation',
        ref: 'op://vault/item-1'
      }
    ];
  });

  const items = await client.listItems('provider-1');

  assert.deepEqual(calls, [
    {
      method: 'GET',
      path: '/secret-providers/provider-1/items',
      body: undefined
    }
  ]);
  assert.equal(items[0].ref, 'op://vault/item-1');
});

test('SecretProvidersClient.listItems encodes provider id in path', async () => {
  const paths = [];
  const client = new SecretProvidersClient(async (method, path) => {
    paths.push(path);
    return [];
  });

  await client.listItems('provider/with space');

  assert.equal(paths[0], '/secret-providers/provider%2Fwith%20space/items');
});

test('SecretProvidersClient.listItems requires provider id', async () => {
  const client = new SecretProvidersClient(async () => []);

  await assert.rejects(() => client.listItems(''), /secretProviderId is required/);
});
