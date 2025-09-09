# CloudCruise JavaScript/TypeScript SDK

The official CloudCruise client library for JavaScript and TypeScript applications. This SDK provides seamless integration with CloudCruise's vault APIs, featuring automatic authentication, client-side encryption, and comprehensive TypeScript support.

## Installation

```bash
npm install cloudcruise
```

## Quick Start

```typescript
import { CloudCruiseClient } from "cloudcruise";

// Option A: Provide params explicitly
const client = new CloudCruiseClient({
  apiKey: "your-api-key",
  baseUrl: "https://api.cloudcruise.com",
  encryptionKey: "your-hex-encryption-key", // Required
});

// Option B: Use environment variables
// CLOUDCRUISE_API_KEY, CLOUDCRUISE_BASE_URL, CLOUDCRUISE_ENCRYPTION_KEY
const clientFromEnv = new CloudCruiseClient();

// Create a vault entry (the method you requested!)
await client.createVaultEntry("https://example.com", "user123", {
  user_name: "john_doe",       // Automatically encrypted
  password: "secure_password", // Automatically encrypted
});
```

## Usage Examples

### Basic Vault Operations

```typescript
import { CloudCruiseClient } from "cloudcruise";

const client = new CloudCruiseClient({
  apiKey: "your-api-key",
  baseUrl: "https://api.cloudcruise.com",
  encryptionKey: "your-hex-encryption-key", // Required
});

// Create a vault entry
const newEntry = await client.createVaultEntry("https://example.com", "user123", {
  user_name: "john_doe",             // Automatically encrypted
  password: "secure_password",       // Automatically encrypted
  tfa_secret: "JBSWY3DPEHPK3PXP",    // Automatically encrypted
});

// Get all vault entries (automatically decrypted)
const allEntries = await client.getVaultEntries();

// Get specific vault entries with filters
const filteredEntries = await client.getVaultEntries({
  permissioned_user_id: "user123",
  domain: "https://example.com",
});

// Update a vault entry
const updatedEntry = await client.updateVaultEntry(newEntry.id!, {
  password: "new_secure_password", // Automatically encrypted
});

// Delete a vault entry
await client.deleteVaultEntry(newEntry.id);
```

### Advanced Browser Automation Features

```typescript
// Create entry with browser automation settings
await client.createVaultEntry("https://app.example.com", "user123", {
  password: "secure_password",
  user_name: "john_doe",

  // Browser settings
  user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)...",
  persist_cookies: true,
  persist_local_storage: true,

  // Proxy configuration
  proxy: {
    enable: true,
    target_ip: "192.168.1.100",
  },

  // Custom headers
  headers: [{ name: "Custom-Header", value: "custom-value" }],
});
```

### Encryption Support

Client-side encryption is required for write operations (create/update) and is used to decrypt sensitive fields when reading entries. Sensitive fields include `user_name`, `password`, and `tfa_secret`.

```typescript
import { CloudCruiseClient } from "cloudcruise";

// Enable automatic encryption/decryption
const client = new CloudCruiseClient({
  apiKey: "your-api-key",
  baseUrl: "https://api.cloudcruise.com",
  encryptionKey: "your-64-char-hex-encryption-key", // 32 bytes as hex, required
});

// Sensitive fields (user_name, password, tfa_secret) are automatically
// encrypted before sending to API and decrypted on responses
const entry = await client.createVaultEntry("https://secure-site.com", "user123", {
  user_name: "john_doe",                        // AES-256-GCM encrypted
  password: "will-be-encrypted-automatically",  // AES-256-GCM encrypted
  tfa_secret: "JBSWY3DPEHPK3PXP",               // AES-256-GCM encrypted
});
```

## API Reference

### CloudCruiseClient

The main client class for interacting with CloudCruise APIs.

#### Constructor

```typescript
new CloudCruiseClient(params: CloudCruiseClientParams)
```

**Parameters:**

- `apiKey` (string, optional): Your CloudCruise API key. Falls back to `CLOUDCRUISE_API_KEY`.
- `baseUrl` (string, optional): CloudCruise API base URL. Falls back to `CLOUDCRUISE_BASE_URL`.
- `encryptionKey` (string, optional): Hex-encoded key. Falls back to `CLOUDCRUISE_ENCRYPTION_KEY`. Required to instantiate the client.

If not provided via params, the constructor reads environment variables. Missing required values cause the constructor to throw.

### Environment Variables

- `CLOUDCRUISE_API_KEY`: API key used for authentication.
- `CLOUDCRUISE_BASE_URL`: Base URL for the CloudCruise API, e.g., `https://api.cloudcruise.com`.
- `CLOUDCRUISE_ENCRYPTION_KEY`: 64-character hex-encoded key (32 bytes) used for encryption/decryption.

#### Methods

##### `createVaultEntry(domain: string, permissioned_user_id: string, options?: Partial<VaultEntry>): Promise<VaultEntry>`

Creates a new vault entry with required domain and user ID, plus optional settings.

##### `getVaultEntries(filters?: GetVaultEntriesFilters): Promise<VaultEntry[]>`

Retrieves vault entries, optionally filtered by user ID and/or domain.

##### `updateVaultEntry(id: string, updates: Partial<VaultEntry>): Promise<VaultEntry>`

Updates an existing vault entry by ID with the specified changes.

##### `deleteVaultEntry(id: string): Promise<void>`

Deletes a vault entry by ID.

### VaultEntry Interface

Core interface for vault entries:

```typescript
interface VaultEntry {
  // Required fields
  domain: string;
  permissioned_user_id: string;

  // Authentication
  password?: string;
  user_name?: string;
  tfa_secret?: string;

  // Browser automation
  user_agent?: string;
  cookies?: any;
  local_storage?: any;
  session_storage?: any;
  persist_cookies?: boolean;
  persist_local_storage?: boolean;
  persist_session_storage?: boolean;

  // Proxy configuration
  proxy?: ProxyConfig;

  // Additional fields...
}
```

## Development

```bash
# Install dependencies
npm install

# Build the SDK
npm run build

# Watch mode for development
npm run dev
```

## Requirements

- Node.js 18.0.0 or higher
- TypeScript 5.0.0 or higher (for TypeScript projects)

## License

MIT License - see LICENSE file for details.
