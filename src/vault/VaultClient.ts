import type {
  GetTfaCodeOptions,
  GetVaultEntriesFilters,
  VaultEntry,
  VaultPinnedSettings,
  VaultTfaCode
} from './types.js';
import { VaultSiteSettingsClient } from './VaultSiteSettingsClient.js';
import { encryptSensitiveFields, decryptSensitiveFields } from './utils.js';

function validateProviderPayload(entry: Partial<VaultEntry>): void {
  const hasProviderId = entry.secret_provider_id !== undefined && entry.secret_provider_id !== null;
  const hasSecretRef = entry.secret_ref !== undefined && entry.secret_ref !== null;

  if (hasProviderId !== hasSecretRef) {
    throw new Error('secret_provider_id and secret_ref must be provided together');
  }

  if (entry.secret_cache_ttl_seconds !== undefined && entry.secret_cache_ttl_seconds !== null) {
    if (!Number.isInteger(entry.secret_cache_ttl_seconds) || entry.secret_cache_ttl_seconds < 0) {
      throw new Error('secret_cache_ttl_seconds must be a non-negative integer');
    }
    if (!hasProviderId) {
      throw new Error('secret_cache_ttl_seconds requires secret_provider_id and secret_ref');
    }
  }

  if (hasProviderId) {
    const conflicts = ['user_name', 'password', 'tfa_secret'].filter(
      field => entry[field as keyof VaultEntry] !== undefined && entry[field as keyof VaultEntry] !== null
    );
    if (entry.additional_fields?.length) {
      conflicts.push('additional_fields');
    }
    if (entry.security_questions?.length) {
      conflicts.push('security_questions');
    }
    if (conflicts.length > 0) {
      throw new Error(`provider-backed vault entries cannot include ${conflicts.join(', ')}`);
    }
  }
}

function withoutReadOnlyFields<T extends Partial<VaultEntry> & VaultPinnedSettings>(entry: T): T {
  const { additional_field_warnings, security_question_warnings, ...rest } = entry;
  if (!rest.pinned_settings?.length) {
    delete rest.pinned_settings;
  }
  return rest as T;
}

function isProviderBackedPayload(entry: Partial<VaultEntry>): boolean {
  return entry.secret_provider_id != null && entry.secret_ref != null;
}

export class VaultClient {
  private readonly makeRequest: <T = any>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    body?: any
  ) => Promise<T>;
  private readonly encryptionKey: string;

  /** Domain-level defaults that every vault entry on a domain inherits. */
  readonly siteSettings: VaultSiteSettingsClient;

  constructor(
    makeRequest: <T = any>(
      method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
      path: string,
      body?: any
    ) => Promise<T>,
    encryptionKey: string
  ) {
    this.makeRequest = makeRequest;
    this.encryptionKey = encryptionKey;
    this.siteSettings = new VaultSiteSettingsClient(makeRequest);
  }

  /**
   * Creates a new vault entry
   * @param domain - Target domain of the entry. Pass `undefined` or `null` to create an entry without a domain.
   * @param permissioned_user_id - User identifier for the vault entry
   */
  async create(
    domain: string | null | undefined,
    permissioned_user_id: string, 
    options?: Partial<Omit<VaultEntry, 'id' | 'created_at' | 'domain' | 'permissioned_user_id'>> &
      VaultPinnedSettings
  ): Promise<VaultEntry> {
    const entry = {
      ...(domain ? { domain } : {}),
      permissioned_user_id,
      ...options
    };
    validateProviderPayload(entry);
    
    let processedEntry = withoutReadOnlyFields(entry);
    
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
   * @param filters.domain - Filter by domain. Only valid together with `permissioned_user_id`.
   *   With the user ID alone the API returns that user ID's only entry and answers 409 when it has several.
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
   * The code returned depends on the 2FA method:
   * - Authenticator (TOTP): a freshly generated code, with `expires_in_seconds`.
   * - Email: the most recently received code (within the freshness window), with `received_at`.
   *
   * SMS and magic-link codes are not supported (the endpoint returns 409).
   *
   * @param permissioned_user_id - User identifier for the vault entry
   * @param domain - Target domain of the vault entry. Omit it while the user ID has a single entry; with several the API answers 409 and lists the domains.
   * @param options.method - 2FA method to read. Required when the entry has several `tfa_methods`.
   * @param options.field - Name of a `Totp` additional field whose code to return instead of the built-in seed's.
   */
  async getTfaCode(
    permissioned_user_id: string,
    options?: GetTfaCodeOptions
  ): Promise<VaultTfaCode>;
  async getTfaCode(
    permissioned_user_id: string,
    domain: string | null | undefined,
    options?: GetTfaCodeOptions
  ): Promise<VaultTfaCode>;
  async getTfaCode(
    permissioned_user_id: string,
    domainOrOptions?: string | null | GetTfaCodeOptions,
    maybeOptions?: GetTfaCodeOptions
  ): Promise<VaultTfaCode> {
    const domain =
      typeof domainOrOptions === 'object' && domainOrOptions !== null
        ? undefined
        : domainOrOptions;
    const options =
      typeof domainOrOptions === 'object' && domainOrOptions !== null
        ? domainOrOptions
        : maybeOptions;
    if (!permissioned_user_id) {
      throw new Error('permissioned_user_id is required to get a TFA code');
    }
    if (options?.field !== undefined && options.method !== undefined && options.method !== 'AUTHENTICATOR') {
      throw new Error('field requires method AUTHENTICATOR or no method');
    }
    const params = new URLSearchParams();
    params.append('permissioned_user_id', permissioned_user_id);
    if (domain) {
      params.append('domain', domain);
    }
    if (options?.method !== undefined) {
      params.append('method', options.method);
    }
    if (options?.field !== undefined) {
      params.append('field', options.field);
    }
    return await this.makeRequest<VaultTfaCode>(
      'GET',
      `/vault/tfa-code?${params.toString()}`
    );
  }

  /**
   * Updates an existing vault entry
   * @param updates - Vault entry updates including required fields
   * @param updates.permissioned_user_id - Required: User identifier for the vault entry
   * @param updates.domain - Optional: Target domain of the entry. Omit it while the user ID has a single entry.
   */
  async update(updates: Partial<VaultEntry> & VaultPinnedSettings & {
    permissioned_user_id: string;
    domain?: string | null;
  }): Promise<VaultEntry> {
    // Validate required fields
    if (!updates.permissioned_user_id) {
      throw new Error('permissioned_user_id is required for vault updates');
    }
    validateProviderPayload(updates);
    if (!isProviderBackedPayload(updates)) {
      if (!updates.user_name) {
        throw new Error('user_name is required for vault updates');
      }
      if (!updates.password) {
        throw new Error('password is required for vault updates');
      }
    }
    
    let processedEntry = withoutReadOnlyFields(updates);
    if (!processedEntry.domain) {
      delete processedEntry.domain;
    }
    
    // Encrypt sensitive fields
    processedEntry = await encryptSensitiveFields(processedEntry, this.encryptionKey);

    const response = await this.makeRequest<VaultEntry>('PUT', '/vault', processedEntry);
    
    // Decrypt response using encryption key
    return await decryptSensitiveFields(response, this.encryptionKey);
  }

  /**
   * Deletes a vault entry by permissioned user ID and, optionally, domain
   * @param params - Object containing permissioned_user_id and optionally domain
   * @param params.domain - The domain of the vault entry to delete. Omit it while the user ID has a single entry.
   * @param params.permissioned_user_id - The permissioned user ID of the vault entry to delete
   */
  async delete(params: { domain?: string | null; permissioned_user_id: string }): Promise<void> {
    const { domain, permissioned_user_id } = params;
    await this.makeRequest('DELETE', '/vault', {
      permissioned_user_id,
      ...(domain ? { domain } : {})
    });
  }
}
