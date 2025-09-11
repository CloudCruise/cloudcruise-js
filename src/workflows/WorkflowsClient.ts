import type {
  Workflow,
  WorkflowMetadata,
  WorkflowInputSchema,
  WorkflowPropertySchema
} from './types.js';
import { InputValidationError } from './types.js';

export class WorkflowsClient {
  private readonly makeRequest: <T = any>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: any
  ) => Promise<T>;

  constructor(
    makeRequest: <T = any>(
      method: 'GET' | 'POST' | 'PUT' | 'DELETE',
      path: string,
      body?: any
    ) => Promise<T>
  ) {
    this.makeRequest = makeRequest;
  }

  /**
   * Retrieves all workflows of the workspace the API key is associated with
   */
  async getAllWorkflows(): Promise<Workflow[]> {
    return await this.makeRequest<Workflow[]>('GET', '/workflows');
  }

  /**
   * Retrieves the JSON schema of the input variables for a specific workflow
   * @param workflowId - The ID of the workflow
   */
  async getWorkflowMetadata(workflowId: string): Promise<WorkflowMetadata> {
    const path = `/workflows/${workflowId}/metadata`;
    return await this.makeRequest<WorkflowMetadata>('GET', path);
  }

  /**
   * Validates a payload against a workflow's input schema.
   * Throws InputValidationError if invalid; resolves if valid.
   */
  async validateWorkflowInput(
    workflowId: string,
    payload: Record<string, any>
  ): Promise<void> {
    const { input_schema } = await this.getWorkflowMetadata(workflowId);
    const schema: WorkflowInputSchema = input_schema ?? {};
    const properties = schema.properties ?? {};
    const required = schema.required ?? [];
    const disallowExtras = schema.additionalProperties === false;

    // Check only required keys for presence and type
    const missingRequired = required.filter((key) => payload[key] === undefined);

    // Keep track of invalid types, if any, for a useful error message.
    type TypeDetail = { field: string; expected_display: string; actual: string };
    const invalidTypes: TypeDetail[] = [];

    const detectType = (v: unknown): string => {
      if (v === null) return 'null';
      if (Array.isArray(v)) return 'array';
      if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
      return typeof v;
    };

    const allowedTypes = new Set(['array', 'boolean', 'integer', 'number', 'object', 'string', 'null']);
    const expectedTypesOf = (def: WorkflowPropertySchema | undefined): string[] => {
      if (!def) return [];
      // Normalize to array-of-strings from either string | string[] | { type: string | string[] }
      const raw = (typeof def === 'object' && !Array.isArray(def)) ? (def as any).type : (def as any);
      if (!raw) return [];
      const arr = Array.isArray(raw) ? raw : [raw];
      return arr
        .map((t) => String(t).toLowerCase())
        .filter((t) => allowedTypes.has(t));
    };

    const matches = (expected: string[], actual: string): boolean => {
      if (expected.length === 0) return true; // unknown => don't enforce
      if (expected.includes(actual)) return true;
      if (actual === 'integer' && expected.includes('number')) return true;
      return false;
    };

    // Validate types for:
    // - all required keys that are present
    // - optional keys if they exist in the payload
    for (const [key, schemaDef] of Object.entries(properties)) {
      if (payload[key] === undefined) continue; // optional and not provided
      const expected = expectedTypesOf(schemaDef);
      const actual = detectType(payload[key]);
      if (!matches(expected, actual)) {
        const exp = expected.length ? expected : ['any'];
        invalidTypes.push({ field: key, expected_display: exp.join(' | '), actual });
      }
    }

    // If additionalProperties is false, collect unknown keys present in payload
    const unknownKeys: string[] = disallowExtras
      ? Object.keys(payload).filter((k) => !(k in properties))
      : [];

    if (missingRequired.length || invalidTypes.length || unknownKeys.length) {
      const parts: string[] = [];
      if (missingRequired.length) parts.push(`missing required: ${missingRequired.join(', ')}`);
      if (invalidTypes.length) {
        parts.push(
          invalidTypes
            .map((e) => `${e.field}: expected ${e.expected_display}, got ${e.actual}`)
            .join('; ')
        );
      }
      if (unknownKeys.length) parts.push(`unknown keys: ${unknownKeys.join(', ')}`);
      const message = `Workflow input validation failed: ${parts.join(' | ')}`;
      throw new InputValidationError(message, missingRequired, invalidTypes, unknownKeys);
    }
  }
}
