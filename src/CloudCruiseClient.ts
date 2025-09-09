import type {
  GetVaultEntriesFilters,
  VaultEntry
} from './vault/types.js';
import { encryptSensitiveFields, decryptSensitiveFields } from './vault/utils.js';

export interface CloudCruiseClientParams {
  apiKey: string;
  baseUrl: string;
  encryptionKey?: string;
}

export class CloudCruiseClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly encryptionKey?: string;

  constructor(params: CloudCruiseClientParams) {
    this.apiKey = params.apiKey;
    this.baseUrl = params.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.encryptionKey = params.encryptionKey;
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

  /**
   * Creates a new vault entry
   */
  async createVaultEntry(
    domain: string, 
    permissioned_user_id: string, 
    options?: Partial<Omit<VaultEntry, 'id' | 'created_at' | 'domain' | 'permissioned_user_id'>>
  ): Promise<VaultEntry> {
    const entry = {
      domain,
      permissioned_user_id,
      ...options
    };
    
    let processedEntry = { ...entry };
    
    // Encrypt sensitive fields if encryption key is provided
    if (this.encryptionKey) {
      processedEntry = await encryptSensitiveFields(processedEntry, this.encryptionKey);
    }

    const response = await this.makeRequest<VaultEntry>('POST', '/vault', processedEntry);
    
    // Decrypt response if encryption was used
    if (this.encryptionKey) {
      return await decryptSensitiveFields(response, this.encryptionKey);
    }
    
    return response;
  }

  /**
   * Gets vault entries, optionally filtered
   */
  async getVaultEntries(filters?: GetVaultEntriesFilters): Promise<VaultEntry[]> {
    let path = '/vault';
    
    if (filters && (filters.permissioned_user_id || filters.domain)) {
      const params = new URLSearchParams();
      if (filters.permissioned_user_id) {
        params.append('permissioned_user_id', filters.permissioned_user_id);
      }
      if (filters.domain) {
        params.append('domain', filters.domain);
      }
      path += `?${params.toString()}`;
    }

    const response = await this.makeRequest<VaultEntry[]>('GET', path);
    let entries = Array.isArray(response) ? response : [response];
    
    // Decrypt sensitive fields if encryption key is provided
    if (this.encryptionKey) {
      entries = await Promise.all(
        entries.map(entry => decryptSensitiveFields(entry, this.encryptionKey!))
      );
    }
    
    return entries;
  }

  /**
   * Updates an existing vault entry
   */
  async updateVaultEntry(id: string, updates: Partial<VaultEntry>): Promise<VaultEntry> {
    const entry = {
      id,
      ...updates
    };
    
    let processedEntry = { ...entry };
    
    // Encrypt sensitive fields if encryption key is provided
    if (this.encryptionKey) {
      processedEntry = await encryptSensitiveFields(processedEntry, this.encryptionKey);
    }

    const response = await this.makeRequest<VaultEntry>('PUT', '/vault', processedEntry);
    
    // Decrypt response if encryption was used
    if (this.encryptionKey) {
      return await decryptSensitiveFields(response, this.encryptionKey);
    }
    
    return response;
  }

  /**
   * Deletes a vault entry by ID
   */
  async deleteVaultEntry(id: string): Promise<void> {
    await this.makeRequest('DELETE', '/vault', { id });
  }
}