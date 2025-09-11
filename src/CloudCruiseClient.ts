import { getEnv } from './utils/env.js';
import { VaultClient } from './vault/VaultClient.js';
import { WorkflowsClient } from './workflows/WorkflowsClient.js';
import { RunsClient } from './runs/RunsClient.js';
import { WebhookClient } from './webhook/WebhookClient.js';
import { ConnectionManager } from './utils/connectionManager.js';

export interface CloudCruiseClientParams {
  apiKey?: string;
  baseUrl?: string;
  encryptionKey?: string;
}

export class CloudCruiseClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly encryptionKey: string;
  
  public readonly vault: VaultClient;
  public readonly workflows: WorkflowsClient;
  public readonly runs: RunsClient;
  public readonly webhook: WebhookClient;
  private readonly connectionManager: ConnectionManager;

  constructor(params?: CloudCruiseClientParams) {
    const apiKey = params?.apiKey ?? getEnv('CLOUDCRUISE_API_KEY');
    const baseUrl = params?.baseUrl ?? getEnv('CLOUDCRUISE_BASE_URL') ?? 'https://api.cloudcruise.com';
    const encryptionKey = params?.encryptionKey ?? getEnv('CLOUDCRUISE_ENCRYPTION_KEY');

    if (!apiKey) {
      throw new Error('Missing apiKey. Provide via params.apiKey or CLOUDCRUISE_API_KEY env var.');
    }
    if (!encryptionKey) {
      throw new Error('Missing encryptionKey. Provide via params.encryptionKey or CLOUDCRUISE_ENCRYPTION_KEY env var.');
    }

    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.encryptionKey = encryptionKey;
    
    // Initialize namespace clients
    this.connectionManager = new ConnectionManager(this.baseUrl, this.apiKey);
    this.vault = new VaultClient(this.makeRequest.bind(this), this.encryptionKey);
    this.workflows = new WorkflowsClient(this.makeRequest.bind(this));
    this.runs = new RunsClient(this.makeRequest.bind(this), this.workflows, this.connectionManager);
    this.webhook = new WebhookClient();
  }

  /**
   * Makes an HTTP request to the CloudCruise API
   * Automatically adds the cc-key header for authentication
   */
  private async makeRequest<T = any>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: any
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'cc-key': this.apiKey
    };

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.message || errorJson.error || errorMessage;
        } catch {
          // Use HTTP status if we can't parse error response
        }
        
        throw new Error(errorMessage);
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const jsonResponse = await response.json();
        return jsonResponse.data || jsonResponse;
      } else {
        return await response.text() as unknown as T;
      }
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      } else {
        throw new Error(`Request failed: ${String(error)}`);
      }
    }
  }

}
