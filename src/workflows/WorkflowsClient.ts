import type {
  Workflow,
  WorkflowBranch,
  WorkflowMetadata,
  WorkflowVersion,
  WorkflowVersionSelector
} from './types.js';
import { validateInputSchema } from './validation.js';

function selectorQuery(selector: WorkflowVersionSelector = {}): string {
  const params = new URLSearchParams();
  if (selector.workflow_version != null) params.set('version', selector.workflow_version);
  if (selector.workflow_branch_id != null) params.set('branch_id', selector.workflow_branch_id);
  if ([...params.keys()].length > 1) {
    throw new Error('Only one of workflow_version, workflow_branch_id may be provided');
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

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
   * @param selector - Optional version or branch to describe instead of the default branch's latest version
   */
  async getWorkflowMetadata(
    workflowId: string,
    selector?: WorkflowVersionSelector
  ): Promise<WorkflowMetadata> {
    const query = selectorQuery(selector);
    const path = `/workflows/${workflowId}/metadata${query}`;
    const response = await this.makeRequest<
      WorkflowMetadata | { metadata?: WorkflowMetadata }
    >('GET', path);
    if (query && response && typeof response === 'object' && !('version_id' in response)) {
      throw new Error(
        'This CloudCruise API does not support selecting a workflow version or branch for metadata yet; its response describes the default branch instead'
      );
    }
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
   * Lists every version of a workflow across all branches, newest first
   * @param workflowId - The ID of the workflow
   */
  async listWorkflowVersions(workflowId: string): Promise<WorkflowVersion[]> {
    return await this.makeRequest<WorkflowVersion[]>('GET', `/workflows/${workflowId}/versions`);
  }

  /**
   * Lists a workflow's branches, oldest first; `is_default` marks the default branch
   * @param workflowId - The ID of the workflow
   */
  async listWorkflowBranches(workflowId: string): Promise<WorkflowBranch[]> {
    return await this.makeRequest<WorkflowBranch[]>('GET', `/workflows/${workflowId}/branches`);
  }

  /**
   * Validates a payload against a workflow version's input schema.
   * Throws InputValidationError if invalid; resolves if valid.
   * @param selector - Optional version or branch to validate against, as in getWorkflowMetadata
   */
  async validateWorkflowInput(
    workflowId: string,
    payload: Record<string, any>,
    selector?: WorkflowVersionSelector
  ): Promise<void> {
    const { input_schema } = await this.getWorkflowMetadata(workflowId, selector);
    validateInputSchema(input_schema ?? {}, payload);
  }
}
