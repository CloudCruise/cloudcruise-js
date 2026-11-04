import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

import { EventType } from '../dist/index.js';

const contract = JSON.parse(readFileSync(new URL('./contract/api-contract.json', import.meta.url), 'utf8'));
const source = ts.createSourceFile(
  'types.ts',
  readFileSync(new URL('../src/events/types.ts', import.meta.url), 'utf8'),
  ts.ScriptTarget.Latest,
  true,
);

const interfaces = new Map();
const aliases = new Map();
for (const statement of source.statements) {
  if (ts.isInterfaceDeclaration(statement)) {
    interfaces.set(statement.name.text, {
      extends: (statement.heritageClauses ?? []).flatMap((clause) => clause.types.map((t) => t.expression.getText(source))),
      members: statement.members
        .filter(ts.isPropertySignature)
        .map((member) => ({ name: member.name.getText(source), optional: Boolean(member.questionToken) })),
    });
  }
  if (ts.isTypeAliasDeclaration(statement) && ts.isUnionTypeNode(statement.type)) {
    aliases.set(
      statement.name.text,
      statement.type.types.filter(ts.isLiteralTypeNode).map((node) => node.literal.text),
    );
  }
}

function shape(name) {
  const declaration = interfaces.get(name);
  assert.ok(declaration, `${name} is declared in src/events/types.ts`);
  const members = [...declaration.extends.flatMap((parent) => shape(parent).members), ...declaration.members];
  return {
    members,
    keys: members.map((m) => m.name).sort(),
    required: members.filter((m) => !m.optional).map((m) => m.name).sort(),
  };
}

function assertMatchesSchema(typeName, schema) {
  const { keys, required } = shape(typeName);
  assert.deepEqual(keys, Object.keys(schema.properties).sort(), `${typeName} has exactly the API's keys`);
  assert.deepEqual(required, [...(schema.required ?? [])].sort(), `${typeName} requires exactly what the API always sends`);
}

const sorted = (values) => [...values].sort();
const requested = contract.decision_requested;
const answered = contract.decision_answered;
const respond = contract.decision_respond_request;

test('both Decision Required events are in EventType and are subscribable webhooks in the API, and the API no longer lets a webhook subscribe to execution.input_required', () => {
  const sdkEvents = Object.values(EventType);
  for (const event of ['agent.decision_requested', 'agent.decision_answered']) {
    assert.ok(sdkEvents.includes(event), `EventType has ${event}`);
    assert.ok(contract.subscribable_events.includes(event), `the API lets a webhook subscribe to ${event}`);
    assert.ok(contract.webhooks.includes(event), `the API documents the ${event} payload`);
  }
  assert.ok(!contract.subscribable_events.includes('execution.input_required'));
});

test('the API serves the decision answer endpoint and no longer serves new_input_variables, which the deprecated runs helpers call', () => {
  assert.ok(contract.paths.includes('/run/{session_id}/decision/respond'));
  assert.ok(!contract.paths.includes('/run/{session_id}/new_input_variables'));
});

test('AgentDecisionRequestedPayload has the same keys and the same required keys as the API agent.decision_requested payload', () => {
  assertMatchesSchema('AgentDecisionRequestedPayload', requested);
});

test('DecisionWebhookField and DecisionWebhookOption match the API decision field and option objects key for key', () => {
  assertMatchesSchema('DecisionWebhookField', requested.properties.fields.items);
  assertMatchesSchema('DecisionWebhookOption', requested.properties.fields.items.properties.options.items);
});

test('AgentDecisionAnsweredPayload and DecisionWebhookAnswer match the API agent.decision_answered payload and its answer object', () => {
  assertMatchesSchema('AgentDecisionAnsweredPayload', answered);
  assertMatchesSchema('DecisionWebhookAnswer', answered.properties.answer);
});

test('the outcome, answered_via and directive unions list exactly the values the API sends, so no API value falls outside the type', () => {
  assert.deepEqual(sorted(aliases.get('DecisionWebhookOutcome')), sorted(answered.properties.outcome.enum));
  assert.deepEqual(sorted(aliases.get('DecisionWebhookAnsweredVia')), sorted(answered.properties.answered_via.enum));
  assert.deepEqual(sorted(aliases.get('DecisionWebhookDirective')), sorted(answered.properties.answer.properties.directive.enum));
});

test('an answer built from DecisionWebhookAnswer plus decision_id is exactly the body the API answer endpoint accepts', () => {
  assert.deepEqual(sorted(respond.required), ['decision_id']);
  assert.deepEqual(
    sorted(Object.keys(respond.properties).filter((key) => key !== 'decision_id')),
    shape('DecisionWebhookAnswer').keys,
  );
  assert.deepEqual(sorted(aliases.get('DecisionWebhookDirective')), sorted(respond.properties.directive.enum));
});
