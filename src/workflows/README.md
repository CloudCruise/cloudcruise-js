# Workflows Client

The Workflows Client provides access to workflow definitions and metadata in your CloudCruise workspace. Manage workflow information, retrieve input schemas, and validate workflow inputs.

## Usage

### Basic Operations

```typescript
import { CloudCruise } from "cloudcruise";

const client = new CloudCruise({
  apiKey: "your-api-key",
  encryptionKey: "your-encryption-key",
});

// Get all workflows in your workspace
const workflows = await client.workflows.getAllWorkflows();
console.log(workflows);
```
