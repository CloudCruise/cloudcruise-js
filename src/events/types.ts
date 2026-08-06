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
  ExecutionInputRequired = "execution.input_required",
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
  // Modal-recovery phases (non-dismissible popup loop):
  //   "modal_decision_dispatched": SDK customer submitted a modal_action
  //     and the backend dispatched the synthetic click; modal_action and
  //     modal_action_label identify which CTA was picked.
  //   "popup_dismiss_verified": post-cascade verify hook ran; outcome
  //     indicates whether the modal was actually dismissed.
  phase?: "modal_decision_dispatched" | "popup_dismiss_verified" | string;
  session_id?: string;
  modal_action?: string;
  modal_action_label?: string;
  response_time_ms?: number;
  outcome?: "success" | "failure";
  host?: string;
  popup_signature?: string;
}

// === Non-dismissible modal recovery types ===
// When a workflow click is blocked by a modal the worker cannot dismiss on
// its own, the backend emits an execution.input_required event with
// reason="non_dismissible_popup" and a popup_context block carrying the
// visible CTA buttons (available_actions) plus a per-session retry counter.
// Customers respond via client.runs.submitModalAction(sessionId, actionId).
export interface AvailableAction {
  id: string;
  label: string;
}

export interface PopupRetry {
  attempt: number;
  max_attempts: number;
}

export interface PopupContext {
  error_description: string;
  error_sub_type?: string;
  full_url?: string;
  available_actions: AvailableAction[];
  retry: PopupRetry;
}

// Discriminator for which recovery path needs input:
//   "input_required":             workflow missing a required variable
//   "incorrect_form_input":       form rejected the typed value
//   "multiple_matching_results":  extractor needs disambiguation
//   "non_dismissible_popup":      modal CTA needs to be picked (popup_context set)
export type InputRequiredReason =
  | "input_required"
  | "incorrect_form_input"
  | "multiple_matching_results"
  | "non_dismissible_popup";

export interface ExecutionInputRequiredPayload {
  session_id: string;
  input_variables: Record<string, any>;
  screenshot_url: string | null;
  reason?: InputRequiredReason;
  popup_context?: PopupContext;  // present iff reason === "non_dismissible_popup"
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
  [EventType.ExecutionInputRequired]: ExecutionInputRequiredPayload;
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
