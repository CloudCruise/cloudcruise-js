# Webhook Client

The Webhook Client provides secure webhook payload verification using HMAC-SHA256 signatures. Verify that webhook requests are authentic and handle CloudCruise workflow event notifications securely.

## Usage

### Basic Webhook Verification

```typescript
import { CloudCruise } from "cloudcruise";

const client = new CloudCruise({
  apiKey: "your-api-key",
  encryptionKey: "your-encryption-key",
});

// In your webhook endpoint handler
app.post("/webhook", (req, res) => {
  try {
    const signature = req.headers["x-hmac-signature"];
    const payload = req.body;
    const secretKey = "your-webhook-secret";

    // Verify the webhook payload
    const verifiedPayload = client.webhook.verifySignature(
      payload,
      signature,
      secretKey
    );

    console.log("Event type:", verifiedPayload.event);
    console.log("Payload data:", verifiedPayload);

    // Handle different event types
    switch (payload.event) {
      case "execution.success":
        console.log("Workflow completed successfully");
        handleSuccess(payload);
        break;
      // case other cases: ...
      default:
        console.log("Unhandled event type:", payload.event);
    }

    res.status(200).json({ status: "received" });
  } catch (error) {
    console.error("Webhook verification failed:", error.message);
    res.status(400).json({ error: "Invalid webhook" });
  }
});
```

### Webhook Setup with Runs

```typescript
// Configure webhook when starting a workflow
const run = await client.runs.start({
  workflow_id: "workflow-123",
  run_input_variables: { target: "https://example.com" },
  webhook: {
    url: "https://your-app.com/webhook",
    event_types_subscribed: [
      "execution.success",
      "execution.failed",
      "execution.stopped",
    ],
    secret: "your-webhook-secret-key",
    validity: 3600, // 1 hour
  },
});
```
