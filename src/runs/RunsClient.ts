import type {
  StartRunRequest,
  StartRunResponse,
  UserInteractionData,
  RunResult,
  WebhookReplayResponse
} from './types.js';

export class RunsClient {
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
   * Initiates a new browser agent run
   * @param request - Configuration for starting the workflow execution
   * @returns Promise resolving to session ID
   */
  async start(request: StartRunRequest): Promise<StartRunResponse> {
    return await this.makeRequest<StartRunResponse>('POST', '/run', request);
  }

  /**
   * Submits user interaction data during an active run
   * @param sessionId - The unique identifier for the workflow execution session
   * @param data - User input data as key-value pairs
   */
  async submitUserInteraction(sessionId: string, data: UserInteractionData): Promise<void> {
    const path = `/run/${sessionId}/user_interaction`;
    await this.makeRequest<void>('POST', path, data);
  }

  /**
   * Retrieves comprehensive results and execution details for a specific run
   * @param sessionId - The unique identifier for the workflow execution session
   * @returns Promise resolving to complete run results
   */
  async getResults(sessionId: string): Promise<RunResult> {
    const path = `/run/${sessionId}`;
    return await this.makeRequest<RunResult>('GET', path);
  }

  /**
   * Interrupts a running browser agent run
   * @param sessionId - The unique identifier for the workflow execution session
   */
  async interrupt(sessionId: string): Promise<void> {
    const path = `/run/${sessionId}/interrupt`;
    await this.makeRequest<void>('POST', path);
  }

  /**
   * Replays all webhooks that were sent during a session
   * @param sessionId - The ID of the session to replay webhooks for
   * @returns Promise resolving to webhook replay results
   */
  async replayWebhooks(sessionId: string): Promise<WebhookReplayResponse> {
    const path = `/webhooks/${sessionId}/replay`;
    return await this.makeRequest<WebhookReplayResponse>('POST', path);
  }
}