import type {
  Workflow,
  WorkflowMetadata
} from './types.js';

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
}