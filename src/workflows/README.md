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
console.log(metadata.workspace_id);
console.log(metadata.vault_schema);
```

### Versions and Branches

Metadata describes the latest version on the workflow's default branch unless
you select another one. `getWorkflowMetadata` and `validateWorkflowInput` take
the same optional selectors as `runs.start()`; set at most one (setting both
throws):

```typescript
// Highest release matching an exact version or semver range
const pinned = await client.workflows.getWorkflowMetadata("workflow-123", {
  workflow_version: "^1.2.0",
});
console.log(pinned.version, pinned.version_id);

// Latest version on a branch
const onBranch = await client.workflows.getWorkflowMetadata("workflow-123", {
  workflow_branch_id: "3f6c2a8e-6b1d-4c3e-9a51-2d7f0e8b4c19",
});

// Every version across all branches, newest first
for (const version of await client.workflows.listWorkflowVersions("workflow-123")) {
  console.log(version.version, version.branch_id, version.version_note);
}

// Branches, oldest first; is_default marks the branch unpinned runs use
for (const branch of await client.workflows.listWorkflowBranches("workflow-123")) {
  console.log(branch.id, branch.name, branch.is_default);
}
```

`version`, `version_id` and `branch_id` on the metadata identify the version
that was described. Against an API without version selection, a selector
throws instead of returning the default branch's schemas.

### Validating Workflow Input

`RunsClient.start` does not call this method. The server validates
`run_input_variables` against the input schema of the version that runs, and
its errors are raised as the same `InputValidationError`. Call
`validateWorkflowInput` yourself, passing the same `workflow_version` or
`workflow_branch_id` you will start the run with as a third argument, to check
a payload without starting a run:

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
