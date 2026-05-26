import test from 'node:test';
import assert from 'node:assert/strict';

import { RunsClient, EventType } from '../dist/index.js';

function makeClient() {
  const calls = [];
  const fakeMakeRequest = async (method, path, body) => {
    calls.push({ method, path, body });
    return undefined;
  };
  // ConnectionManager isn't used for the methods we test; pass a stub.
  const stubConnectionManager = { subscribe: () => ({ close: () => {} }) };
  const client = new RunsClient(stubConnectionManager, fakeMakeRequest);
  return { client, calls };
}

test('submitModalAction posts {modal_action: id} to new_input_variables', async () => {
  const { client, calls } = makeClient();
  await client.submitModalAction('sess-123', 'proceed_with_selected_patient');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].path, '/run/sess-123/new_input_variables');
  assert.deepEqual(calls[0].body, { modal_action: 'proceed_with_selected_patient' });
});

test('submitInputVariables posts {input_variables: dict} to new_input_variables', async () => {
  const { client, calls } = makeClient();
  await client.submitInputVariables('sess-456', { MEMBER_ID: 'ABC123' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/run/sess-456/new_input_variables');
  assert.deepEqual(calls[0].body, { input_variables: { MEMBER_ID: 'ABC123' } });
});

test('submitModalAction and submitInputVariables share the endpoint but XOR bodies', async () => {
  const { client, calls } = makeClient();
  await client.submitModalAction('s1', 'yes');
  await client.submitInputVariables('s1', { X: 1 });
  assert.equal(calls.length, 2);
  assert.ok('modal_action' in calls[0].body && !('input_variables' in calls[0].body));
  assert.ok('input_variables' in calls[1].body && !('modal_action' in calls[1].body));
});

test('onPopupDecisionRequired calls decider on non_dismissible_popup and submits', async () => {
  const { client, calls } = makeClient();
  const registered = {};
  const fakeHandle = {
    sessionId: 'sess-auto',
    on(event, handler) {
      registered[event] = handler;
      return () => {};
    },
  };
  const deciderCalls = [];
  const decider = (ctx) => {
    deciderCalls.push(ctx);
    const proceed = ctx.available_actions.find((a) => /proceed/i.test(a.label));
    return proceed.id;
  };

  const unsubscribe = client.onPopupDecisionRequired(fakeHandle, decider);
  assert.equal(typeof unsubscribe, 'function');
  assert.ok(registered[EventType.ExecutionInputRequired]);

  await registered[EventType.ExecutionInputRequired]({
    payload: {
      session_id: 'sess-auto',
      reason: 'non_dismissible_popup',
      input_variables: {},
      screenshot_url: null,
      popup_context: {
        error_description: 'Duplicate patient',
        error_sub_type: 'NON_DISMISSIBLE',
        full_url: 'https://example.com',
        available_actions: [
          { id: 'proceed_with_selected_patient', label: 'Proceed with Selected Patient' },
          { id: 'cancel', label: 'Cancel' },
        ],
        retry: { attempt: 1, max_attempts: 3 },
      },
    },
  });

  assert.equal(deciderCalls.length, 1);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body, { modal_action: 'proceed_with_selected_patient' });
});

test('onPopupDecisionRequired ignores incorrect_form_input events', async () => {
  const { client, calls } = makeClient();
  const registered = {};
  const fakeHandle = {
    sessionId: 'sess-x',
    on(event, handler) {
      registered[event] = handler;
      return () => {};
    },
  };
  const deciderCalls = [];
  client.onPopupDecisionRequired(fakeHandle, (ctx) => {
    deciderCalls.push(ctx);
    return 'anything';
  });

  await registered[EventType.ExecutionInputRequired]({
    payload: { session_id: 'sess-x', reason: 'incorrect_form_input', input_variables: {}, screenshot_url: null },
  });

  assert.equal(deciderCalls.length, 0);
  assert.equal(calls.length, 0);
});

test('onPopupDecisionRequired swallows decider exceptions', async () => {
  const { client, calls } = makeClient();
  const registered = {};
  client.onPopupDecisionRequired(
    {
      sessionId: 'sess-x',
      on(event, handler) {
        registered[event] = handler;
        return () => {};
      },
    },
    () => {
      throw new Error('operator picked nothing');
    },
  );

  await registered[EventType.ExecutionInputRequired]({
    payload: {
      session_id: 'sess-x',
      reason: 'non_dismissible_popup',
      input_variables: {},
      screenshot_url: null,
      popup_context: {
        error_description: 'x',
        error_sub_type: 'NON_DISMISSIBLE',
        full_url: 'https://x',
        available_actions: [{ id: 'yes', label: 'Yes' }],
        retry: { attempt: 1, max_attempts: 3 },
      },
    },
  });

  assert.equal(calls.length, 0);
});

test('onInputVariablesRequired ignores modal events, fires on variable reasons', async () => {
  const { client, calls } = makeClient();
  const registered = {};
  const fakeHandle = {
    sessionId: 'sess-v',
    on(event, handler) {
      registered[event] = handler;
      return () => {};
    },
  };
  const captured = [];
  const decider = (payload) => {
    captured.push(payload);
    if (payload.reason === 'incorrect_form_input') return { USERNAME: 'alice' };
    return { MEMBER_ID: 'ABC' };
  };
  client.onInputVariablesRequired(fakeHandle, decider);

  // modal event: ignored
  await registered[EventType.ExecutionInputRequired]({
    payload: {
      session_id: 'sess-v',
      reason: 'non_dismissible_popup',
      input_variables: {},
      screenshot_url: null,
      popup_context: {
        error_description: 'x',
        error_sub_type: 'NON_DISMISSIBLE',
        full_url: 'https://x',
        available_actions: [{ id: 'yes', label: 'Yes' }],
        retry: { attempt: 1, max_attempts: 3 },
      },
    },
  });
  assert.equal(captured.length, 0);
  assert.equal(calls.length, 0);

  // incorrect_form_input: fires
  await registered[EventType.ExecutionInputRequired]({
    payload: { session_id: 'sess-v', reason: 'incorrect_form_input', input_variables: {}, screenshot_url: null },
  });
  assert.equal(captured.length, 1);
  assert.deepEqual(calls[0].body, { input_variables: { USERNAME: 'alice' } });

  // input_required: fires with different branch
  await registered[EventType.ExecutionInputRequired]({
    payload: { session_id: 'sess-v', reason: 'input_required', input_variables: {}, screenshot_url: null },
  });
  assert.equal(captured.length, 2);
  assert.deepEqual(calls[1].body, { input_variables: { MEMBER_ID: 'ABC' } });
});

test('retry.attempt is visible to decider for branching', async () => {
  const { client, calls } = makeClient();
  const registered = {};
  client.onPopupDecisionRequired(
    {
      sessionId: 'sess-r',
      on(event, handler) {
        registered[event] = handler;
        return () => {};
      },
    },
    (ctx) => (ctx.retry.attempt === 1 ? 'yes' : 'no'),
  );

  async function fire(attempt) {
    await registered[EventType.ExecutionInputRequired]({
      payload: {
        session_id: 'sess-r',
        reason: 'non_dismissible_popup',
        input_variables: {},
        screenshot_url: null,
        popup_context: {
          error_description: 'x',
          error_sub_type: 'NON_DISMISSIBLE',
          full_url: 'https://x',
          available_actions: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }],
          retry: { attempt, max_attempts: 3 },
        },
      },
    });
  }
  await fire(1);
  await fire(2);
  assert.deepEqual(calls[0].body, { modal_action: 'yes' });
  assert.deepEqual(calls[1].body, { modal_action: 'no' });
});


// === Gap coverage: edge cases on payload shape, async deciders, unsubscribe ===

test('onPopupDecisionRequired handles missing popup_context without raising', async () => {
  const { client, calls } = makeClient();
  const registered = {};
  client.onPopupDecisionRequired(
    { sessionId: 's', on(e, h) { registered[e] = h; return () => {}; } },
    (ctx) => 'yes',
  );

  // popup_context absent entirely
  await registered[EventType.ExecutionInputRequired]({
    payload: { session_id: 's', reason: 'non_dismissible_popup', input_variables: {}, screenshot_url: null },
  });
  // popup_context is null
  await registered[EventType.ExecutionInputRequired]({
    payload: { session_id: 's', reason: 'non_dismissible_popup', popup_context: null, input_variables: {}, screenshot_url: null },
  });

  assert.equal(calls.length, 0);
});

test('onPopupDecisionRequired skips on non-string / empty decider return', async () => {
  const { client, calls } = makeClient();
  const registered = {};
  const returns = ['', null, undefined, 42, [], { id: 'yes' }];
  let idx = 0;
  client.onPopupDecisionRequired(
    { sessionId: 's', on(e, h) { registered[e] = h; return () => {}; } },
    () => returns[idx++],
  );

  for (let i = 0; i < returns.length; i++) {
    await registered[EventType.ExecutionInputRequired]({
      payload: {
        session_id: 's', reason: 'non_dismissible_popup', input_variables: {}, screenshot_url: null,
        popup_context: {
          error_description: 'x', error_sub_type: 'NON_DISMISSIBLE', full_url: 'x',
          available_actions: [{ id: 'yes', label: 'Yes' }],
          retry: { attempt: 1, max_attempts: 3 },
        },
      },
    });
  }

  assert.equal(calls.length, 0);
});

test('onInputVariablesRequired skips when decider returns non-object', async () => {
  const { client, calls } = makeClient();
  const registered = {};
  const returns = [null, 'string', 42, undefined];
  let idx = 0;
  client.onInputVariablesRequired(
    { sessionId: 's', on(e, h) { registered[e] = h; return () => {}; } },
    () => returns[idx++],
  );

  for (let i = 0; i < returns.length; i++) {
    await registered[EventType.ExecutionInputRequired]({
      payload: { session_id: 's', reason: 'incorrect_form_input', input_variables: {}, screenshot_url: null },
    });
  }

  assert.equal(calls.length, 0);
});

test('listener handles malformed event objects (null, missing payload, scalar)', async () => {
  const { client, calls } = makeClient();
  const registered = {};
  client.onPopupDecisionRequired(
    { sessionId: 's', on(e, h) { registered[e] = h; return () => {}; } },
    () => 'yes',
  );

  await registered[EventType.ExecutionInputRequired](null);
  await registered[EventType.ExecutionInputRequired]({});
  await registered[EventType.ExecutionInputRequired]({ payload: null });
  await registered[EventType.ExecutionInputRequired](42);
  await registered[EventType.ExecutionInputRequired]([1, 2]);

  assert.equal(calls.length, 0);
});

test('unsubscribe stops the listener from firing', async () => {
  const { client, calls } = makeClient();
  const registered = {};
  const unsubscribe = client.onPopupDecisionRequired(
    {
      sessionId: 's',
      on(e, h) {
        registered[e] = h;
        return () => { delete registered[e]; };
      },
    },
    () => 'yes',
  );

  await registered[EventType.ExecutionInputRequired]({
    payload: {
      session_id: 's', reason: 'non_dismissible_popup', input_variables: {}, screenshot_url: null,
      popup_context: {
        error_description: 'x', error_sub_type: 'NON_DISMISSIBLE', full_url: 'x',
        available_actions: [{ id: 'yes', label: 'Yes' }],
        retry: { attempt: 1, max_attempts: 3 },
      },
    },
  });
  assert.equal(calls.length, 1);

  unsubscribe();
  assert.equal(registered[EventType.ExecutionInputRequired], undefined);
});

test('async decider returning Promise<string> is awaited and submitted', async () => {
  const { client, calls } = makeClient();
  const registered = {};
  client.onPopupDecisionRequired(
    { sessionId: 's', on(e, h) { registered[e] = h; return () => {}; } },
    async (ctx) => {
      // Simulate an async lookup (e.g., DB call, LLM, operator UI)
      await new Promise((r) => setTimeout(r, 5));
      return ctx.available_actions.find((a) => /proceed/i.test(a.label)).id;
    },
  );

  await registered[EventType.ExecutionInputRequired]({
    payload: {
      session_id: 's', reason: 'non_dismissible_popup', input_variables: {}, screenshot_url: null,
      popup_context: {
        error_description: 'duplicate patient', error_sub_type: 'NON_DISMISSIBLE', full_url: 'x',
        available_actions: [
          { id: 'proceed_with_selected_patient', label: 'Proceed with Selected Patient' },
          { id: 'cancel', label: 'Cancel' },
        ],
        retry: { attempt: 1, max_attempts: 3 },
      },
    },
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body, { modal_action: 'proceed_with_selected_patient' });
});

test('async decider returning rejected Promise is swallowed (no submission)', async () => {
  const { client, calls } = makeClient();
  const registered = {};
  client.onPopupDecisionRequired(
    { sessionId: 's', on(e, h) { registered[e] = h; return () => {}; } },
    async () => {
      throw new Error('decider blew up');
    },
  );

  await registered[EventType.ExecutionInputRequired]({
    payload: {
      session_id: 's', reason: 'non_dismissible_popup', input_variables: {}, screenshot_url: null,
      popup_context: {
        error_description: 'x', error_sub_type: 'NON_DISMISSIBLE', full_url: 'x',
        available_actions: [{ id: 'yes', label: 'Yes' }],
        retry: { attempt: 1, max_attempts: 3 },
      },
    },
  });

  assert.equal(calls.length, 0);
});

test('multiple modals fire back-to-back; each processed independently', async () => {
  const { client, calls } = makeClient();
  const registered = {};
  const callLog = [];
  client.onPopupDecisionRequired(
    { sessionId: 's', on(e, h) { registered[e] = h; return () => {}; } },
    (ctx) => {
      const choice = ctx.available_actions[0].id;
      callLog.push(choice);
      return choice;
    },
  );

  const modals = [
    [{ id: 'proceed', label: 'Proceed' }],
    [{ id: 'yes', label: 'Yes' }],
    [{ id: 'acknowledge', label: 'Acknowledge' }],
  ];
  for (const actions of modals) {
    await registered[EventType.ExecutionInputRequired]({
      payload: {
        session_id: 's', reason: 'non_dismissible_popup', input_variables: {}, screenshot_url: null,
        popup_context: {
          error_description: 'x', error_sub_type: 'NON_DISMISSIBLE', full_url: 'x',
          available_actions: actions,
          retry: { attempt: 1, max_attempts: 3 },
        },
      },
    });
  }

  assert.deepEqual(callLog, ['proceed', 'yes', 'acknowledge']);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map((c) => c.body.modal_action), ['proceed', 'yes', 'acknowledge']);
});
