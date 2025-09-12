# Contributing

Thank you for your interest in contributing to the CloudCruise JavaScript/TypeScript SDK! This guide will help you get started with developing and contributing to this open-source project.

## Project Overview

CloudCruise is the official JavaScript/TypeScript client library for the CloudCruise Platform, providing:

- **Vault management** - Encrypted storage and retrieval of user credentials
- **Workflow execution** - Running automated browser workflows
- **Real-time monitoring** - SSE-based streaming of workflow execution events
- **Webhook handling** - Processing and verification of webhook payloads

## Getting Started

### Prerequisites

- Node.js 18.0.0+ (the project supports Node 18+)
- pnpm (recommended package manager, though npm works too)
- Git

### Installing Dependencies

```bash
pnpm install
```

Or if you prefer npm:

```bash
npm install
```

### Building the Project

```bash
# Build TypeScript to JavaScript
pnpm build

# Or with npm
npm run build
```

### Development Mode

```bash
# Run TypeScript compiler in watch mode
pnpm dev

# Or with npm
npm run dev
```

## Development

### Project Structure

```
src/
├── CloudCruise.ts     # Main client entry point
├── index.ts                 # Package exports
├── vault/                   # Encrypted credential storage
├── workflows/               # Workflow definitions and execution
├── runs/                    # Real-time workflow execution
├── webhook/                 # Webhook processing
└── utils/                   # Shared utilities (SSE, encryption, etc.)
```

### Key Components

- **CloudCruise** - Main entry point that coordinates all functionality
- **VaultClient** - Manages encrypted credential storage with AES-256-GCM
- **WorkflowsClient** - Handles workflow definitions and metadata
- **RunsClient** - Executes workflows with real-time SSE streaming
- **ConnectionManager** - Manages persistent SSE connections with automatic reconnection

## Testing

Currently, the project uses a placeholder test command. We welcome contributions to improve test coverage:

```bash
npm test  # Currently shows "no test specified"
```

### Local Testing

To test your changes in a real application before submitting a PR:

1. **Build the project**

   ```bash
   npm run build
   ```

2. **Create a package**

   ```bash
   npm pack
   ```

   This generates a `.tgz` file (e.g., `cloudcruise-0.0.X.tgz`) in the project root.

3. **Install in your test project**

   ```bash
   cd /path/to/your/test-project
   npm install /path/to/cloudcruise-js/cloudcruise-0.0.2.tgz
   ```

4. **Use the local version**
   ```typescript
   import { CloudCruise } from "cloudcruise";
   // Test your changes here
   ```

This workflow allows you to validate that your changes work correctly in real applications before contributing.

**Future Testing Goals:**

- Integration tests for API client functionality
- Unit tests for encryption/decryption utilities
- End-to-end tests with mock CloudCruise server
- SSE connection and reconnection testing

## Code Quality

### Current Setup

The project currently uses:

- TypeScript with strict mode enabled
- ES2022 target with ESNext modules
- Type declarations generated automatically

### Code Style Guidelines

- Use TypeScript for all new code
- Follow existing naming conventions (camelCase for variables, PascalCase for classes)
- Include JSDoc comments for public APIs
- Use ES modules with `.js` extensions in imports
- Maintain existing error handling patterns

## Development Workflow

1. **Fork and Clone**

   ```bash
   git clone https://github.com/YOUR_USERNAME/cloudcruise-js.git
   cd cloudcruise-js
   ```

2. **Create a Feature Branch**

   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make Your Changes**

   - Add your code changes
   - Update documentation if needed
   - Add tests for new functionality (when testing framework is available)

4. **Build and Test**

   ```bash
   pnpm build
   # Run any available tests
   ```

5. **Commit Your Changes**

   ```bash
   git add .
   git commit -m "feat: add your feature description"
   ```

6. **Push and Create PR**

   ```bash
   git push origin feature/your-feature-name

   ```

   Then create a pull request on GitHub.

### Pull Request Guidelines

- Provide a clear description of the changes
- Reference any related issues
- Ensure the build passes (`pnpm build` succeeds)
- Follow conventional commit format for commit messages
- Include documentation updates for new features
- Add tests when the testing framework becomes available

## Getting Help

- **Issues**: Report bugs or request features via [GitHub Issues](https://github.com/CloudCruise/cloudcruise-js/issues)
- **Discussions**: Ask questions or discuss ideas in our discord channel: https://discord.com/invite/MHjbUqedZF
- **Documentation**: Check the [README](./README.md) for usage examples

## License

By contributing to CloudCruise, you agree that your contributions will be licensed under the MIT License.
