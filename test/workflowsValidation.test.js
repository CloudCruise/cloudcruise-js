import test from 'node:test';
import assert from 'node:assert/strict';

import {
  InputValidationError,
  WorkflowsClient
} from '../dist/index.js';

function clientFor(schema, nested = false) {
  return new WorkflowsClient(async () =>
    nested
      ? { metadata: { input_schema: schema } }
      : { input_schema: schema }
  );
}

test('returns complete direct and wrapped workflow metadata responses', async () => {
  const metadata = {
    input_schema: {
      type: 'object',
      properties: { accountId: { type: 'string' } }
    },
    workspace_id: '11223344-5566-7788-9900-112233445566',
    vault_schema: {
      USER: {
        type: 'credential',
        domain: 'https://example.com',
        example: '22334455-6677-8899-0011-223344556677'
      }
    }
  };

  for (const response of [metadata, { metadata }]) {
    const client = new WorkflowsClient(async (method, path) => {
      assert.equal(method, 'GET');
      assert.equal(path, '/workflows/wf-1/metadata');
      return response;
    });

    assert.strictEqual(await client.getWorkflowMetadata('wf-1'), metadata);
  }
});

async function validationError(client, payload) {
  let captured;
  await assert.rejects(
    () => client.validateWorkflowInput('wf-1', payload),
    (error) => {
      assert.ok(error instanceof InputValidationError);
      captured = error;
      return true;
    }
  );
  return captured;
}

test('validates required fields, types, and unknown keys', async () => {
  const client = clientFor({
    type: 'object',
    properties: {
      url: { type: 'string' },
      count: { type: ['integer', 'null'] }
    },
    required: ['url'],
    additionalProperties: false
  });

  await client.validateWorkflowInput('wf-1', { url: 'https://example.com', count: 3 });

  const error = await validationError(client, { count: 'three', extra: true });
  assert.deepEqual(error.missingRequired, ['url']);
  assert.deepEqual(error.unknownKeys, ['extra']);
  assert.deepEqual(error.invalidTypes, [
    { field: 'count', expected_display: 'integer | null', actual: 'string' }
  ]);
});

test('validates nested patterns and additional properties', async () => {
  const client = clientFor({
    type: 'object',
    properties: {
      profile: {
        type: 'object',
        properties: {
          code: { type: 'string', pattern: '^[A-Z]{3}$' }
        },
        required: ['code'],
        additionalProperties: false
      }
    }
  });

  const error = await validationError(client, {
    profile: { code: 'abc', extra: true }
  });
  assert.deepEqual(error.unknownKeys, ['/profile/extra']);
  assert.ok(error.schemaErrors.some((detail) => detail.keyword === 'pattern'));
});

test('validates arrays, items, and limits', async () => {
  const client = clientFor({
    type: 'object',
    properties: {
      scores: {
        type: 'array',
        minItems: 2,
        items: { type: 'integer', minimum: 0 }
      }
    }
  });

  const error = await validationError(client, { scores: [-1] });
  assert.deepEqual(
    new Set(error.schemaErrors.map((detail) => detail.keyword)),
    new Set(['minimum', 'minItems'])
  );
});

test('validates enum, const, and local refs', async () => {
  const client = clientFor({
    type: 'object',
    definitions: {
      status: { type: 'string', enum: ['ready', 'running'] }
    },
    properties: {
      status: { $ref: '#/definitions/status' },
      version: { const: 2 }
    }
  });

  await client.validateWorkflowInput('wf-1', { status: 'ready', version: 2 });
  const error = await validationError(client, { status: 'done', version: 1 });
  assert.deepEqual(
    new Set(error.schemaErrors.map((detail) => detail.keyword)),
    new Set(['const', 'enum'])
  );
});

test('validates schema combinators', async () => {
  const cases = [
    [
      { allOf: [{ type: 'integer' }, { type: 'number', minimum: 5 }] },
      3,
      'minimum'
    ],
    [
      { anyOf: [{ type: 'string' }, { type: 'integer', minimum: 5 }] },
      false,
      'anyOf'
    ],
    [{ oneOf: [{ type: 'integer' }, { type: 'number' }] }, 3, 'oneOf'],
    [{ not: { const: 'blocked' } }, 'blocked', 'not']
  ];

  for (const [valueSchema, value, expectedKeyword] of cases) {
    const client = clientFor({
      type: 'object',
      properties: { value: valueSchema }
    });
    const error = await validationError(client, { value });
    assert.ok(
      error.schemaErrors.some((detail) => detail.keyword === expectedKeyword)
    );
  }
});

test('does not enforce format annotations', async () => {
  const client = clientFor({
    type: 'object',
    properties: {
      email: { type: 'string', format: 'email' }
    }
  });
  await client.validateWorkflowInput('wf-1', { email: 'not-an-email' });
});

test('fails closed for malformed schemas and external refs', async () => {
  const malformed = await validationError(
    clientFor({ type: 'not-a-json-schema-type' }),
    {}
  );
  assert.equal(malformed.schemaErrors[0].keyword, 'schema');

  const external = await validationError(
    clientFor({
      type: 'object',
      properties: {
        value: { $ref: 'https://example.com/value.schema.json' }
      }
    }),
    { value: 1 }
  );
  assert.equal(external.schemaErrors[0].keyword, '$ref');
});

test('accepts nested workflow metadata responses', async () => {
  const client = clientFor(
    {
      type: 'object',
      properties: { value: { type: 'string', pattern: '^ok$' } }
    },
    true
  );
  const error = await validationError(client, { value: 'no' });
  assert.equal(error.schemaErrors[0].keyword, 'pattern');
});
