/**
 * CloudCruise Runs API Type Definitions
 */

export type EventType = 
  | 'execution.queued'
  | 'execution.start'
  | 'execution.step'
  | 'execution.pause'
  | 'execution.stopped'
  | 'execution.failed'
  | 'execution.success'
  | 'execution.requeued'
  | 'file.uploaded'
  | 'screenshot.uploaded'
  | 'video.uploaded'
  | 'interaction.waiting'
  | 'interaction.finished'
  | 'interaction.failed';

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
  /**
   * Optional client identifier used to bind the run to a multiplexed connection.
   * Provided by the backend via POST /client and passed here by the SDK.
   */
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

export interface FileUrl {
  signed_file_url: string;
  file_name: string;
  timestamp: string;
  signed_file_url_expires: string;
  metadata: Record<string, any>;
}

export interface ScreenshotUrl {
  signed_screenshot_url: string;
  node_display_name: string;
  timestamp: string;
  signed_screenshot_url_expires: string;
  error_screenshot: boolean;
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

export interface RunResult {
  session_id: string;
  status: EventType;
  input_variables: Record<string, any>;
  data: Record<string, any>;
  video_urls: VideoUrl[];
  file_urls: FileUrl[];
  screenshot_urls: ScreenshotUrl[];
  errors: RunError[] | null;
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

export interface RunEventEnvelope {
  event: 'run.event';
  data: {
    event: EventType | string;
    payload: Record<string, any>;
    expires_at: number;
    timestamp: number;
  };
  timestamp?: string;
  expires_at?: string;
}

export interface PingEnvelope {
  event: 'ping';
  data: { ts: number } | Record<string, any>;
}

export type SseMessage = RunEventEnvelope | PingEnvelope;

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

export interface RunHandle {
  sessionId: string;
  on(
    event: 'open' | 'reconnect' | 'error' | 'end' | SseEventName | 'message',
    handler: (e: unknown) => void
  ): () => void;
  wait(): Promise<RunResult>;
  close(): void;
  [Symbol.asyncIterator](): AsyncIterator<SseMessage>;
}
