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
  id: string;
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
  prevent_concurrency_during_login?: boolean | null;
  max_concurrency?: number | null;
  expiry_time_from_last_use?: string | null;
  expiry_time_from_session_data_set?: string | null;
  tfa_method?: 'AUTHENTICATOR' | 'EMAIL' | 'SMS' | null;
  cookies?: any;
  local_storage?: any;
  session_storage?: any;
  persist_cookies?: boolean | null;
  persist_local_storage?: boolean | null;
  persist_session_storage?: boolean | null;
  cookie_domain_to_store?: string | null;
  proxy?: ProxyConfig;
  proxy_string?: string | null;
  headers?: VaultPostPutHeadersInBody[];
  created_at?: string | null;
  session_data_set_at?: string | null;
  effective_expires_at?: string | null;
}


export interface GetVaultEntriesFilters {
  permissioned_user_id?: string;
  domain?: string;
  decryptCredentials?: boolean;
}
