import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { RunsClient } from '../dist/index.js';

const contract = JSON.parse(readFileSync(new URL('./contract/api-contract.json', import.meta.url), 'utf8'));

function makeClient(response) {
  const calls = [];
  const fakeMakeRequest = async (method, path, body) => {
    calls.push({ method, path, body });
    return response;
  };
  const stubConnectionManager = { subscribe: () => ({ close: () => {} }) };
  return { client: new RunsClient(stubConnectionManager, fakeMakeRequest), calls };
}

test('respondToDecision posts decision_id and the answer to the decision answer endpoint the API serves', async () => {
  const { client, calls } = makeClient({ status: 'accepted', decision_id: 'dec-1' });
  const result = await client.respondToDecision('sess-1', 'dec-1', {
    values: { choice: 'keep' },
    text: 'Use the newest',
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].path, '/run/sess-1/decision/respond');
  assert.ok(contract.paths.includes('/run/{session_id}/decision/respond'));
  assert.deepEqual(calls[0].body, { decision_id: 'dec-1', values: { choice: 'keep' }, text: 'Use the newest' });
  assert.deepEqual(result, { status: 'accepted', decision_id: 'dec-1' });
});

test('respondToDecision sends a directive alone, and every body key is one the API accepts', async () => {
  const { client, calls } = makeClient({ status: 'accepted', decision_id: 'dec-2' });
  await client.respondToDecision('sess-2', 'dec-2', { directive: 'requeue' });
  assert.deepEqual(calls[0].body, { decision_id: 'dec-2', directive: 'requeue' });
  const accepted = Object.keys(contract.decision_respond_request.properties);
  for (const key of Object.keys(calls[0].body)) {
    assert.ok(accepted.includes(key), `the API accepts ${key}`);
  }
});

test('getPendingDecision reads the run\'s pending decision and returns the API response unchanged', async () => {
  const response = {
    decision: {
      decision_id: 'dec-1',
      answer_by: '2026-11-04T20:00:00.000Z',
      question: 'Which record should be kept?',
      context: 'Two matching records',
      fields: [{ id: 'choice', label: 'Record', type: 'single_choice', options: [{ id: 'keep', label: 'Keep' }] }],
      free_text: true,
      respond_url: 'https://api.example.test/run/sess-1/decision/respond',
    },
    answered_decision_id: null,
  };
  const { client, calls } = makeClient(response);
  const result = await client.getPendingDecision('sess-1');
  assert.deepEqual(calls, [{ method: 'GET', path: '/run/sess-1/decision/pending', body: undefined }]);
  assert.deepEqual(result, response);
});

test('getPendingDecision passes through a run with nothing pending and the id of an answered decision', async () => {
  const { client } = makeClient({ decision: null, answered_decision_id: 'dec-1' });
  assert.deepEqual(await client.getPendingDecision('sess-1'), { decision: null, answered_decision_id: 'dec-1' });
});
