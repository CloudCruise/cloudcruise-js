# CloudCruise JavaScript/TypeScript SDK

The official CloudCruise client library for JavaScript and TypeScript applications. This SDK provides seamless integration with CloudCruise's vault APIs, featuring automatic authentication, client-side encryption, and comprehensive TypeScript support.

## Installation

```bash
npm install cloudcruise
```

## Quick Start

```typescript
import { CloudCruiseClient } from "cloudcruise";

// Initialize the client
const client = new CloudCruiseClient({
  apiKey: "your-api-key",
  baseUrl: "https://api.cloudcruise.com",
  encryptionKey: "optional-hex-encryption-key", // Optional client-side encryption
});

// Create a vault entry (the method you requested!)
await client.createVaultEntry({
  domain: "https://example.com",
  permissioned_user_id: "user123",
  password: "secure_password", // Automatically encrypted if encryptionKey provided
  user_name: "john_doe",
});
```

## Usage Examples

### Basic Vault Operations

```typescript
import { CloudCruiseClient } from "cloudcruise";

const client = new CloudCruiseClient({
  apiKey: "your-api-key",
  baseUrl: "https://api.cloudcruise.com",
  encryptionKey: "your-hex-encryption-key", // Optional - enables automatic encryption
});

// Create a vault entry
const newEntry = await client.createVaultEntry({
  domain: "https://example.com",
  permissioned_user_id: "user123",
  password: "secure_password", // Automatically encrypted
  user_name: "john_doe",
  tfa_secret: "JBSWY3DPEHPK3PXP", // Automatically encrypted
});

// Get all vault entries (automatically decrypted)
const allEntries = await client.getVaultEntries();

// Get specific vault entries with filters
const filteredEntries = await client.getVaultEntries({
  permissioned_user_id: "user123",
  domain: "https://example.com",
});

// Update a vault entry
const updatedEntry = await client.updateVaultEntry({
  id: newEntry.id,
  domain: "https://example.com",
  permissioned_user_id: "user123",
  password: "new_secure_password", // Automatically encrypted
});

// Delete a vault entry
await client.deleteVaultEntry(newEntry.id);
```

### Advanced Browser Automation Features

```typescript
// Create entry with browser automation settings
await client.createVaultEntry({
  domain: "https://app.example.com",
  permissioned_user_id: "user123",
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

The SDK supports optional client-side encryption for sensitive fields (password, tfa_secret):

```typescript
import { CloudCruiseClient } from "cloudcruise";

// Enable automatic encryption/decryption
const client = new CloudCruiseClient({
  apiKey: "your-api-key",
  baseUrl: "https://api.cloudcruise.com",
  encryptionKey: "your-64-char-hex-encryption-key", // 32 bytes as hex
});

// Sensitive fields are automatically encrypted before sending to API
// and decrypted when receiving from API
const entry = await client.createVaultEntry({
  domain: "https://secure-site.com",
  permissioned_user_id: "user123",
  password: "will-be-encrypted-automatically", // AES-256-GCM encrypted
  tfa_secret: "JBSWY3DPEHPK3PXP", // AES-256-GCM encrypted
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

- `apiKey` (string): Your CloudCruise API key
- `baseUrl` (string): CloudCruise API base URL
- `encryptionKey` (string, optional): Hex-encoded key for client-side encryption

#### Methods

##### `createVaultEntry(entry: CreateVaultEntryRequest): Promise<VaultEntry>`

Creates a new vault entry.

##### `getVaultEntries(filters?: GetVaultEntriesFilters): Promise<VaultEntry[]>`

Retrieves vault entries, optionally filtered by user ID and/or domain.

##### `updateVaultEntry(entry: UpdateVaultEntryRequest): Promise<VaultEntry>`

Updates an existing vault entry.

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
