/**
 * CloudCruise Vault API Type Definitions
 * Based on the backend VaultPostPutRequest DTO
 */

export interface VaultPostPutHeadersInBody {
  name: string;
  value: string;
}

export interface ProxyConfig {
  enable: boolean;
  target_ip?: string;
}

/**
 * Core vault entry interface matching backend DTO
 */
export interface VaultEntry {
  id?: string;
  domain: string;
  permissioned_user_id: string;
  workspace_id?: string;
  user_id?: string;
  
  // Authentication fields
  password?: string;
  user_name?: string;
  tfa_secret?: string;
  
  // Browser automation
  user_agent?: string;
  user_alias?: string;
  location?: string;
  ip_address?: string;
  
  // Session management
  session_id?: string;
  allow_multiple_sessions?: boolean;
  
  // Storage persistence
  cookies?: any;
  local_storage?: any;
  session_storage?: any;
  persist_cookies?: boolean;
  persist_local_storage?: boolean;
  persist_session_storage?: boolean;
  cookie_domain_to_store?: string | null;
  
  // Proxy configuration
  proxy?: ProxyConfig;
  proxy_string?: string | null;
  
  // Headers
  headers?: VaultPostPutHeadersInBody[];
  
  // Timestamps
  created_at?: string | null;
}

/**
 * Request types for vault operations
 */
export interface CreateVaultEntryRequest extends Omit<VaultEntry, 'id' | 'created_at'> {}

export interface UpdateVaultEntryRequest extends VaultEntry {
  id: string;
}

/**
 * Filter options for getting vault entries
 */
export interface GetVaultEntriesFilters {
  permissioned_user_id?: string;
  domain?: string;
}

/**
 * Encryption utilities types
 */
export interface EncryptionResult {
  encrypted: string;
  iv: string;
  authTag: string;
}

export interface DecryptionParams {
  encrypted: string;
  iv: string;
  authTag: string;
  key: string;
}