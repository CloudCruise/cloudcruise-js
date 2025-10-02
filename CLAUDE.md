# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Build and Development

- `npm run build` - Compile TypeScript to JavaScript in dist/ directory
- `npm run dev` - Run TypeScript compiler in watch mode for development
- `npm test` - Currently not implemented (placeholder command)

### Package Management

- `npm install` - Install dependencies using npm (project uses pnpm-lock.yaml but npm works)
- Uses Node.js 18.0.0+ and TypeScript 5.0.0+

## Architecture

### Core Structure

CloudCruise is a JavaScript/TypeScript SDK for the CloudCruise Platform that provides:

- **Vault management** - Encrypted storage and retrieval of user credentials
- **Workflow execution** - Running automated browser workflows
- **Real-time run monitoring** - SSE-based streaming of workflow execution events
- **Webhook handling** - Processing and verification of webhook payloads

### Main Components

**CloudCruise** (`src/CloudCruise.ts`)

- Main entry point that coordinates all client functionality
- Handles authentication via API key and cc-key header
- Manages client-side encryption for sensitive data
- Initializes and provides access to all namespace clients
- Uses ConnectionManager for SSE connections

**Namespace Clients** (organized by feature):

- **VaultClient** (`src/vault/`) - Manages encrypted credential storage with client-side AES-256-GCM encryption
- **WorkflowsClient** (`src/workflows/`) - Handles workflow definitions and metadata
- **RunsClient** (`src/runs/`) - Executes workflows and streams real-time events via SSE
- **WebhookClient** (`src/webhook/`) - Verifies and processes webhook payloads

**Core Utilities**:

- **ConnectionManager** (`src/utils/connectionManager.ts`) - Manages persistent SSE connections with automatic reconnection, session multiplexing, and client ID management
- **SSE utilities** (`src/utils/sse.ts`) - Low-level Server-Sent Events implementation
- **AsyncEventQueue** (`src/utils/asyncQueue.ts`) - Async iterator for streaming events
- **SimpleEventEmitter** (`src/utils/events.ts`) - Event handling utilities

### Key Patterns

**Client-Side Encryption**: Sensitive fields (user_name, password, tfa_secret) are automatically encrypted/decrypted using AES-256-GCM before API calls.

**Real-time Streaming**: Uses SSE with automatic reconnection for streaming workflow execution events. ConnectionManager handles multiplexing multiple sessions over a single connection.

**Error Handling**: Consistent error handling across all clients with structured error messages from API responses.

**Environment Configuration**: Supports both explicit parameters and environment variables (CLOUDCRUISE_API_KEY, CLOUDCRUISE_ENCRYPTION_KEY, CLOUDCRUISE_BASE_URL).

## Development Notes

### TypeScript Configuration

- Targets ES2022 with ESNext modules
- Strict mode enabled with DOM and Node.js types
- Output goes to `dist/` with declaration files generated
- Uses `.js` extensions in imports for ES module compatibility

### API Integration

- Base URL defaults to https://api.cloudcruise.com
- Authentication via 'cc-key' header
- JSON request/response format with structured error handling
- SSE endpoint at `/runs/stream/{sessionId}` for real-time events

## Documentation Standards

### Writing Style

- Write all documentation, code comments, and method descriptions as if they were the final version
- Do NOT include notes about what changed, what was added, or what was updated
- Documentation should be clear, concise, and focused on explaining what the code does, not its history
- Avoid phrases like "now supports", "updated to", "changed from", etc.
- Present information as current facts, not as changes or improvements
