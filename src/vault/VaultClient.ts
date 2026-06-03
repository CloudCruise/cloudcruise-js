import type {
  GetVaultEntriesFilters,
  VaultEntry,
  VaultTfaCode
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
   * Gets the current 2FA code for a single vault entry.
   *
   * The code returned depends on the credential's 2FA method:
   * - Authenticator (TOTP): a freshly generated code, with `expires_in_seconds`.
   * - Email: the most recently received code (within the freshness window), with `received_at`.
   * - SMS: the most recently received code, but only when the workspace has a
   *   dedicated phone number; otherwise the request is rejected.
   *
   * Magic-link credentials are not supported.
   *
   * @param permissioned_user_id - User identifier for the vault entry
   * @param domain - Target domain of the vault entry
   */
  async getTfaCode(
    permissioned_user_id: string,
    domain: string
  ): Promise<VaultTfaCode> {
    if (!permissioned_user_id) {
      throw new Error('permissioned_user_id is required to get a TFA code');
    }
    if (!domain) {
      throw new Error('domain is required to get a TFA code');
    }
    const params = new URLSearchParams();
    params.append('permissioned_user_id', permissioned_user_id);
    params.append('domain', domain);
    return await this.makeRequest<VaultTfaCode>(
      'GET',
      `/vault/tfa-code?${params.toString()}`
    );
  }

  /**
   * Updates an existing vault entry
   * @param updates - Vault entry updates including required fields
   * @param updates.permissioned_user_id - Required: User identifier for the vault entry
   * @param updates.user_name - Required: Username or email
   * @param updates.password - Required: User password
   * @param updates.domain - Required: Target domain for the credentials
   */
  async update(updates: Partial<VaultEntry> & {
    permissioned_user_id: string;
    user_name: string;
    password: string;
    domain: string;
  }): Promise<VaultEntry> {
    // Validate required fields
    if (!updates.permissioned_user_id) {
      throw new Error('permissioned_user_id is required for vault updates');
    }
    if (!updates.user_name) {
      throw new Error('user_name is required for vault updates');
    }
    if (!updates.password) {
      throw new Error('password is required for vault updates');
    }
    if (!updates.domain) {
      throw new Error('domain is required for vault updates');
    }
    
    let processedEntry = { ...updates };
    
    // Encrypt sensitive fields
    processedEntry = await encryptSensitiveFields(processedEntry, this.encryptionKey);

    const response = await this.makeRequest<VaultEntry>('PUT', '/vault', processedEntry);
    
    // Decrypt response using encryption key
    return await decryptSensitiveFields(response, this.encryptionKey);
  }

  /**
   * Deletes a vault entry by domain and permissioned user ID
   * @param params - Object containing domain and permissioned_user_id
   * @param params.domain - The domain of the vault entry to delete
   * @param params.permissioned_user_id - The permissioned user ID of the vault entry to delete
   */
  async delete(params: { domain: string; permissioned_user_id: string }): Promise<void> {
    await this.makeRequest('DELETE', '/vault', params);
  }
}