import test from 'node:test';
import assert from 'node:assert/strict';

import { RunsClient } from '../dist/index.js';

function makeClient() {
  const calls = [];
  const fakeMakeRequest = async (method, path, body) => {
    calls.push({ method, path, body });
    return { session_id: 'sess-1' };
  };
  const stubConnectionManager = {
    ensureClientId: async () => 'client-1',
    connectIfNeeded: async () => {},
    subscribe: () => ({ on: () => () => {}, close: () => {} }),
  };
  const client = new RunsClient(stubConnectionManager, fakeMakeRequest);
  return { client, calls };
}

function runPosts(calls) {
  return calls.filter((c) => c.method === 'POST' && c.path === '/run');
}

const baseRequest = { workflow_id: 'wf-1', run_input_variables: {} };

test('start sends workflow_version in the POST /run body when the caller sets it', async () => {
  const { client, calls } = makeClient();
  const handle = await client.start({ ...baseRequest, workflow_version: '^1.2.0' });
  handle.close();
  const [post] = runPosts(calls);
  assert.equal(post.body.workflow_version, '^1.2.0');
  assert.ok(!('workflow_branch_id' in post.body));
});

test('start sends workflow_branch_id in the POST /run body when the caller sets it', async () => {
  const { client, calls } = makeClient();
  const handle = await client.start({ ...baseRequest, workflow_branch_id: 'branch-uuid' });
  handle.close();
  const [post] = runPosts(calls);
  assert.equal(post.body.workflow_branch_id, 'branch-uuid');
  assert.ok(!('workflow_version' in post.body));
});

// Backends without version pinning validate with forbidNonWhitelisted and reject
// any unknown key with 400, even when its value is null. An unpinned run must
// therefore produce a body with neither key so it keeps working against them.
test('start omits both pin keys from the POST /run body when the caller does not set them', async () => {
  const { client, calls } = makeClient();
  const handle = await client.start({ ...baseRequest });
  handle.close();
  const [post] = runPosts(calls);
  assert.ok(!('workflow_version' in post.body));
  assert.ok(!('workflow_branch_id' in post.body));
  assert.equal(post.body.client_id, 'client-1');
});

// Same forbidNonWhitelisted reason as above: JSON.stringify keeps null-valued
// keys (it only drops undefined), so null and undefined pins must be stripped.
test('start strips pin keys explicitly set to null or undefined from the POST /run body', async () => {
  const { client, calls } = makeClient();
  const handle = await client.start({
    ...baseRequest,
    workflow_version: null,
    workflow_branch_id: undefined,
  });
  handle.close();
  const [post] = runPosts(calls);
  assert.ok(!('workflow_version' in post.body));
  assert.ok(!('workflow_branch_id' in post.body));
  assert.ok(!JSON.stringify(post.body).includes('workflow_version'));
});

// The backend accepts at most one pin and answers 400 otherwise; the SDK rejects
// the combination up front so no request is sent and the error names the fields.
test('start throws without sending a request when both workflow_version and workflow_branch_id are set', async () => {
  const { client, calls } = makeClient();
  await assert.rejects(
    client.start({ ...baseRequest, workflow_version: '1.2.3', workflow_branch_id: 'branch-uuid' }),
    /Only one of workflow_version, workflow_branch_id may be provided/,
  );
  assert.equal(calls.length, 0);
});

// A null pin counts as unset, so pairing it with a real pin is a valid single-pin request.
test('start accepts workflow_version alongside a null workflow_branch_id and sends only workflow_version', async () => {
  const { client, calls } = makeClient();
  const handle = await client.start({ ...baseRequest, workflow_version: '1.x', workflow_branch_id: null });
  handle.close();
  const [post] = runPosts(calls);
  assert.equal(post.body.workflow_version, '1.x');
  assert.ok(!('workflow_branch_id' in post.body));
});
