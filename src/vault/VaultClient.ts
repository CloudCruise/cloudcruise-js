import type {
  GetVaultEntriesFilters,
  VaultEntry
} from './types.js';
import { encryptSensitiveFields, decryptSensitiveFields } from './utils.js';

export class VaultClient {
  private readonly makeRequest: <T = any>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: any
  ) => Promise<T>;
  private readonly encryptionKey: string;

  constructor(
    makeRequest: <T = any>(
      method: 'GET' | 'POST' | 'PUT' | 'DELETE',
      path: string,
      body?: any
    ) => Promise<T>,
    encryptionKey: string
  ) {
    this.makeRequest = makeRequest;
    this.encryptionKey = encryptionKey;
  }

  /**
   * Creates a new vault entry
   */
  async create(
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
    
    // Encrypt sensitive fields
    processedEntry = await encryptSensitiveFields(processedEntry, this.encryptionKey);

    const response = await this.makeRequest<VaultEntry>('POST', '/vault', processedEntry);
    
    // Decrypt response using encryption key
    return await decryptSensitiveFields(response, this.encryptionKey);
  }

  /**
   * Gets vault entries, optionally filtered
   * @param filters - Optional filters for the request
   * @param filters.permissioned_user_id - Filter by user ID
   * @param filters.domain - Filter by domain
   * @param filters.decryptCredentials - Whether to decrypt sensitive fields (default: true)
   */
  async get(filters?: GetVaultEntriesFilters): Promise<VaultEntry[]> {
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
    
    // Conditionally decrypt sensitive fields based on decryptCredentials flag
    const shouldDecrypt = filters?.decryptCredentials !== false;
    if (shouldDecrypt) {
      entries = await Promise.all(
        entries.map(entry => decryptSensitiveFields(entry, this.encryptionKey))
      );
    }
    
    return entries;
  }

  /**
   * Updates an existing vault entry
   */
  async update(id: string, updates: Partial<VaultEntry>): Promise<VaultEntry> {
    const entry = {
      id,
      ...updates
    };
    
    let processedEntry = { ...entry };
    
    // Encrypt sensitive fields
    processedEntry = await encryptSensitiveFields(processedEntry, this.encryptionKey);

    const response = await this.makeRequest<VaultEntry>('PUT', '/vault', processedEntry);
    
    // Decrypt response using encryption key
    return await decryptSensitiveFields(response, this.encryptionKey);
  }

  /**
   * Deletes a vault entry by domain and permissioned user ID
   * @param domain - The domain of the vault entry to delete
   * @param permissioned_user_id - The permissioned user ID of the vault entry to delete
   */
  async delete(domain: string, permissioned_user_id: string): Promise<void> {
    await this.makeRequest('DELETE', '/vault', { domain, permissioned_user_id });
  }
}