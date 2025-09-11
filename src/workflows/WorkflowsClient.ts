import type {
  Workflow,
  WorkflowMetadata,
  WorkflowInputSchema
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
    const response = await this.makeRequest<Workflow[]>('GET', '/workflows');
    return Array.isArray(response) ? response : [response];
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

    const missingRequired = required.filter((k) => payload[k] === undefined);

    const invalidTypes: { field: string; expected: string[]; actual: string }[] = [];

    const getType = (v: any): string => {
      if (v === null) return 'null';
      if (Array.isArray(v)) return 'array';
      if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
      return typeof v;
    };

    for (const [key, expectedTypesRaw] of Object.entries(properties)) {
      if (!(key in payload)) continue;
      const expectedTypes = expectedTypesRaw.map((t) => String(t).toLowerCase());
      const actual = getType((payload as any)[key]);

      const ok =
        expectedTypes.includes('any') ||
        expectedTypes.includes(actual) ||
        (actual === 'integer' && expectedTypes.includes('number'));

      if (!ok) {
        invalidTypes.push({ field: key, expected: expectedTypesRaw, actual });
      }
    }

    if (missingRequired.length || invalidTypes.length) {
      const parts: string[] = [];
      if (missingRequired.length) parts.push(`missing required: ${missingRequired.join(', ')}`);
      if (invalidTypes.length) {
        parts.push(
          'invalid types: ' +
            invalidTypes
              .map((e) => `${e.field} expected [${e.expected.join(' | ')}], got ${e.actual}`)
              .join('; ')
        );
      }
      const msg = `Workflow input validation failed: ${parts.join(' | ')}`;
      throw new InputValidationError(msg, missingRequired, invalidTypes);
    }
  }
}