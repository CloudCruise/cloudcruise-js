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

export type VaultTfaMethod = 'AUTHENTICATOR' | 'EMAIL' | 'MAGIC_LINK' | 'SMS';

export type VaultFieldType =
  | 'Text'
  | 'Email'
  | 'Url'
  | 'Phone'
  | 'Date'
  | 'MonthYear'
  | 'Address'
  | 'Concealed'
  | 'Totp';

export interface VaultAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

/**
 * A named, typed value on a vault entry. `value` is an object only for
 * `Address`. Workflows read it as `{{context.inputs.<ALIAS>.FIELDS.<name>}}`.
 */
export interface VaultAdditionalField {
  name: string;
  type: VaultFieldType;
  value: string | VaultAddress;
}

export interface VaultAdditionalFieldWarning {
  name: string;
  reason:
    | 'duplicate_name'
    | 'too_many_fields'
    | 'value_too_large'
    | 'name_too_long'
    | 'invalid_value'
    | 'unsupported_type'
    | 'reserved_name';
}

/**
 * A security question and its answer, answered by a `SECURITY_QUESTION` TFA node.
 */
export interface VaultSecurityQuestion {
  question: string;
  answer: string;
}

export interface VaultSecurityQuestionWarning {
  question: string;
  reason:
    | 'duplicate_question'
    | 'too_many_questions'
    | 'question_too_long'
    | 'answer_too_large'
    | 'invalid_value';
}

export interface VaultEntry {
  id: string;
  domain: string;
  permissioned_user_id: string;
  workspace_id?: string;
  user_id?: string;
  password?: string;
  user_name?: string;
  secret_provider_id?: string | null;
  secret_ref?: string | null;
  secret_cache_ttl_seconds?: number | null;
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
  tfa_methods?: VaultTfaMethod[];
  /** @deprecated Use `tfa_methods`. Reads as the first of `tfa_methods`. */
  tfa_method?: VaultTfaMethod | null;
  /** Replaces the entry's additional fields on create and update. */
  additional_fields?: VaultAdditionalField[];
  /** Skipped fields of the bound secret provider item. Read-only. */
  additional_field_warnings?: VaultAdditionalFieldWarning[];
  /** Ordered. Replaces the entry's security questions on create and update. */
  security_questions?: VaultSecurityQuestion[];
  /** Skipped security questions of the bound secret provider item. Read-only. */
  security_question_warnings?: VaultSecurityQuestionWarning[];
  cookies?: any;
  local_storage?: any;
  session_storage?: any;
  persist_cookies?: boolean | null;
  persist_local_storage?: boolean | null;
  persist_session_storage?: boolean | null;
  cookie_domain_to_store?: string | null;
  proxy?: ProxyConfig;
  proxy_string?: string | null;
  proxy_setting?: 'random' | 'static' | 'country' | 'custom' | null;
  proxy_value?: string | null;
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

export type SecretProviderType = '1password';

export interface SecretProvider {
  id: string;
  provider_type: SecretProviderType;
  name: string;
  cache_ttl_seconds?: number | null;
}

export interface SecretProviderItem {
  id: string;
  title: string;
  ref: string;
  vaultName?: string | null;
}

/**
 * The current 2FA code for a vault entry. `expires_in_seconds` is present for
 * authenticator (TOTP) codes; `received_at` is present for email codes.
 */
export interface VaultTfaCode {
  type: 'authenticator' | 'email';
  code: string;
  expires_in_seconds?: number;
  received_at?: string;
}

export interface GetTfaCodeOptions {
  /** 2FA method to read. Required when the entry has several `tfa_methods`. */
  method?: VaultTfaMethod;
  /** Name of a `Totp` additional field. Implies `method: 'AUTHENTICATOR'`. */
  field?: string;
}
