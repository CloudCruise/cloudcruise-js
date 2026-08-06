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

const metadata = await client.workflows.getWorkflowMetadata("workflow-123");
console.log(metadata.input_schema);
```

### Validating Workflow Input

`RunsClient.start` validates run inputs automatically. Validation can also be
called directly:

```typescript
import { CloudCruise, InputValidationError } from "cloudcruise";

const payload = {
  url: "https://example.com",
  attempts: 2,
};

try {
  await client.workflows.validateWorkflowInput("workflow-123", payload);
} catch (error) {
  if (error instanceof InputValidationError) {
    console.error("Missing:", error.missingRequired);
    console.error("Type issues:", error.invalidTypes);
    console.error("Schema errors:", error.schemaErrors);
  }
  throw error;
}
```

Validation follows JSON Schema Draft-07, including nested schemas, `pattern`,
arrays and `items`, limits, `enum` and `const`, combinators, and local `$ref`
references. It matches server behavior in these areas:

- `format` is treated as an annotation and is not enforced.
- `$ref` may reference locations within the same schema (`#/...`), but the SDK
  will not fetch external schemas.
- Invalid schemas fail closed with `InputValidationError`.

`InputValidationError` retains `missingRequired`, `invalidTypes`, and
`unknownKeys` for compatibility. `schemaErrors` contains every failure with
`instancePath`, `schemaPath`, `keyword`, and `message`.
