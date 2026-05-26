/**
 * CloudCruise JavaScript/TypeScript SDK
 * Official client library for the CloudCruise Platform
 */

export { CloudCruise } from './CloudCruise.js';
export type { CloudCruiseParams } from './CloudCruise.js';

export { VaultClient } from './vault/VaultClient.js';
export { WorkflowsClient } from './workflows/WorkflowsClient.js';
export { RunsClient } from './runs/RunsClient.js';
export { WebhookClient } from './webhook/WebhookClient.js';

export type {
  VaultEntry,
  GetVaultEntriesFilters,
  ProxyConfig,
  VaultPostPutHeadersInBody
} from './vault/types.js';

export type {
  Workflow,
  WorkflowInputSchema,
  WorkflowMetadata
} from './workflows/types.js';

export type {
  DryRun,
  Metadata,
  RunSpecificWebhook,
  PayloadWebhook,
  StartRunRequest,
  StartRunResponse,
  UserInteractionData,
  VideoUrl,
  SignedFileUrl,
  SignedScreenshotUrl,
  RunError,
  WorkflowError,
  RunResult,
  GetRunResult,
  WebhookEvent,
  WebhookReplayResponse,
  RunHandle,
  RunStreamOptions,
  SseEventName,
  SseMessage,
  RunEventEnvelope,
  RunHandleEventMap
} from './runs/types.js';

// Export shared event types
export { EventType } from './events/types.js';
export type {
  WebhookMessage,
  RunEventMessage,
  // Modal recovery types (execution.input_required event family)
  AvailableAction,
  PopupRetry,
  PopupContext,
  InputRequiredReason,
  ExecutionInputRequiredPayload,
  // Existing payloads worth surfacing
  AgentErrorAnalysisPayload
} from './events/types.js';

export type { WebhookVerificationOptions } from './webhook/types.js';
export { VerificationError } from './webhook/types.js';
export { InputValidationError } from './workflows/types.js';
