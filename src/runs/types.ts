/**
 * CloudCruise Runs API Type Definitions
 */

import type {
  EventType,
  RunEventMessage,
  EventPayloadMap,
  ExecutionQueuedPayload,
  ExecutionStartPayload,
  ExecutionStepPayload,
  InteractionWaitingPayload,
  InteractionFinishedPayload,
  AgentErrorAnalysisPayload,
  ExecutionRequeuedPayload,
  EndRunPayload,
  EndRunError,
  ExecutionStoppedEarlyPayload,
  FileUploadedPayload,
  ScreenshotUploadedPayload,
} from '../events/types.js';

// Re-export EventType for convenience
export type { EventType };

// Re-export payload types
export type {
  ExecutionQueuedPayload,
  ExecutionStartPayload,
  ExecutionStepPayload,
  InteractionWaitingPayload,
  InteractionFinishedPayload,
  AgentErrorAnalysisPayload,
  ExecutionRequeuedPayload,
  EndRunPayload,
  EndRunError,
  ExecutionStoppedEarlyPayload,
  FileUploadedPayload,
  ScreenshotUploadedPayload,
  EventPayloadMap,
};

export interface DryRun {
  enabled: boolean;
  add_to_output?: Record<string, any>;
}

export interface Metadata {
  metadata: Record<string, any>;
}

export interface RunSpecificWebhook {
  url: string;
  event_types_subscribed: EventType[];
  secret: string;
  validity: number;
}

export type PayloadWebhook = Metadata | RunSpecificWebhook;

export interface StartRunRequest {
  workflow_id: string;
  run_input_variables: Record<string, any>;
  dry_run?: DryRun;
  webhook?: PayloadWebhook;
  additional_context?: Record<string, any>;
  client_id?: string;
}

export interface StartRunResponse {
  session_id: string;
}

export type UserInteractionData = Record<string, any>;

export interface VideoUrl {
  timestamp: string;
  session_id: string;
  signed_screen_recording_url: string;
  signed_screen_recording_url_expires: string;
}



export interface RunError {
  prompt?: string | null;
  message?: string | null;
  error_id?: string | null;
  full_url?: string | null;
  llm_model?: string | null;
  created_at?: string | null;
  error_code?: string | null;
  action_type?: string | null;
  action_display_name?: string | null;
}

// Files attached to the session (from sessions.signed_file_urls)
export interface SignedFileUrl {
  signed_file_url: string;
  file_name: string;
  timestamp: string; // ISO string
  signed_file_url_expires: string; // ISO string
  metadata: Record<string, any>;
}

// Screenshots attached to the session (IDs are removed before returning)
export interface SignedScreenshotUrl {
  signed_screenshot_url: string;
  node_display_name: string;
  timestamp: string; // ISO string
  signed_screenshot_url_expires: string; // ISO string
  error_screenshot: boolean;
  full_length_screenshot?: boolean;
  retry_index?: number;
  // node_id and screenshot_id are intentionally omitted in getRun response
}

// Subset of workflow_errors selected by getRun
export interface WorkflowError {
  message: string;
  error_id: string;
  full_url?: string | null;
  created_at?: string | null; // ISO string
  error_code?: string | null;
  action_type?: string | null;
  action_display_name?: string | null;
}

export interface RunResult {
  session_id: string;
  status: EventType;
  input_variables: Record<string, any>;
  data: Record<string, any>;
  video_urls: VideoUrl[];
  file_urls: SignedFileUrl[];
  screenshot_urls: SignedScreenshotUrl[];
  errors: RunError[] | null;
}

// Exact return type of RunsService.getRun()
export interface GetRunResult {
  data: Record<string, any> | null;
  session_id: string;
  errors: WorkflowError[]; // as selected from workflow_errors
  status: EventType;
  input_variables: Record<string, any>;
  workflow_id: string | null;
  session_retries: number | null;
  encrypted_variables: string[] | null;
  video_urls: VideoUrl[] | null;
  screenshot_urls?: SignedScreenshotUrl[] | null;
  file_urls: SignedFileUrl[] | null;
}

export interface WebhookEvent {
  success: boolean;
  response: string;
  error: string;
}

export interface WebhookReplayResponse {
  status: string;
  info: string;
  nr_success: number;
  nr_failed: number;
  webhook_events: WebhookEvent[];
}

/**
 * Streaming (SSE) types
 */
export type SseEventName = 'run.event' | 'ping';

// Generic RunEventEnvelope using shared types
export type RunEventEnvelope<E extends EventType = EventType> = RunEventMessage<E>;

export interface PingEnvelope {
  event: 'ping';
  data: { ts: number } | Record<string, any>;
}

export type SseMessage<E extends EventType = EventType> = RunEventEnvelope<E> | PingEnvelope;

export interface RunStreamOptions {
  signal?: AbortSignal;
  withCredentials?: boolean;
  headers?: Record<string, string>;
  reconnect?: {
    enabled?: boolean;
    delays?: number[];
    jitter?: number; // 0..1
  };
}

// Event handler types for RunHandle
export type RunEventMap = {
  [K in EventType]: RunEventEnvelope<K>;
};

export type RunHandleEventMap = {
  'open': undefined;
  'close': undefined;
  'reconnect': { attemptDelayMs: number };
  'error': unknown;
  'end': { type: EventType };
  'run.event': SseMessage;
  'ping': PingEnvelope;
  'message': SseMessage | PingEnvelope;
} & RunEventMap;

export interface RunHandle {
  sessionId: string;
  on<K extends keyof RunHandleEventMap>(
    event: K,
    handler: (e: RunHandleEventMap[K]) => void
  ): () => void;
  wait(): Promise<GetRunResult>;
  close(): void;
  [Symbol.asyncIterator](): AsyncIterator<SseMessage>;
}
