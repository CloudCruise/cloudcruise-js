# Vault Client

The Vault Client provides secure, encrypted credential storage with client-side AES-256-GCM encryption. Manage user credentials safely with automatic encryption and decryption.

## Usage

### Basic Operations

```typescript
import { CloudCruiseClient } from "cloudcruise";

const client = new CloudCruiseClient({
  apiKey: "your-api-key",
  encryptionKey: "your-hex-encryption-key", // Required for vault operations
});

// Create a vault entry
// variables like user_name, password and tfa_secret or automatically encrypted
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
const updatedEntry = await client.vault.update(entry.id!, {
  password: "new_secure_password", // Automatically encrypted
  user_alias: "Updated Account Name", // Human-readable identifier
  allow_multiple_sessions: true, // Allow concurrent workflow usage
});

// Delete a vault entry
await client.vault.delete("https://example.com", "user123");
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
```

## Official API Documentation

For the most up-to-date information about supported parameters and API specifications, please refer to the official CloudCruise API documentation:

- [Create Vault Entry](https://docs.cloudcruise.com/vault-api/create-vault-entry.md) - Complete specification for creating vault entries
- [Get Vault Entries](https://docs.cloudcruise.com/vault-api/get-vault-entries.md) - Retrieve and filter vault entries
- [Update Vault Entry](https://docs.cloudcruise.com/vault-api/update-vault-entry.md) - Update existing vault entries
- [Delete Vault Entry](https://docs.cloudcruise.com/vault-api/delete-vault-entry.md) - Remove vault entries

**Note:** The official documentation is the authoritative source for current API capabilities and supported parameters. SDK features may vary based on the API version.
