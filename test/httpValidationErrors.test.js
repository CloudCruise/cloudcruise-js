import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CloudCruise,
  InputValidationError
} from '../dist/index.js';

const API_KEY = 'sk_test_example';
const ENCRYPTION_KEY = '0'.repeat(64);

async function backendValidationError(responseBody, requestBody) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify(responseBody), {
      status: 400,
      statusText: 'Bad Request',
      headers: { 'content-type': 'application/json' }
    });

  try {
    const client = new CloudCruise({
      apiKey: API_KEY,
      encryptionKey: ENCRYPTION_KEY
    });
    let captured;
    await assert.rejects(
      () => client.makeRequest('POST', '/run', requestBody),
      (error) => {
        assert.ok(error instanceof InputValidationError);
        captured = error;
        return true;
      }
    );
    return captured;
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('converts backend pattern errors into InputValidationError', async () => {
  const error = await backendValidationError(
    {
      message: 'Validation failed for run_input_variables',
      run_input_variables_errors: [
        {
          field: '/npi_number',
          message: 'must match pattern "^\\d{10}$"',
          keyword: 'pattern',
          expected: { pattern: '^\\d{10}$' },
          received: null
        }
      ],
      input_schema: {
        type: 'object',
        properties: {
          npi_number: {
            type: 'string',
            pattern: '^\\d{10}$'
          }
        }
      }
    },
    {
      run_input_variables: { npi_number: 'abc' }
    }
  );

  assert.match(error.message, /\/npi_number/);
  assert.deepEqual(error.schemaErrors, [
    {
      instancePath: '/npi_number',
      schemaPath: '#/properties/npi_number/pattern',
      keyword: 'pattern',
      message: 'must match pattern "^\\d{10}$"'
    }
  ]);
});

test('populates compatibility fields from backend validation errors', async () => {
  const error = await backendValidationError(
    {
      message: 'Validation failed for run_input_variables',
      run_input_variables_errors: [
        {
          field: '#/required',
          message: "must have required property 'name'",
          keyword: 'required',
          expected: { missingProperty: 'name' }
        },
        {
          field: '/count',
          message: 'must be integer',
          keyword: 'type',
          expected: { type: 'integer' }
        },
        {
          field: '#/additionalProperties',
          message: 'must NOT have additional properties',
          keyword: 'additionalProperties',
          expected: { additionalProperty: 'extra' }
        }
      ],
      input_schema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          count: { type: 'integer' }
        },
        required: ['name'],
        additionalProperties: false
      }
    },
    {
      run_input_variables: {
        count: 'wrong',
        extra: true
      }
    }
  );

  assert.deepEqual(error.missingRequired, ['name']);
  assert.deepEqual(error.invalidTypes, [
    {
      field: 'count',
      expected_display: 'integer',
      actual: 'string'
    }
  ]);
  assert.deepEqual(error.unknownKeys, ['extra']);
});
