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

### Watching a Live Session

While a session is running, you can fetch a viewer URL (`live_view.html` link) to watch its browser stream:

```typescript
const { url } = await client.runs.getLiveViewConnection(run.sessionId);
console.log("Watch live:", url);
```

The returned `authToken` embedded in `url` is **single-use** — once the link has been opened, opening it a second time (e.g. reloading the tab, or reopening it later) will fail to connect. Call `getLiveViewConnection` again to mint a fresh token/link rather than reusing the old one:

```typescript
// Token from a previous call was already consumed — mint a new one
const { url: freshUrl } = await client.runs.getLiveViewConnection(run.sessionId);
```

This only succeeds while the session is still active; it throws once the session has ended.

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

### Input-Required Recoveries

When the worker can't proceed and needs human/business input, the backend emits an `execution.input_required` event with a `reason` discriminator. The SDK exposes two logical handlers, one per recovery family. Underneath, both route from the same event; the SDK partitions by `reason` so your code stays clean.

| `reason` | Recovery shape | SDK handler | Decider returns |
|---|---|---|---|
| `non_dismissible_popup` | Modal blocks click; pick one CTA button | `onPopupDecisionRequired` | `string` (action id) |
| `input_required` | Workflow needs a missing variable | `onInputVariablesRequired` | `Record<string, any>` |
| `incorrect_form_input` | Form rejected the typed value | `onInputVariablesRequired` | `Record<string, any>` |
| `multiple_matching_results` | Extractor needs disambiguation | `onInputVariablesRequired` | `Record<string, any>` |

The SDK never picks a value on its own. The decision is always yours.

**Non-dismissible modal (popup decision required)**

```typescript
const popupDecider = (ctx) => {
  // ctx.retry.attempt lets you branch your choice between the first try and
  // a retry (e.g., switch from Yes to Cancel if the modal re-appeared).
  if (ctx.error_description.toLowerCase().includes("duplicate")) {
    return ctx.available_actions.find((a) => /proceed/i.test(a.label)).id;
  }
  return ctx.available_actions[0].id;
};

const handle = await client.runs.start({ workflow_id: "...", run_input_variables: {} });
client.runs.onPopupDecisionRequired(handle, popupDecider);
const result = await handle.wait();
```

**Workflow variable (`input_required` / `incorrect_form_input` / `multiple_matching_results`)**

```typescript
const variablesDecider = (payload) => {
  // payload is the full input_required event payload (includes reason).
  if (payload.reason === "incorrect_form_input") {
    return { USERNAME: promptOperatorForUsername() };
  }
  if (payload.reason === "input_required") {
    return { MEMBER_ID: lookupMemberId() };
  }
  return {};
};

client.runs.onInputVariablesRequired(handle, variablesDecider);
```

**Both handlers compose** — register both on the same handle if your workflow can hit either family.

**Low-level escape hatches** for full control:
- `client.runs.submitModalAction(sessionId, actionId)`
- `client.runs.submitInputVariables(sessionId, dict)`
- `handle.on("execution.input_required", listener)` for raw event access.

Tips:
- Customer-side wait budget = workspace setting `input_required_timeout_seconds` (default 15s, clamp 5-300s).
- For multi-step modal chains (modal A → dismiss → modal B → dismiss), `onPopupDecisionRequired` is invoked once per modal automatically. The attempt counter resets after each verified dismissal.

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
