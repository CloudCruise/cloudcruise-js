/**
 * CloudCruise Vault API Type Definitions
 */

export interface VaultPostPutHeadersInBody {
  name: string;
  value: string;
}

export interface ProxyConfig {
  enable: boolean;
  target_ip?: string;
}

export interface VaultEntry {
  id?: string;
  domain: string;
  permissioned_user_id: string;
  workspace_id?: string;
  user_id?: string;
  password?: string;
  user_name?: string;
  tfa_secret?: string;
  user_agent?: string;
  user_alias?: string;
  location?: string;
  ip_address?: string;
  session_id?: string;
  allow_multiple_sessions?: boolean;
  cookies?: any;
  local_storage?: any;
  session_storage?: any;
  persist_cookies?: boolean;
  persist_local_storage?: boolean;
  persist_session_storage?: boolean;
  cookie_domain_to_store?: string | null;
  proxy?: ProxyConfig;
  proxy_string?: string | null;
  headers?: VaultPostPutHeadersInBody[];
  created_at?: string | null;
}


export interface GetVaultEntriesFilters {
  permissioned_user_id?: string;
  domain?: string;
  decryptCredentials?: boolean;
}

// Note: encryption helpers now use a concatenated hex format and no longer
// expose per-field encryption result types.
