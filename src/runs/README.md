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

### Running a Specific Version or Branch

Without a pin, the head of the workflow's default branch runs. Pin a version (exact or a semver range) or a branch, but not both:

```typescript
await client.runs.start({
  workflow_id: "workflow-123",
  run_input_variables: {},
  workflow_version: "^2.1.0",
});

await client.runs.start({
  workflow_id: "workflow-123",
  run_input_variables: {},
  workflow_branch_id: "branch-id",
});

const result = await client.runs.getResults(sessionId);
console.log(result.workflow_version_id, result.workflow_branch_name);
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

### Decision Required

When the recovery agent needs a person to decide, a webhook subscribed to `agent.decision_requested` receives the question. Answer it by POSTing to the payload's `respond_url` with your API key in `cc-key`. See [Answer a decision](https://docs.cloudcruise.com/run-api/answer-a-decision).

```typescript
import { EventType, type AgentDecisionRequestedPayload } from "cloudcruise";

app.post("/webhook", async (req, res) => {
  const message = client.webhook.verifySignature(req.body, req.headers["x-hmac-signature"], "webhook-secret");
  if (message.event === EventType.AgentDecisionRequested) {
    const decision = message.payload as AgentDecisionRequestedPayload;
    const choice = decision.fields.find((field) => field.options?.length);
    const response = await fetch(decision.respond_url, {
      method: "POST",
      headers: { "cc-key": process.env.CLOUDCRUISE_API_KEY!, "Content-Type": "application/json" },
      body: JSON.stringify({
        decision_id: decision.decision_id,
        ...(choice && { values: { [choice.id]: choice.options![0].id } }),
        text: "Use the existing record.",
      }),
    });
    // 200: accepted, the run resumes. 404: already answered, expired or cancelled. 409: answered elsewhere at the same moment.
  }
  res.status(200).json({ status: "received" });
});
```

The SDK also wraps the call: `client.runs.respondToDecision(decision.session_id, decision.decision_id, { values, text, directive })` sends the same body to `/run/{session_id}/decision/respond` and returns `{ status: "accepted", decision_id }`.

`values` is keyed by field `id`, using the option `id` for choice fields. Send at least one of `values`, `text` or `directive` (`requeue`, `add_error_code`, `fail`). The outcome arrives as `agent.decision_answered`.

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
