import test from 'node:test';
import assert from 'node:assert/strict';

import { RunsClient, EventType } from '../dist/index.js';

function makeClient(response) {
  const calls = [];
  const fakeMakeRequest = async (method, path, body) => {
    calls.push({ method, path, body });
    return response;
  };
  const stubConnectionManager = { subscribe: () => ({ close: () => {} }) };
  const client = new RunsClient(stubConnectionManager, fakeMakeRequest);
  return { client, calls };
}

test('respondToDecision posts decision_id and the answer to the decision respond endpoint', async () => {
  const { client, calls } = makeClient({ status: 'accepted', decision_id: 'dec-1' });
  const result = await client.respondToDecision('sess-1', 'dec-1', {
    values: { choice: 'keep' },
    text: 'Use the newest',
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].path, '/run/sess-1/decision/respond');
  assert.deepEqual(calls[0].body, {
    decision_id: 'dec-1',
    values: { choice: 'keep' },
    text: 'Use the newest',
  });
  assert.deepEqual(result, { status: 'accepted', decision_id: 'dec-1' });
});

test('respondToDecision sends a directive alone without values or text', async () => {
  const { client, calls } = makeClient({ status: 'accepted', decision_id: 'dec-2' });
  await client.respondToDecision('sess-2', 'dec-2', { directive: 'requeue' });
  assert.deepEqual(calls[0].body, { decision_id: 'dec-2', directive: 'requeue' });
});

test('the decision events use the names the API sends', () => {
  assert.equal(EventType.AgentDecisionRequested, 'agent.decision_requested');
  assert.equal(EventType.AgentDecisionAnswered, 'agent.decision_answered');
});
