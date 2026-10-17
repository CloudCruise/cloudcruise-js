import test from 'node:test';
import assert from 'node:assert/strict';

import { RunsClient } from '../dist/index.js';

function makeClient() {
  const calls = [];
  const fakeMakeRequest = async (method, path, body) => {
    calls.push({ method, path, body });
    return undefined;
  };
  const stubConnectionManager = { subscribe: () => ({ close: () => {} }) };
  const client = new RunsClient(stubConnectionManager, fakeMakeRequest);
  return { client, calls };
}

test('submitDecision posts {chosen_option, save_decision:false} by default', async () => {
  const { client, calls } = makeClient();
  await client.submitDecision('sess-123', 'Reschedule');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].path, '/run/sess-123/new_input_variables');
  assert.deepEqual(calls[0].body, { chosen_option: 'Reschedule', save_decision: false });
});

test('submitDecision sets save_decision:true when { save: true }', async () => {
  const { client, calls } = makeClient();
  await client.submitDecision('sess-456', 'Reschedule', { save: true });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body, { chosen_option: 'Reschedule', save_decision: true });
});

test('submitDecision and submitInputVariables share the endpoint but XOR bodies', async () => {
  const { client, calls } = makeClient();
  await client.submitDecision('s1', 'Yes');
  await client.submitInputVariables('s1', { MEMBER_ID: 'ABC' });
  assert.equal(calls.length, 2);
  assert.ok('chosen_option' in calls[0].body && !('input_variables' in calls[0].body));
  assert.ok('input_variables' in calls[1].body && !('chosen_option' in calls[1].body));
});
