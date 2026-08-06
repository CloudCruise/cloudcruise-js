import Ajv, { type ErrorObject } from 'ajv';

import {
  InputValidationError,
  type InvalidTypeDetail,
  type SchemaErrorDetail,
  type WorkflowInputSchema
} from './types.js';

const ajv = new Ajv({
  allErrors: true,
  strict: true,
  validateFormats: false,
  addUsedSchema: false,
  removeAdditional: false,
  strictSchema: false,
  keywords: ['example']
});

const singleSchemaKeywords = new Set([
  'additionalItems',
  'additionalProperties',
  'contains',
  'else',
  'if',
  'not',
  'propertyNames',
  'then'
]);
const arraySchemaKeywords = new Set(['allOf', 'anyOf', 'oneOf']);
const mappingSchemaKeywords = new Set([
  'definitions',
  'patternProperties',
  'properties'
]);

export function validateInputSchema(
  schema: WorkflowInputSchema,
  payload: Record<string, unknown>
): void {
  const externalRef = firstExternalRef(schema);
  if (externalRef) {
    const detail: SchemaErrorDetail = {
      instancePath: '',
      schemaPath: externalRef.path,
      keyword: '$ref',
      message: `external reference is not allowed: ${externalRef.ref}`
    };
    throw new InputValidationError(
      `Workflow input schema is invalid: ${detail.message}`,
      [],
      [],
      [],
      [detail]
    );
  }

  let validate;
  try {
    validate = ajv.compile(schema);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const detail: SchemaErrorDetail = {
      instancePath: '',
      schemaPath: '#',
      keyword: 'schema',
      message
    };
    throw new InputValidationError(
      `Workflow input schema is invalid: ${message}`,
      [],
      [],
      [],
      [detail]
    );
  }

  if (validate(payload)) return;

  const errors = [...(validate.errors ?? [])].sort(compareErrors);
  const schemaErrors = errors.map(toSchemaError);
  const missingRequired = missingRequiredFields(errors);
  const invalidTypes = invalidTypeDetails(errors, payload);
  const unknownKeys = unknownPropertyNames(errors);

  throw new InputValidationError(
    validationMessage(schemaErrors, missingRequired, invalidTypes, unknownKeys),
    missingRequired,
    invalidTypes,
    unknownKeys,
    schemaErrors
  );
}

export function inputValidationErrorFromResponse(
  response: Record<string, unknown>,
  requestBody?: unknown
): InputValidationError | undefined {
  const rawErrors = response.run_input_variables_errors;
  if (!Array.isArray(rawErrors)) return undefined;

  const schema = isObject(response.input_schema) ? response.input_schema : {};
  const payload =
    isObject(requestBody) && isObject(requestBody.run_input_variables)
      ? requestBody.run_input_variables
      : {};
  const schemaErrors: SchemaErrorDetail[] = [];
  const missingRequired: string[] = [];
  const invalidTypes: InvalidTypeDetail[] = [];
  const unknownKeys: string[] = [];

  for (const rawError of rawErrors) {
    if (!isObject(rawError)) continue;

    const field = String(rawError.field ?? '');
    const keyword = String(rawError.keyword ?? 'validation');
    const message = String(rawError.message ?? 'Invalid value');
    const expected = isObject(rawError.expected) ? rawError.expected : {};
    const instancePath = field.startsWith('/') ? field : '';
    const schemaPath = field.startsWith('#')
      ? field
      : schemaPathForInstance(schema, instancePath, keyword);

    schemaErrors.push({ instancePath, schemaPath, keyword, message });

    if (keyword === 'required') {
      const missingProperty = expected.missingProperty;
      if (typeof missingProperty === 'string') {
        const missingField = instancePath
          ? `${instancePath}/${escapePointer(missingProperty)}`
          : missingProperty;
        pushUnique(missingRequired, missingField);
      }
    } else if (keyword === 'type') {
      const expectedType = expected.type;
      const expectedTypes = Array.isArray(expectedType)
        ? expectedType.map(String)
        : String(expectedType ?? 'any').split(',');
      invalidTypes.push({
        field: displayField(instancePath),
        expected_display: expectedTypes.join(' | '),
        actual: detectType(valueAtPointer(payload, instancePath))
      });
    } else if (keyword === 'additionalProperties') {
      const additionalProperty = expected.additionalProperty;
      if (typeof additionalProperty === 'string') {
        const unknownField = instancePath
          ? `${instancePath}/${escapePointer(additionalProperty)}`
          : additionalProperty;
        pushUnique(unknownKeys, unknownField);
      }
    }
  }

  if (!schemaErrors.length) {
    schemaErrors.push({
      instancePath: '',
      schemaPath: '',
      keyword: 'validation',
      message: String(
        response.message ?? 'Validation failed for run_input_variables'
      )
    });
  }

  return new InputValidationError(
    validationMessage(
      schemaErrors,
      missingRequired,
      invalidTypes,
      unknownKeys
    ),
    missingRequired,
    invalidTypes,
    unknownKeys,
    schemaErrors
  );
}

type ExternalRef = { path: string; ref: string };

function firstExternalRef(
  schema: unknown,
  path: Array<string | number> = []
): ExternalRef | undefined {
  if (!isObject(schema)) return undefined;

  if (typeof schema.$ref === 'string' && !schema.$ref.startsWith('#')) {
    return {
      path: jsonPointer([...path, '$ref'], '#'),
      ref: schema.$ref
    };
  }

  for (const keyword of singleSchemaKeywords) {
    const found = firstExternalRef(schema[keyword], [...path, keyword]);
    if (found) return found;
  }

  const items = schema.items;
  if (Array.isArray(items)) {
    for (const [index, child] of items.entries()) {
      const found = firstExternalRef(child, [...path, 'items', index]);
      if (found) return found;
    }
  } else {
    const found = firstExternalRef(items, [...path, 'items']);
    if (found) return found;
  }

  for (const keyword of arraySchemaKeywords) {
    const children = schema[keyword];
    if (!Array.isArray(children)) continue;
    for (const [index, child] of children.entries()) {
      const found = firstExternalRef(child, [...path, keyword, index]);
      if (found) return found;
    }
  }

  for (const keyword of mappingSchemaKeywords) {
    const children = schema[keyword];
    if (!isObject(children)) continue;
    for (const [name, child] of Object.entries(children)) {
      const found = firstExternalRef(child, [...path, keyword, name]);
      if (found) return found;
    }
  }

  const dependencies = schema.dependencies;
  if (isObject(dependencies)) {
    for (const [name, child] of Object.entries(dependencies)) {
      if (!isObject(child)) continue;
      const found = firstExternalRef(child, [...path, 'dependencies', name]);
      if (found) return found;
    }
  }

  return undefined;
}

function compareErrors(left: ErrorObject, right: ErrorObject): number {
  return (
    left.instancePath.localeCompare(right.instancePath) ||
    left.schemaPath.localeCompare(right.schemaPath) ||
    left.keyword.localeCompare(right.keyword) ||
    (left.message ?? '').localeCompare(right.message ?? '')
  );
}

function toSchemaError(error: ErrorObject): SchemaErrorDetail {
  return {
    instancePath: error.instancePath,
    schemaPath: error.schemaPath,
    keyword: error.keyword,
    message: error.message ?? 'validation failed'
  };
}

function missingRequiredFields(errors: ErrorObject[]): string[] {
  const fields: string[] = [];
  for (const error of errors) {
    if (error.keyword !== 'required') continue;
    const missingProperty = String(error.params.missingProperty);
    const field = error.instancePath
      ? `${error.instancePath}/${escapePointer(missingProperty)}`
      : missingProperty;
    pushUnique(fields, field);
  }
  return fields;
}

function invalidTypeDetails(
  errors: ErrorObject[],
  payload: Record<string, unknown>
): InvalidTypeDetail[] {
  const details: InvalidTypeDetail[] = [];
  for (const error of errors) {
    if (error.keyword !== 'type') continue;
    const expected = String(error.params.type).split(',').join(' | ');
    const value = valueAtPointer(payload, error.instancePath);
    details.push({
      field: displayField(error.instancePath),
      expected_display: expected,
      actual: detectType(value)
    });
  }
  return details;
}

function unknownPropertyNames(errors: ErrorObject[]): string[] {
  const fields: string[] = [];
  for (const error of errors) {
    if (error.keyword !== 'additionalProperties') continue;
    const property = String(error.params.additionalProperty);
    const field = error.instancePath
      ? `${error.instancePath}/${escapePointer(property)}`
      : property;
    pushUnique(fields, field);
  }
  return fields;
}

function validationMessage(
  schemaErrors: SchemaErrorDetail[],
  missingRequired: string[],
  invalidTypes: InvalidTypeDetail[],
  unknownKeys: string[]
): string {
  const parts: string[] = [];
  if (missingRequired.length) {
    parts.push(`missing required: ${missingRequired.join(', ')}`);
  }
  if (invalidTypes.length) {
    parts.push(
      invalidTypes
        .map(
          (error) =>
            `${error.field}: expected ${error.expected_display}, got ${error.actual}`
        )
        .join('; ')
    );
  }
  if (unknownKeys.length) {
    parts.push(`unknown keys: ${unknownKeys.join(', ')}`);
  }

  const extraErrors = schemaErrors.filter(
    (error) => !['required', 'type', 'additionalProperties'].includes(error.keyword)
  );
  if (extraErrors.length) {
    parts.push(
      extraErrors
        .map((error) => `${error.instancePath || '/'}: ${error.message}`)
        .join('; ')
    );
  }
  return `Workflow input validation failed: ${parts.join(' | ')}`;
}

function valueAtPointer(value: unknown, pointer: string): unknown {
  if (!pointer) return value;
  return pointer
    .slice(1)
    .split('/')
    .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce<unknown>((current, part) => {
      if (Array.isArray(current)) return current[Number(part)];
      if (isObject(current)) return current[part];
      return undefined;
    }, value);
}

function displayField(instancePath: string): string {
  if (!instancePath) return '$';
  const withoutPrefix = instancePath.slice(1);
  return withoutPrefix.includes('/') ? instancePath : withoutPrefix;
}

function schemaPathForInstance(
  schema: Record<string, unknown>,
  instancePath: string,
  keyword: string
): string {
  let current: unknown = schema;
  const schemaPath: Array<string | number> = [];
  const parts = instancePath
    ? instancePath
        .slice(1)
        .split('/')
        .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))
    : [];

  for (const part of parts) {
    if (!isObject(current)) return '';

    const properties = current.properties;
    if (isObject(properties) && part in properties) {
      current = properties[part];
      schemaPath.push('properties', part);
      continue;
    }

    const items = current.items;
    if (isObject(items) && /^\d+$/.test(part)) {
      current = items;
      schemaPath.push('items');
      continue;
    }

    const patternProperties = current.patternProperties;
    if (isObject(patternProperties)) {
      const match = Object.entries(patternProperties).find(([pattern]) => {
        try {
          return new RegExp(pattern).test(part);
        } catch {
          return false;
        }
      });
      if (match) {
        current = match[1];
        schemaPath.push('patternProperties', match[0]);
        continue;
      }
    }

    return '';
  }

  if (isObject(current) && keyword in current) {
    schemaPath.push(keyword);
    return jsonPointer(schemaPath, '#');
  }
  return '';
}

function detectType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'integer' : 'number';
  }
  return typeof value;
}

function jsonPointer(path: Array<string | number>, prefix = ''): string {
  if (!path.length) return prefix;
  return `${prefix}/${path.map((part) => escapePointer(String(part))).join('/')}`;
}

function escapePointer(value: string): string {
  return value.replace(/~/g, '~0').replace(/\//g, '~1');
}

function pushUnique(values: string[], value: string): void {
  if (!values.includes(value)) values.push(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
