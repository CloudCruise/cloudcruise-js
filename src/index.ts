/**
 * CloudCruise JavaScript/TypeScript SDK
 * Official client library for the CloudCruise Platform
 */

// Main client export
export { CloudCruiseClient } from './CloudCruiseClient.js';
export type { CloudCruiseClientParams } from './CloudCruiseClient.js';

// Vault type exports
export type {
  VaultEntry,
  GetVaultEntriesFilters,
  ProxyConfig,
  VaultPostPutHeadersInBody
} from './vault/types.js';