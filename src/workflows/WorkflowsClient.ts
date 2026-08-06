import type {
  Workflow,
  WorkflowMetadata
} from './types.js';
import { validateInputSchema } from './validation.js';

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
    const response = await this.makeRequest<
      WorkflowMetadata | { metadata?: WorkflowMetadata }
    >('GET', path);
    if (
      response &&
      typeof response === 'object' &&
      !('input_schema' in response) &&
      response.metadata
    ) {
      return response.metadata;
    }
    return response as WorkflowMetadata;
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
    validateInputSchema(input_schema ?? {}, payload);
  }
}
