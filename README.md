# cloudcruise-js

[![MIT License](https://img.shields.io/badge/License-MIT-red.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![NPM version](https://img.shields.io/npm/v/cloudcruise.svg?style=flat-square)](https://www.npmjs.com/package/cloudcruise)
[![GitHub Repo stars](https://img.shields.io/github/stars/CloudCruise/cloudcruise-js?style=flat-square&logo=GitHub&label=cloudcruise-js)](https://github.com/CloudCruise/cloudcruise-js)
[![Discord](https://img.shields.io/discord/1227480834945318933?style=flat-square&logo=Discord&logoColor=white&label=Discord&color=%23434EE4)](https://discord.com/invite/MHjbUqedZF)
[![YC W24](https://img.shields.io/badge/Y%20Combinator-W24-orange?style=flat-square)](https://www.ycombinator.com/companies/cloudcruise)

The official CloudCruise JavaScript/TypeScript client library for automated browser workflows, credential management, and real-time monitoring.

## Installation

```bash
npm install cloudcruise
```

## Clients

| Client                           | Description                                              | Documentation                                  |
| -------------------------------- | -------------------------------------------------------- | ---------------------------------------------- |
| [**Vault**](./src/vault)         | Encrypted credential storage with AES-256-GCM encryption | [📖 Vault Docs](./src/vault/README.md)         |
| [**Workflows**](./src/workflows) | Workflow definitions, metadata, and input validation     | [📖 Workflows Docs](./src/workflows/README.md) |
| [**Runs**](./src/runs)           | Workflow execution with real-time SSE streaming          | [📖 Runs Docs](./src/runs/README.md)           |
| [**Webhook**](./src/webhook)     | Secure webhook payload verification with HMAC            | [📖 Webhook Docs](./src/webhook/README.md)     |

## Documentation

- [**API Documentation**](https://docs.cloudcruise.com) - Complete API reference and guides
- [**CloudCruise Platform**](https://cloudcruise.com) - Learn more about CloudCruise

## Development

This project uses TypeScript and supports Node.js 18+. See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed development instructions.

Quick start:

```bash
npm install     # Install dependencies
npm run build   # Build TypeScript to JavaScript
npm run dev     # Run in watch mode
```

## License

[MIT](LICENSE)
