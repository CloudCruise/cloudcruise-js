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

// Get filtered vault entries (both parameters required together)
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

// Update a vault entry
const updatedEntry = await client.vault.update({
  permissioned_user_id: entry.permissioned_user_id,
  user_name: entry.user_name, // Required field
  password: "new_secure_password", // Required field - automatically encrypted
  domain: entry.domain, // Required field
  user_alias: "Updated Account Name", // Human-readable identifier
  allow_multiple_sessions: true, // Allow concurrent workflow usage
});

// Delete a vault entry
await client.vault.delete({ 
  permissioned_user_id: "user123", 
  domain: "https://example.com" 
});

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
- [Get 2FA Code](https://docs.cloudcruise.com/vault-api/get-vault-tfa-code.md) - Read the current 2FA code of an entry

**Note:** The official documentation is the authoritative source for current API capabilities and supported parameters. SDK features may vary based on the API version.
