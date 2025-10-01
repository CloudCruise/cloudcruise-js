export class VerificationError extends Error {
  public readonly statusCode: number;

  constructor(message: string = "Verification failed", statusCode: number = 400) {
    super(message);
    this.statusCode = statusCode;
    this.name = "VerificationError";
  }
}

export interface WebhookVerificationOptions {
  allowExpired?: boolean;
}

export enum WebhookEventType {
  ExecutionQueued = "execution.queued",
  ExecutionStart = "execution.start",
  ExecutionStep = "execution.step",
  InteractionWaiting = "interaction.waiting",
  InteractionFinished = "interaction.finished",
  AgentErrorAnalysis = "agent.error_analysis",
  ExecutionRequeued = "execution.requeued",
  ExecutionSuccess = "execution.success",
  ExecutionFailed = "execution.failed",
  ExecutionStopped = "execution.stopped"
}

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
  status: "execution.success" | "execution.failed" | "execution.stopped";
  encrypted_variables: string[] | null;
  file_urls: any[] | null;
}

export interface ExecutionStoppedEarlyPayload {
  message: string;
  error_code: string;
  session_id: string;
}

export interface WebhookEnvelope<E extends WebhookEventType, P> {
  event: E;
  timestamp: number;
  expires_at: number;
  payload: P;
  metadata?: Record<string, any>;
}

export type WebhookPayloadMap = {
  [WebhookEventType.ExecutionQueued]: ExecutionQueuedPayload;
  [WebhookEventType.ExecutionStart]: ExecutionStartPayload;
  [WebhookEventType.ExecutionStep]: ExecutionStepPayload;
  [WebhookEventType.InteractionWaiting]: InteractionWaitingPayload;
  [WebhookEventType.InteractionFinished]: InteractionFinishedPayload;
  [WebhookEventType.AgentErrorAnalysis]: AgentErrorAnalysisPayload;
  [WebhookEventType.ExecutionRequeued]: ExecutionRequeuedPayload;
  [WebhookEventType.ExecutionSuccess]: EndRunPayload;
  [WebhookEventType.ExecutionFailed]: EndRunPayload;
  [WebhookEventType.ExecutionStopped]: EndRunPayload | ExecutionStoppedEarlyPayload;
};

export type WebhookPayload<E extends WebhookEventType = WebhookEventType> =
  E extends WebhookEventType ? WebhookEnvelope<E, WebhookPayloadMap[E]> : never;
