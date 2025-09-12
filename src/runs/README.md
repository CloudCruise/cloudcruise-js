# Runs Client

The Runs Client provides workflow execution and real-time monitoring via Server-Sent Events (SSE). Execute workflows, stream events, submit user interactions, and manage workflow sessions.

## Usage

### Basic Workflow Execution

```typescript
import { CloudCruise } from "cloudcruise";

// Get keys at https://app.cloudcruise.com/settings/api-keys and https://app.cloudcruise.com/settings/encryption-keys
const client = new CloudCruise({
  apiKey: "your-api-key",
  encryptionKey: "your-encryption-key",
});

// Start a workflow run
// run_input_variables are automatically validated against the input schema specified in the CloudCruise portal.
const run = await client.runs.start({
  workflow_id: "workflow-123",
  run_input_variables: {
    variable_1: "https://example.com",
    variable_2: "john_doe",
  },
});

console.log("Session ID:", run.sessionId);

// Wait for completion and get results
const result = await run.wait();
console.log("Run completed:", result.status);
console.log("Output data:", result.data);
```

### Real-time Event Streaming

```typescript
// Start workflow with real-time monitoring
const run = await client.runs.start({
  workflow_id: "workflow-123",
  run_input_variables: { target_url: "https://example.com" },
});

// Listen to specific events
run.on("run.event", (event) => {
  console.log("Event:", event.data.event);
  console.log("Payload:", event.data.payload);
});

run.on("error", (error) => {
  console.error("Stream error:", error);
});

run.on("end", (result) => {
  console.log("Workflow ended:", result.type);
});

// Use async iteration for events
for await (const event of run) {
  console.log("Received event:", event.data.event);

  if (event.data.event === "execution.success") {
    break;
  }
}
```

### User Interactions

See [documentation](https://docs.cloudcruise.com/run-api/submit-user-interaction-data) for more information.

```typescript
run.on("run.event", async (event) => {
  if (event.data.event === "interaction.waiting") {
    // Workflow is waiting for user input
    console.log("Workflow paused, submitting input...");

    await client.runs.submitUserInteraction(run.sessionId, {
      field1: "user_provided_value",
      field2: 42,
      confirmation: true,
    });
  }
});
```

### Advanced Options

```typescript
// Workflow with dry run mode
const dryRun = await client.runs.start({
  workflow_id: "test-workflow",
  run_input_variables: { url: "https://example.com" },
  dry_run: {
    enabled: true,
    add_to_output: { test_mode: true },
  },
});

// Workflow with webhook notifications
const runWithWebhook = await client.runs.start({
  workflow_id: "monitored-workflow",
  run_input_variables: { target: "https://example.com" },
  webhook: {
    url: "https://your-app.com/webhook",
    event_types_subscribed: ["execution.success", "execution.failed"],
    secret: "webhook-secret", // get secret from CloudCruise portal
    validity: 3600, // 1 hour
  },
});
```
