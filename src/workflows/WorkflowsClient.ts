import type {
  Workflow,
  WorkflowErrorReport,
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
   * Retrieves a comprehensive report of errors that occurred during workflow executions 
   * within a specified timeframe
   * @param workflowId - The ID of the workflow to get errors for
   * @param startTimestamp - Start of the time range (ISO 8601 format, e.g., 2024-03-20T10:00:00Z)
   * @param endTimestamp - End of the time range (ISO 8601 format, e.g., 2024-03-20T11:00:00Z)
   */
  async getErrorReport(
    workflowId: string,
    startTimestamp: string,
    endTimestamp: string
  ): Promise<WorkflowErrorReport> {
    const params = new URLSearchParams({
      workflow_id: workflowId,
      start_timestamp: startTimestamp,
      end_timestamp: endTimestamp
    });
    
    const path = `/reporting/errors?${params.toString()}`;
    return await this.makeRequest<WorkflowErrorReport>('GET', path);
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