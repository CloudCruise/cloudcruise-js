# Vault Client

The Vault Client provides secure, encrypted credential storage with client-side AES-256-GCM encryption. Manage user credentials safely with automatic encryption and decryption.

## Usage

### Basic Operations

```typescript
import { CloudCruise } from "cloudcruise";

const client = new CloudCruise({
  apiKey: "your-api-key",
  encryptionKey: "your-hex-encryption-key", // Required for vault operations
});

// Create a vault entry
// user_name, password and tfa_secret are encrypted automatically
const entry = await client.vault.create("https://example.com", "user123", {
  user_name: "john_doe",
  password: "secure_password",
  tfa_secret: "JBSWY3DPEHPK3PXP",
  user_alias: "John's Main Account",
});

// Get all vault entries (automatically decrypted)
const allEntries = await client.vault.get();

// Get one vault entry by user ID and domain
const filteredEntries = await client.vault.get({
  permissioned_user_id: "user123",
  domain: "https://example.com",
});

// Get entries without decrypting sensitive fields
// NOTE: The variables are returned encrypted, and the decryption happens client-side automatically, if enabled.
const encryptedEntries = await client.vault.get({
  permissioned_user_id: "user123",
  domain: "https://example.com",
  decryptCredentials: false, // Keep sensitive fields encrypted
});

// Get the only entry of a user ID without naming its domain.
// `domain` is only valid together with `permissioned_user_id`. The API answers
// 409 and lists the domains when the user ID has several entries.
const onlyEntry = await client.vault.get({ permissioned_user_id: "user123" });

// Update a vault entry
const updatedEntry = await client.vault.update({
  permissioned_user_id: entry.permissioned_user_id,
  user_name: entry.user_name, // Required field
  password: "new_secure_password", // Required field - automatically encrypted
  domain: entry.domain ?? undefined, // Optional while the user ID has a single entry
  user_alias: "Updated Account Name", // Human-readable identifier
  allow_multiple_sessions: true, // Allow concurrent workflow usage
});

// Delete a vault entry
await client.vault.delete({ 
  permissioned_user_id: "user123", 
  domain: "https://example.com" 
});

// Delete the only entry of a user ID without naming its domain
await client.vault.delete({ permissioned_user_id: "user456" });

// Get the current 2FA code for an entry with one 2FA method
const tfa = await client.vault.getTfaCode("user123", "https://example.com");
// Authenticator -> { type: "authenticator", code: "123456", expires_in_seconds: 23 }
// Email         -> { type: "email", code: "884512", received_at: "..." }
// (SMS and magic-link codes are not supported.)

// Entry with several 2FA methods: pick one
await client.vault.getTfaCode("user123", "https://example.com", { method: "EMAIL" });

// Code of a Totp additional field instead of the built-in seed (implies AUTHENTICATOR)
await client.vault.getTfaCode("user123", "https://example.com", { field: "Backup authenticator" });
```

### Entries Without a Domain

`domain` is optional wherever an entry is addressed by user ID and domain. With
the user ID alone, the API uses that user ID's only entry and answers 409 (with
the list of domains) when the user ID has several. Responses carry
`domain: null` for an entry without a domain.

```typescript
// Create an entry without a domain: pass undefined or null as the domain
const entry = await client.vault.create(undefined, "user123", {
  user_name: "john_doe",
  password: "secure_password",
});
entry.domain; // null

// The user ID alone addresses the entry
await client.vault.update({
  permissioned_user_id: "user123",
  user_name: "john_doe",
  password: "new_secure_password",
});
await client.vault.getTfaCode("user123");
await client.vault.getTfaCode("user123", { method: "EMAIL" });
```

A workflow's `vault_schema` entry can omit `domain` too:
`{ "type": "credential" }`.

### Domain Settings

Session persistence, concurrency, expiry and the login workflow can be set once
per domain with `client.vault.siteSettings`. Every vault entry on the domain
inherits them unless it sets its own value.

```typescript
// List the workspace's domains with their defaults, entry counts and
// how many entries override each setting
const sites = await client.vault.siteSettings.list();

// Set defaults for a domain. Only the given settings change; null clears one.
const site = await client.vault.siteSettings.update({
  domain: "example.com",
  max_concurrency: 2,
  persist_cookies: true,
  expiry_time_from_last_use: null,
});

// List the entries on a domain with the settings each one sets itself
const entries = await client.vault.siteSettings.listEntries("example.com");
// [{ id, permissioned_user_id, overridden: ["max_concurrency"] }]

// Remove the own settings of some entries (or, without entry_ids, of every
// entry on the domain) so they read the domain defaults again
await client.vault.siteSettings.applyDefaults({
  domain: "example.com",
  entry_ids: [entries[0].id],
});

// Get the settings one entry overrides
const overrides = await client.vault.siteSettings.getOverrides("user123", "example.com");
// { id, domain: "example.com", overridden: ["max_concurrency"] }

// Reset some of an entry's own settings to the domain's
await client.vault.siteSettings.clearOverrides({
  permissioned_user_id: "user123",
  domain: "example.com", // optional while the user ID has a single entry
  keys: ["max_concurrency"],
});
```

On a domain, a `null` setting means no default is set and the platform default
applies, and `max_concurrency` is at least 1. On an entry, `null` means the entry
inherits the domain's value. To turn a limit off on one entry although its domain
sets it, set `max_concurrency: -1` or a zero interval (`"0 seconds"`) for
`expiry_time_from_last_use` or `expiry_time_from_session_data_set`.

### Additional Fields, 2FA Methods and Security Questions

```typescript
await client.vault.create("https://example.com", "user123", {
  user_name: "john_doe",
  password: "secure_password",
  tfa_methods: ["AUTHENTICATOR", "EMAIL"],
  additional_fields: [{ name: "Member ID", type: "Text", value: "A-1029" }],
  security_questions: [{ question: "What was your first pet called?", answer: "Rex" }],
});
```

Field values, questions and answers are encrypted client-side. Each list replaces
the stored one. `tfa_method` is deprecated in favour of `tfa_methods`. Field
types and limits: [Additional fields](https://docs.cloudcruise.com/concepts/vault#additional-fields).

### Provider-Backed Credentials

Use `secretProviders` to find a connected 1Password account and item ref, then
bind a vault entry to that item instead of sending `user_name` / `password`.

```typescript
const providers = await client.secretProviders.list();
const items = await client.secretProviders.listItems(providers[0].id);

const entry = await client.vault.create("https://example.com", "user123", {
  secret_provider_id: providers[0].id,
  secret_ref: items[0].ref,
  secret_cache_ttl_seconds: 300,
});
```

### Advanced Configuration

```typescript
// Create entry with additional settings
await client.vault.create("https://app.example.com", "user123", {
  password: "secure_password",
  user_name: "john_doe",
  tfa_secret: "JBSWY3DPEHPK3PXP",
  user_alias: "Production Account",

  // Session management
  allow_multiple_sessions: false, // Prevent concurrent workflow usage

  // Browser state persistence
  persist_cookies: true,
  persist_local_storage: true,
  persist_session_storage: true,

  // Proxy configuration (basic)
  proxy: {
    enable: true,
    target_ip: "192.168.1.100",
  },
});

// Managed proxy via proxy_setting / proxy_value
await client.vault.create("https://app.example.com", "user123", {
  proxy_setting: "country", // "random" | "static" | "country" | "custom"
  proxy_value: "US", // country code for "country"; target IP for "static"
});

// Custom (bring-your-own) proxy — Enterprise only.
// proxy_value is encrypted client-side with your workspace key, exactly like
// password/tfa_secret. Supported forms: socks5://, http://, https:// (with
// optional user:pass@). A SOCKS5 proxy with UDP support is preferred.
await client.vault.create("https://app.example.com", "user123", {
  proxy_setting: "custom",
  proxy_value: "socks5://user:pass@proxy.example.com:1080",
});
```

## Official API Documentation

For the most up-to-date information about supported parameters and API specifications, please refer to the official CloudCruise API documentation:

- [Create Vault Entry](https://docs.cloudcruise.com/vault-api/create-vault-entry.md) - Complete specification for creating vault entries
- [Get Vault Entries](https://docs.cloudcruise.com/vault-api/get-vault-entries.md) - Retrieve and filter vault entries
- [Update Vault Entry](https://docs.cloudcruise.com/vault-api/update-vault-entry.md) - Update existing vault entries
- [Delete Vault Entry](https://docs.cloudcruise.com/vault-api/delete-vault-entry.md) - Remove vault entries
- [Domain Settings](https://docs.cloudcruise.com/concepts/vault#domain-settings) - How entries inherit settings from their domain
- [Get 2FA Code](https://docs.cloudcruise.com/vault-api/get-vault-tfa-code.md) - Read the current 2FA code of an entry

**Note:** The official documentation is the authoritative source for current API capabilities and supported parameters. SDK features may vary based on the API version.
