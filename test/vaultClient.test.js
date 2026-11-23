import test from 'node:test';
import assert from 'node:assert/strict';

import { VaultClient } from '../dist/vault/VaultClient.js';
import {
  decryptData,
  encryptSensitiveFields
} from '../dist/vault/utils.js';

const ENCRYPTION_KEY = '0123456789abcdef'.repeat(4);

test('VaultClient.create encrypts sensitive fields and decrypts the response', async () => {
  const calls = [];

  const client = new VaultClient(async (method, path, body) => {
    calls.push({ method, path, body });
    return body;
  }, ENCRYPTION_KEY);

  const options = {
    user_name: 'user@example.com',
    password: 'super-secret',
    tfa_secret: 'totp-secret'
  };

  const result = await client.create('example.com', 'user123', options);

  assert.equal(calls.length, 1);
  const request = calls[0];
  assert.equal(request.method, 'POST');
  assert.equal(request.path, '/vault');
  assert.notEqual(request.body.user_name, options.user_name);
  assert.notEqual(request.body.password, options.password);
  assert.notEqual(request.body.tfa_secret, options.tfa_secret);

  assert.equal(result.user_name, options.user_name);
  assert.equal(result.password, options.password);
  assert.equal(result.tfa_secret, options.tfa_secret);
});

test('VaultClient.create encrypts custom proxy_value and decrypts the response', async () => {
  const calls = [];

  const client = new VaultClient(async (method, path, body) => {
    calls.push({ method, path, body });
    return body;
  }, ENCRYPTION_KEY);

  const proxyUrl = 'socks5://user:pass@proxy.example.com:1080';
  const result = await client.create('example.com', 'user123', {
    proxy_setting: 'custom',
    proxy_value: proxyUrl
  });

  assert.equal(calls[0].body.proxy_setting, 'custom');
  assert.notEqual(calls[0].body.proxy_value, proxyUrl);
  assert.equal(result.proxy_value, proxyUrl);
});

test('VaultClient.create throws if proxy_value is set without proxy_setting', async () => {
  const client = new VaultClient(async () => ({}), ENCRYPTION_KEY);

  await assert.rejects(
    client.create('example.com', 'user123', {
      proxy_value: 'socks5://user:pass@proxy.example.com:1080'
    }),
    /proxy_value requires proxy_setting/
  );
});

test('VaultClient.create leaves non-custom proxy_value as plaintext', async () => {
  const calls = [];

  const client = new VaultClient(async (method, path, body) => {
    calls.push({ method, path, body });
    return body;
  }, ENCRYPTION_KEY);

  const result = await client.create('example.com', 'user123', {
    proxy_setting: 'country',
    proxy_value: 'US'
  });

  assert.equal(calls[0].body.proxy_value, 'US');
  assert.equal(result.proxy_value, 'US');
});

const ADDITIONAL_FIELDS = [
  { name: 'Note', type: 'Text', value: 'front desk' },
  { name: 'Recovery email', type: 'Email', value: 'backup@example.com' },
  { name: 'Portal', type: 'Url', value: 'https://portal.example.com' },
  { name: 'Phone', type: 'Phone', value: '+1 555 0100' },
  { name: 'Birthday', type: 'Date', value: '1990-04-01' },
  { name: 'Card expiry', type: 'MonthYear', value: '04/2030' },
  {
    name: 'Billing address',
    type: 'Address',
    value: { street: '1 Main St', city: 'Springfield', state: 'IL', zip: '62701', country: 'US' }
  },
  { name: 'PIN', type: 'Concealed', value: '4321' },
  { name: 'Backup authenticator', type: 'Totp', value: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP' }
];

// The API rejects plaintext additional field values, so every value, of every
// type, must reach the server as ciphertext of the plain value (an Address as
// its JSON object), and the caller must get the plain values back.
test('VaultClient.create sends every additional field value encrypted and returns it decrypted', async () => {
  const calls = [];
  const client = new VaultClient(async (method, path, body) => {
    calls.push({ method, path, body });
    return body;
  }, ENCRYPTION_KEY);

  const result = await client.create('example.com', 'user123', {
    additional_fields: ADDITIONAL_FIELDS
  });

  const sent = calls[0].body.additional_fields;
  assert.equal(sent.length, ADDITIONAL_FIELDS.length);
  for (const [index, field] of ADDITIONAL_FIELDS.entries()) {
    assert.equal(sent[index].name, field.name);
    assert.equal(sent[index].type, field.type);
    assert.equal(typeof sent[index].value, 'string');
    assert.deepEqual(await decryptData(sent[index].value, ENCRYPTION_KEY), field.value);
  }
  assert.deepEqual(result.additional_fields, ADDITIONAL_FIELDS);
});

// The API stores both the question and the answer encrypted and rejects
// plaintext, so the SDK must encrypt both and keep the caller's order.
test('VaultClient.create sends security questions and answers encrypted in order and returns them decrypted', async () => {
  const calls = [];
  const client = new VaultClient(async (method, path, body) => {
    calls.push({ method, path, body });
    return body;
  }, ENCRYPTION_KEY);
  const questions = [
    { question: "What is your mother's maiden name?", answer: 'Smith' },
    { question: 'What was your first pet called?', answer: 'Rex' }
  ];

  const result = await client.create('example.com', 'user123', {
    security_questions: questions
  });

  const sent = calls[0].body.security_questions;
  assert.equal(sent.length, 2);
  for (const [index, { question, answer }] of questions.entries()) {
    assert.notEqual(sent[index].question, question);
    assert.notEqual(sent[index].answer, answer);
    assert.equal(await decryptData(sent[index].question, ENCRYPTION_KEY), question);
    assert.equal(await decryptData(sent[index].answer, ENCRYPTION_KEY), answer);
  }
  assert.deepEqual(result.security_questions, questions);
});

test('VaultClient.create forwards concurrency, expiry, and persistence options', async () => {
  const calls = [];

  const client = new VaultClient(async (method, path, body) => {
    calls.push({ method, path, body });
    return body;
  }, ENCRYPTION_KEY);

  const options = {
    allow_multiple_sessions: true,
    prevent_concurrency_during_login: true,
    max_concurrency: 5,
    expiry_time_from_last_use: '01:00:00',
    expiry_time_from_session_data_set: '7 days 00:00:00',
    tfa_method: 'AUTHENTICATOR',
    persist_local_storage: null,
    persist_session_storage: true,
    persist_cookies: null
  };

  await client.create('example.com', 'user123', options);

  assert.equal(calls.length, 1);
  const body = calls[0].body;
  assert.equal(body.allow_multiple_sessions, true);
  assert.equal(body.prevent_concurrency_during_login, true);
  assert.equal(body.max_concurrency, 5);
  assert.equal(body.expiry_time_from_last_use, '01:00:00');
  assert.equal(body.expiry_time_from_session_data_set, '7 days 00:00:00');
  assert.equal(body.tfa_method, 'AUTHENTICATOR');
  assert.strictEqual(body.persist_local_storage, null);
  assert.strictEqual(body.persist_session_storage, true);
  assert.strictEqual(body.persist_cookies, null);
});

test('VaultClient.create forwards provider-backed fields without encrypting them', async () => {
  const calls = [];

  const client = new VaultClient(async (method, path, body) => {
    calls.push({ method, path, body });
    return body;
  }, ENCRYPTION_KEY);

  await client.create('example.com', 'user123', {
    secret_provider_id: 'provider-1',
    secret_ref: 'op://vault/item',
    secret_cache_ttl_seconds: 300
  });

  assert.equal(calls[0].body.secret_provider_id, 'provider-1');
  assert.equal(calls[0].body.secret_ref, 'op://vault/item');
  assert.equal(calls[0].body.secret_cache_ttl_seconds, 300);
});

test('VaultClient.create validates provider-backed fields', async () => {
  const client = new VaultClient(async () => ({}), ENCRYPTION_KEY);

  await assert.rejects(
    () =>
      client.create('example.com', 'user123', {
        secret_provider_id: 'provider-1'
      }),
    /secret_provider_id and secret_ref must be provided together/
  );

  await assert.rejects(
    () =>
      client.create('example.com', 'user123', {
        user_name: 'user@example.com',
        secret_provider_id: 'provider-1',
        secret_ref: 'op://vault/item'
      }),
    /provider-backed vault entries cannot include user_name/
  );
});

// A provider-backed entry takes its additional fields and security questions
// from the bound item; the API rejects stored ones, so the SDK fails before
// sending any encrypted values.
test('VaultClient.create rejects additional fields or security questions on a provider-backed entry', async () => {
  const client = new VaultClient(async () => {
    throw new Error('Should not be called');
  }, ENCRYPTION_KEY);
  const provider = { secret_provider_id: 'provider-1', secret_ref: 'op://vault/item' };

  await assert.rejects(
    () =>
      client.create('example.com', 'user123', {
        ...provider,
        additional_fields: [{ name: 'PIN', type: 'Concealed', value: '4321' }]
      }),
    /provider-backed vault entries cannot include additional_fields/
  );
  await assert.rejects(
    () =>
      client.create('example.com', 'user123', {
        ...provider,
        security_questions: [{ question: 'Q?', answer: 'A' }]
      }),
    /provider-backed vault entries cannot include security_questions/
  );
});

// Empty lists are what the API itself expects for a provider-backed entry, so
// they must pass through.
test('VaultClient.create accepts empty additional fields and security questions on a provider-backed entry', async () => {
  const calls = [];
  const client = new VaultClient(async (method, path, body) => {
    calls.push({ method, path, body });
    return body;
  }, ENCRYPTION_KEY);

  await client.create('example.com', 'user123', {
    secret_provider_id: 'provider-1',
    secret_ref: 'op://vault/item',
    additional_fields: [],
    security_questions: []
  });

  assert.deepEqual(calls[0].body.additional_fields, []);
  assert.deepEqual(calls[0].body.security_questions, []);
});

// GET returns additional field values and security questions encrypted with the
// workspace key; warnings and TFA methods are plaintext and must stay untouched.
test('VaultClient.get decrypts additional fields and security questions and keeps warnings and tfa_methods', async () => {
  const questions = [{ question: 'What was your first pet called?', answer: 'Rex' }];
  const warnings = [{ name: 'Duplicate', reason: 'duplicate_name' }];
  const questionWarnings = [{ question: 'Too long?', reason: 'question_too_long' }];
  const encryptedEntry = await encryptSensitiveFields(
    {
      domain: 'example.com',
      permissioned_user_id: 'user123',
      tfa_methods: ['AUTHENTICATOR', 'EMAIL'],
      tfa_method: 'AUTHENTICATOR',
      additional_fields: ADDITIONAL_FIELDS,
      security_questions: questions
    },
    ENCRYPTION_KEY
  );
  const response = {
    ...encryptedEntry,
    additional_field_warnings: warnings,
    security_question_warnings: questionWarnings
  };
  const client = new VaultClient(async () => [response], ENCRYPTION_KEY);

  const [entry] = await client.get();

  assert.deepEqual(entry.additional_fields, ADDITIONAL_FIELDS);
  assert.deepEqual(entry.security_questions, questions);
  assert.deepEqual(entry.tfa_methods, ['AUTHENTICATOR', 'EMAIL']);
  assert.deepEqual(entry.additional_field_warnings, warnings);
  assert.deepEqual(entry.security_question_warnings, questionWarnings);
});

// The entry itself passes unknown response keys through, so list items must too:
// a key the backend adds later stays visible in both lists instead of only one.
test('VaultClient.get keeps unknown keys of additional fields and security questions', async () => {
  const encryptedEntry = await encryptSensitiveFields(
    {
      domain: 'example.com',
      permissioned_user_id: 'user123',
      additional_fields: [{ name: 'Note', type: 'Text', value: 'front desk' }],
      security_questions: [{ question: 'Q?', answer: 'A' }]
    },
    ENCRYPTION_KEY
  );
  const response = {
    ...encryptedEntry,
    additional_fields: [{ ...encryptedEntry.additional_fields[0], source: 'provider' }],
    security_questions: [{ ...encryptedEntry.security_questions[0], source: 'provider' }]
  };
  const client = new VaultClient(async () => [response], ENCRYPTION_KEY);

  const [entry] = await client.get();

  assert.deepEqual(entry.additional_fields, [{ name: 'Note', type: 'Text', value: 'front desk', source: 'provider' }]);
  assert.deepEqual(entry.security_questions, [{ question: 'Q?', answer: 'A', source: 'provider' }]);
});

// decryptCredentials: false promises the raw API response, so the new
// encrypted lists must stay ciphertext too.
test('VaultClient.get with decryptCredentials false returns additional fields and security questions as ciphertext', async () => {
  const encryptedEntry = await encryptSensitiveFields(
    {
      domain: 'example.com',
      permissioned_user_id: 'user123',
      additional_fields: ADDITIONAL_FIELDS,
      security_questions: [{ question: 'Q?', answer: 'A' }]
    },
    ENCRYPTION_KEY
  );
  const client = new VaultClient(async () => [encryptedEntry], ENCRYPTION_KEY);

  const [entry] = await client.get({ decryptCredentials: false });

  assert.deepEqual(entry.additional_fields, encryptedEntry.additional_fields);
  assert.deepEqual(entry.security_questions, encryptedEntry.security_questions);
});

test('VaultClient.get decrypts entries by default', async () => {
  const encryptedEntry = await encryptSensitiveFields(
    {
      domain: 'example.com',
      permissioned_user_id: 'user123',
      user_name: 'user@example.com',
      password: 'super-secret',
      tfa_secret: 'totp-secret'
    },
    ENCRYPTION_KEY
  );

  const calls = [];
  const client = new VaultClient(async (method, path) => {
    calls.push({ method, path });
    return [encryptedEntry];
  }, ENCRYPTION_KEY);

  const result = await client.get();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].path, '/vault');

  assert.equal(result[0].user_name, 'user@example.com');
  assert.equal(result[0].password, 'super-secret');
  assert.equal(result[0].tfa_secret, 'totp-secret');
});

test('VaultClient.get respects decryptCredentials flag and query filters', async () => {
  const encryptedEntry = await encryptSensitiveFields(
    {
      domain: 'example.com',
      permissioned_user_id: 'user123',
      user_name: 'user@example.com',
      password: 'super-secret',
      tfa_secret: 'totp-secret'
    },
    ENCRYPTION_KEY
  );

  const paths = [];
  const client = new VaultClient(async (method, path) => {
    paths.push(path);
    return encryptedEntry;
  }, ENCRYPTION_KEY);

  const [result] = await client.get({
    permissioned_user_id: 'user123',
    domain: 'example.com',
    decryptCredentials: false
  });

  assert.equal(paths.length, 1);
  assert.equal(
    paths[0],
    '/vault?permissioned_user_id=user123&domain=example.com'
  );
  assert.equal(result.user_name, encryptedEntry.user_name);
  assert.equal(result.password, encryptedEntry.password);
  assert.equal(result.tfa_secret, encryptedEntry.tfa_secret);
});

test('VaultClient.update requires identity fields and encrypts payload', async () => {
  const calls = [];
  const client = new VaultClient(async (method, path, body) => {
    calls.push({ method, path, body });
    return body;
  }, ENCRYPTION_KEY);

  const update = {
    permissioned_user_id: 'user123',
    user_name: 'user@example.com',
    password: 'super-secret',
    domain: 'example.com',
    tfa_secret: 'totp-secret'
  };

  const result = await client.update(update);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'PUT');
  assert.equal(calls[0].path, '/vault');
  assert.notEqual(calls[0].body.user_name, update.user_name);
  assert.notEqual(calls[0].body.password, update.password);
  assert.notEqual(calls[0].body.tfa_secret, update.tfa_secret);

  assert.equal(result.user_name, update.user_name);
  assert.equal(result.password, update.password);
  assert.equal(result.tfa_secret, update.tfa_secret);
});

test('VaultClient.update throws if required fields are missing', async () => {
  const client = new VaultClient(async () => {
    throw new Error('Should not be called');
  }, ENCRYPTION_KEY);

  await assert.rejects(
    () =>
      client.update({
        permissioned_user_id: 'user123',
        user_name: 'user@example.com'
      }),
    /domain is required for vault updates/
  );

  await assert.rejects(
    () =>
      client.update({
        permissioned_user_id: 'user123',
        domain: 'example.com'
      }),
    /user_name is required for vault updates/
  );

  await assert.rejects(
    () =>
      client.update({
        permissioned_user_id: 'user123',
        domain: 'example.com',
        secret_provider_id: null,
        secret_ref: null
      }),
    /user_name is required for vault updates/
  );
});

test('VaultClient.update supports provider-backed updates', async () => {
  const calls = [];
  const client = new VaultClient(async (method, path, body) => {
    calls.push({ method, path, body });
    return body;
  }, ENCRYPTION_KEY);

  const result = await client.update({
    permissioned_user_id: 'user123',
    domain: 'example.com',
    secret_provider_id: 'provider-1',
    secret_ref: 'op://vault/item'
  });

  assert.equal(calls[0].method, 'PUT');
  assert.equal(calls[0].body.secret_provider_id, 'provider-1');
  assert.equal(calls[0].body.secret_ref, 'op://vault/item');
  assert.equal(result.secret_ref, 'op://vault/item');
});

test('VaultClient.delete forwards delete payload unchanged', async () => {
  const calls = [];
  const client = new VaultClient(async (method, path, body) => {
    calls.push({ method, path, body });
  }, ENCRYPTION_KEY);

  const params = { domain: 'example.com', permissioned_user_id: 'user123' };
  await client.delete(params);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'DELETE');
  assert.equal(calls[0].path, '/vault');
  assert.deepEqual(calls[0].body, params);
});

// An entry with several TFA methods needs `method` (else the API answers 400),
// and `field` selects a Totp additional field instead of the built-in seed.
test('VaultClient.getTfaCode sends method and field as query parameters', async () => {
  const paths = [];
  const client = new VaultClient(async (method, path) => {
    paths.push({ method, path });
    return { type: 'authenticator', code: '123456', expires_in_seconds: 20 };
  }, ENCRYPTION_KEY);

  await client.getTfaCode('user123', 'example.com', { method: 'EMAIL' });
  await client.getTfaCode('user123', 'example.com', {
    method: 'AUTHENTICATOR',
    field: 'Backup authenticator'
  });

  assert.deepEqual(paths, [
    {
      method: 'GET',
      path: '/vault/tfa-code?permissioned_user_id=user123&domain=example.com&method=EMAIL'
    },
    {
      method: 'GET',
      path:
        '/vault/tfa-code?permissioned_user_id=user123&domain=example.com&method=AUTHENTICATOR&field=Backup+authenticator'
    }
  ]);
});

// Without options the request is unchanged, so single-method entries keep working.
test('VaultClient.getTfaCode without options sends only the entry identity', async () => {
  const paths = [];
  const client = new VaultClient(async (method, path) => {
    paths.push(path);
    return { type: 'authenticator', code: '123456' };
  }, ENCRYPTION_KEY);

  await client.getTfaCode('user123', 'example.com');

  assert.deepEqual(paths, ['/vault/tfa-code?permissioned_user_id=user123&domain=example.com']);
});

// PUT replaces the stored lists, so an update must carry the full new lists:
// tfa_methods as plaintext enum values, additional fields and security
// questions encrypted like on create.
test('VaultClient.update sends tfa_methods as given and the replacement lists encrypted', async () => {
  const calls = [];
  const client = new VaultClient(async (method, path, body) => {
    calls.push({ method, path, body });
    return body;
  }, ENCRYPTION_KEY);
  const questions = [{ question: 'Favourite colour?', answer: 'Teal' }];

  const result = await client.update({
    permissioned_user_id: 'user123',
    domain: 'example.com',
    user_name: 'user@example.com',
    password: 'super-secret',
    tfa_methods: ['AUTHENTICATOR', 'SMS'],
    additional_fields: [ADDITIONAL_FIELDS[6], ADDITIONAL_FIELDS[8]],
    security_questions: questions
  });

  const body = calls[0].body;
  assert.equal(calls[0].method, 'PUT');
  assert.deepEqual(body.tfa_methods, ['AUTHENTICATOR', 'SMS']);
  assert.deepEqual(
    await decryptData(body.additional_fields[0].value, ENCRYPTION_KEY),
    ADDITIONAL_FIELDS[6].value
  );
  assert.equal(
    await decryptData(body.security_questions[0].answer, ENCRYPTION_KEY),
    'Teal'
  );
  assert.deepEqual(result.additional_fields, [ADDITIONAL_FIELDS[6], ADDITIONAL_FIELDS[8]]);
  assert.deepEqual(result.security_questions, questions);
});

test('VaultClient.create sends only name, type and value of an additional field', async () => {
  const calls = [];
  const client = new VaultClient(async (method, path, body) => {
    calls.push(body);
    return body;
  }, ENCRYPTION_KEY);

  await client.create('example.com', 'user123', {
    additional_fields: [{ id: 7, name: 'Note', type: 'Text', value: 'x' }]
  });

  assert.deepEqual(Object.keys(calls[0].additional_fields[0]).sort(), ['name', 'type', 'value']);
});

test('VaultClient.create names the additional field or security question that lacks a value', async () => {
  const client = new VaultClient(async (method, path, body) => body, ENCRYPTION_KEY);

  await assert.rejects(
    client.create('example.com', 'user123', {
      additional_fields: [{ name: 'Note', type: 'Text' }]
    }),
    /additional_fields\[0\]\.value is required/
  );
  await assert.rejects(
    client.create('example.com', 'user123', {
      security_questions: [{ question: 'Pet?', answer: 'Rex' }, { question: 'Colour?', answer: null }]
    }),
    /security_questions\[1\]\.answer is required/
  );
});

test('VaultClient.update does not send the read-only warnings of an entry read back from get', async () => {
  const calls = [];
  const client = new VaultClient(async (method, path, body) => {
    calls.push(body);
    return body;
  }, ENCRYPTION_KEY);

  await client.update({
    domain: 'example.com',
    permissioned_user_id: 'user123',
    user_name: 'u',
    password: 'p',
    additional_field_warnings: [{ name: 'Dup', reason: 'duplicate_name' }],
    security_question_warnings: [{ question: 'Long?', reason: 'question_too_long' }]
  });

  assert.equal('additional_field_warnings' in calls[0], false);
  assert.equal('security_question_warnings' in calls[0], false);
});

test('VaultClient.getTfaCode rejects field with a method other than AUTHENTICATOR before sending', async () => {
  const calls = [];
  const client = new VaultClient(async (method, path) => {
    calls.push(path);
    return { type: 'email', code: '123456' };
  }, ENCRYPTION_KEY);

  await assert.rejects(
    client.getTfaCode('user123', 'example.com', { method: 'EMAIL', field: 'Backup authenticator' }),
    /field requires method AUTHENTICATOR/
  );
  assert.deepEqual(calls, []);
});

test('VaultClient.getTfaCode sends an empty field instead of silently reading the built-in seed', async () => {
  const calls = [];
  const client = new VaultClient(async (method, path) => {
    calls.push(path);
    return { type: 'authenticator', code: '123456' };
  }, ENCRYPTION_KEY);

  await client.getTfaCode('user123', 'example.com', { field: '' });

  assert.ok(calls[0].endsWith('&field='));
});
