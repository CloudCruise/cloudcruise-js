import { getEnv } from './utils/env.js';
import { VaultClient } from './vault/VaultClient.js';
import { SecretProvidersClient } from './secretProviders/SecretProvidersClient.js';
import { WorkflowsClient } from './workflows/WorkflowsClient.js';
import { RunsClient } from './runs/RunsClient.js';
import { WebhookClient } from './webhook/WebhookClient.js';
import { ConnectionManager } from './utils/connectionManager.js';

const DEFAULT_BASE_URL = 'https://api.cloudcruise.com';
const STAGING_BASE_URL = 'https://staging-api.cloudcruise.app';
const ALLOWED_BASE_URLS = new Set([DEFAULT_BASE_URL, STAGING_BASE_URL]);
const DEFAULT_API_HOST = new URL(DEFAULT_BASE_URL).host.toLowerCase();

export interface CloudCruiseParams {
  apiKey?: string;
  /**
   * CloudCruise API base URL. Authenticated requests are restricted to the
   * production CloudCruise API origin or the staging API origin.
   */
  baseUrl?: string;
  encryptionKey?: string;
}

function normalizeBaseUrl(baseUrl: string): string {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error(`Invalid baseUrl: ${baseUrl}`);
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`Invalid baseUrl protocol: ${url.protocol}. Use https: or http:.`);
  }

  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/+$/, '');
}

function assertBaseUrlAllowed(baseUrl: string): void {
  const url = new URL(baseUrl);
  const host = url.host.toLowerCase();

  if (host === DEFAULT_API_HOST && url.protocol !== 'https:') {
    throw new Error(`Refusing to send CloudCruise API key to "${baseUrl}". The default CloudCruise API host requires https:.`);
  }

  if (!ALLOWED_BASE_URLS.has(baseUrl)) {
    throw new Error(
      `Refusing to send CloudCruise API key to unapproved baseUrl "${baseUrl}". ` +
      `Authenticated requests are restricted to: ${Array.from(ALLOWED_BASE_URLS).join(", ")}.`
    );
  }
}

export class CloudCruise {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly encryptionKey: string;
  
  public readonly vault: VaultClient;
  public readonly secretProviders: SecretProvidersClient;
  public readonly workflows: WorkflowsClient;
  public readonly runs: RunsClient;
  public readonly webhook: WebhookClient;
  private readonly connectionManager: ConnectionManager;

  constructor(params?: CloudCruiseParams) {
    const apiKey = params?.apiKey ?? getEnv('CLOUDCRUISE_API_KEY');
    const baseUrl = params?.baseUrl ?? getEnv('CLOUDCRUISE_BASE_URL') ?? DEFAULT_BASE_URL;
    const encryptionKey = params?.encryptionKey ?? getEnv('CLOUDCRUISE_ENCRYPTION_KEY');

    if (!apiKey) {
      throw new Error('Missing apiKey. Provide via params.apiKey or CLOUDCRUISE_API_KEY env var.');
    }
    if (!encryptionKey) {
      throw new Error('Missing encryptionKey. Provide via params.encryptionKey or CLOUDCRUISE_ENCRYPTION_KEY env var.');
    }

    const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
    assertBaseUrlAllowed(normalizedBaseUrl);

    this.apiKey = apiKey;
    this.baseUrl = normalizedBaseUrl;
    this.encryptionKey = encryptionKey;
    
    // Initialize namespace clients
    this.connectionManager = new ConnectionManager(this.baseUrl, this.apiKey);
    this.vault = new VaultClient(this.makeRequest.bind(this), this.encryptionKey);
    this.secretProviders = new SecretProvidersClient(this.makeRequest.bind(this));
    this.workflows = new WorkflowsClient(this.makeRequest.bind(this));
    this.runs = new RunsClient(this.connectionManager, this.makeRequest.bind(this), this.workflows);
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
        return await response.json();
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
