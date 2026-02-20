/**
 * Shared Event Type Definitions
 * Used by both Webhook and SSE Run event handlers
 */

export enum EventType {
  ExecutionQueued = "execution.queued",
  ExecutionStart = "execution.start",
  ExecutionStep = "execution.step",
  ExecutionPause = "execution.pause",
  ExecutionStopped = "execution.stopped",
  ExecutionFailed = "execution.failed",
  ExecutionSuccess = "execution.success",
  ExecutionRequeued = "execution.requeued",
  FileUploaded = "file.uploaded",
  ScreenshotUploaded = "screenshot.uploaded",
  VideoUploaded = "video.uploaded",
  InteractionWaiting = "interaction.waiting",
  InteractionFinished = "interaction.finished",
  InteractionFailed = "interaction.failed",
  AgentErrorAnalysis = "agent.error_analysis",
}

// Payload type definitions
export interface ExecutionQueuedPayload {
  session_id: string;
  workflow_id: string;
}

export interface ExecutionStartPayload {
  session_id: string;
  workflow_id: string;
  live_view_url?: string;
}

export interface ExecutionStepPayload {
  session_id: string;
  workflow_id: string;
  current_step: string;
  next_step: string;
}

export interface InteractionWaitingPayload {
  session_id: string;
  workflow_id: string;
  current_step: string;
  missing_properties: string[];
  expected_json_schema_datamodel: Record<string, any>;
  message: string;
}

export type InteractionFinishedPayload =
  | {
      session_id: string;
      workflow_id: string;
      current_step: string;
      missing_properties: [];
      expected_json_schema_datamodel: Record<string, any>;
      message: string;
    }
  | {
      session_id: string;
      workflow_id: string;
      provided_input: any;
      message?: string;
      expected_json_schema_datamodel: Record<string, any>;
    };

export interface AgentErrorAnalysisPayload {
  analysis_step_name: string;
  ai_analysis?: string;
  root_cause_analysis?: string;
  error_category?: string;
}

export interface ExecutionRequeuedPayload {
  session_id: string;
  workflow_id: string;
  retry_attempt: number;
  max_retries?: number;
  next_execution_time: string;
  delay_ms: number;
}

export interface EndRunError {
  message: string;
  error_id: string;
  full_url?: string;
  created_at: string;
  error_code?: string;
  action_type?: string;
  action_display_name?: string;
  llm_error_category?: string;
}

export interface EndRunPayload {
  session_id: string;
  workflow_id: string;
  data: any;
  input_variables: Record<string, any>;
  errors: EndRunError[];
  status:
    | EventType.ExecutionSuccess
    | EventType.ExecutionFailed
    | EventType.ExecutionStopped;
  encrypted_variables: string[] | null;
  file_urls: any[] | null;
  vault_entries: Record<string, any> | null;
}

export interface ExecutionStoppedEarlyPayload {
  message: string;
  error_code: string;
  session_id: string;
}

export interface FileUploadedPayload {
  signed_file_url: string;
  file_name: string;
  timestamp: string;
  signed_file_url_expires: string;
  metadata: Record<string, any>;
  session_id: string;
}

export interface ScreenshotUploadedPayload {
  screenshot_id: string;
  signed_screenshot_url: string;
  node_display_name: string;
  node_id: string;
  timestamp: string;
  signed_screenshot_url_expires: string;
  error_screenshot: boolean;
  retry_index: number;
  full_length_screenshot: boolean;
  session_id: string;
}

// Map event types to their payload types
export type EventPayloadMap = {
  [EventType.ExecutionQueued]: ExecutionQueuedPayload;
  [EventType.ExecutionStart]: ExecutionStartPayload;
  [EventType.ExecutionStep]: ExecutionStepPayload;
  [EventType.InteractionWaiting]: InteractionWaitingPayload;
  [EventType.InteractionFinished]: InteractionFinishedPayload;
  [EventType.AgentErrorAnalysis]: AgentErrorAnalysisPayload;
  [EventType.ExecutionRequeued]: ExecutionRequeuedPayload;
  [EventType.ExecutionSuccess]: EndRunPayload;
  [EventType.ExecutionFailed]: EndRunPayload;
  [EventType.ExecutionStopped]: EndRunPayload | ExecutionStoppedEarlyPayload;
  [EventType.FileUploaded]: FileUploadedPayload;
  [EventType.ScreenshotUploaded]: ScreenshotUploadedPayload;
  [EventType.VideoUploaded]: never;
  [EventType.ExecutionPause]: never;
  [EventType.InteractionFailed]: never;
};

// Webhook message format
export type WebhookMessage<E extends EventType = EventType> = {
  event: E;
  timestamp: number;
  expires_at: number;
  payload: EventPayloadMap[E];
  metadata?: Record<string, any>;
};

// SSE Run event message format
export type RunEventMessage<E extends EventType = EventType> = {
  event: "run.event";
  data: {
    event: E;
    payload: EventPayloadMap[E];
    timestamp: number;
    expires_at: number;
  };
  timestamp: string;
  expires_at: string;
};
