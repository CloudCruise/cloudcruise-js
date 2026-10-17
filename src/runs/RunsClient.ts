import type {
  StartRunRequest,
  UserInteractionData,
  GetRunResult,
  WebhookReplayResponse,
  RunHandle,
  RunStreamOptions,
  SseMessage,
  RunHandleEventMap,
  LiveViewConnection,
} from './types.js';
import { EventType } from '../events/types.js';
import type { PopupContext, ExecutionInputRequiredPayload } from '../events/types.js';
import { AsyncEventQueue } from '../utils/asyncQueue.js';
import { SimpleEventEmitter } from '../utils/events.js';
import { ConnectionManager } from '../utils/connectionManager.js';
import type { SessionSubscription } from '../utils/connectionManager.js';

/**
 * Default error reporter for the recovery helpers. Writes to console.error
 * so submission failures surface in customer logs even if no onError
 * callback is provided. The runtime SimpleEventEmitter ignores async-handler
 * returns, so without this default a rejection from /new_input_variables
 * would become a silent unhandled rejection.
 */
function defaultRecoverySubmitErrorLog(operation: string): (err: unknown) => void {
  return (err: unknown) => {
    try {
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      console.error(`[CloudCruise SDK] ${operation} failed during recovery: ${msg}`);
    } catch {
      // never throw from the error reporter
    }
  };
}

/**
 * Helper for `verbose: true` mode on the recovery helpers. Writes a single
 * line to console.error so customers can watch the recovery loop without
 * instrumenting their own decider.
 */
function verboseLog(operation: string, message: string): void {
  try {
    console.error(`[CloudCruise SDK verbose] ${operation}: ${message}`);
  } catch {
    // never throw
  }
}

export class RunsClient {
  private readonly makeRequest: <T = any>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: any
  ) => Promise<T>;
  private readonly workflows?: {
    validateWorkflowInput: (workflowId: string, payload: Record<string, any>) => Promise<void>;
  };
  private readonly connectionManager: ConnectionManager;

  constructor(
    connectionManager: ConnectionManager,
    makeRequest: <T = any>(
      method: 'GET' | 'POST' | 'PUT' | 'DELETE',
      path: string,
      body?: any
    ) => Promise<T>,
    workflows?: {
      validateWorkflowInput: (workflowId: string, payload: Record<string, any>) => Promise<void>;
    }
  ) {
    this.makeRequest = makeRequest;
    this.workflows = workflows;
    this.connectionManager = connectionManager;
  }

  /**
   * Queues a new run and returns a RunHandle.
   * The handle exposes sessionId immediately and subscribes to SSE under the hood.
   */
  async start(request: StartRunRequest, options?: RunStreamOptions): Promise<RunHandle> {
    if (this.workflows) {
      await this.workflows.validateWorkflowInput(
        request.workflow_id,
        request.run_input_variables
      );
    }
    // Ensure client_id and connection are ready to avoid missing early events
    const clientId = await this.connectionManager.ensureClientId();
    await this.connectionManager.connectIfNeeded();
    request.client_id = clientId;
    const { session_id } = await this.makeRequest<{ session_id: string }>('POST', '/run', request);
    return this.subscribeToSession(session_id, options);
  }

  /**
   * Subscribes to SSE events for a given session. Returns a handle with helpers.
   */
  subscribeToSession(sessionId: string, options?: RunStreamOptions): RunHandle {
    const emitter = new SimpleEventEmitter<RunHandleEventMap>();
    const stream = new AsyncEventQueue<SseMessage>();

    let ended = false;
    let closed = false;
    let sub: SessionSubscription | null = null;

    const reconnectCfg = {
      enabled: options?.reconnect?.enabled ?? true,
      delays: options?.reconnect?.delays ?? [1000, 3000, 10000],
    };

    const isTerminalEvent = (status?: string | null): status is EventType =>
      status === EventType.ExecutionSuccess || 
      status === EventType.ExecutionFailed || 
      status === EventType.ExecutionStopped;

    const emit = <K extends keyof RunHandleEventMap>(event: K, payload: RunHandleEventMap[K]) => {
      emitter.emit(event, payload);
      // Mirror only SSE messages to 'message' for catch-all consumers
      if (event === 'run.event' || event === 'ping') {
        emitter.emit('message', payload as RunHandleEventMap['message']);
      }
    };

    const endAndCleanup = (status: EventType) => {
      if (ended) return;
      ended = true;
      closed = true;
      try { sub?.close(); } catch {}
      emit('end', { type: status });
      stream.close();
      emitter.clear();
    };

    const connect = () => {
      sub = this.connectionManager.subscribe(sessionId, { signal: options?.signal });

      const s = sub!;
      s.on('open', () => emit('open', undefined));
      s.on('ping', (evt) => emit('ping', evt as RunHandleEventMap['ping']));
      s.on('run.event', (msg: unknown) => {
        const sseMsg = msg as SseMessage;
        if (sseMsg.event !== 'run.event') return;
        stream.push(sseMsg);
        emit('run.event', sseMsg);

        // Emit typed per-event key for better DX
        try { (emitter as unknown as { emit: (k: keyof RunHandleEventMap, v: any) => void }).emit(sseMsg.data.event as keyof RunHandleEventMap, sseMsg); } catch {}

        const eventType = sseMsg.data.event;
        if (typeof eventType === 'string' && isTerminalEvent(eventType)) {
          endAndCleanup(eventType);
        }
      });
      s.on('error', (err) => {
        emit('error', err);
        if (!reconnectCfg.enabled || ended || closed) return;
        (async () => {
          for (const base of reconnectCfg.delays) {
            if (ended || closed) return;
            await new Promise(r => setTimeout(r, base));
            if (ended || closed) return;
            try {
              const snapshot = await this.getResults(sessionId);
              const status = snapshot?.status;
              if (isTerminalEvent(status)) {
                endAndCleanup(status);
                return;
              }
            } catch {}
            emit('reconnect', { attemptDelayMs: base });
            return; // manager handles reconnect of mux
          }
        })();
      });
      s.on('reconnect', (e) => emit('reconnect', e as { attemptDelayMs: number }));
      s.on('end', (e: unknown) => {
        const t = (e as { type?: EventType | string } | undefined)?.type;
        if (t && typeof t === 'string' && isTerminalEvent(t)) {
          endAndCleanup(t);
        } else {
          // End without explicit type; still clean up
          endAndCleanup(EventType.ExecutionStopped);
        }
      });
    };

    connect();

    const client = this;
    const handle: RunHandle = {
      sessionId,
      on: (event, handler) => emitter.on(event, handler),
      async wait(): Promise<GetRunResult> {
        if (ended) {
          return await client.getResults(sessionId);
        }
        return await new Promise<GetRunResult>((resolve, reject) => {
          const offEnd = handle.on('end', async () => {
            offErr();
            try {
              const result = await client.getResults(sessionId);
              resolve(result);
            } catch (e) {
              reject(e);
            }
          });
          const offErr = handle.on('error', (e) => {
            offEnd();
            reject(e instanceof Error ? e : new Error('SSE error'));
          });
        });
      },
      close() {
        closed = true;
        try { sub?.close(); } catch {}
        stream.close();
        emitter.clear();
      },
      async *[Symbol.asyncIterator](): AsyncIterator<SseMessage> {
        for await (const msg of stream) {
          yield msg;
        }
      },
    };

    return handle;
  }

  /**
   * Submits user interaction data during an active run
   * @param sessionId - The unique identifier for the workflow execution session
   * @param data - User input data as key-value pairs
   */
  async submitUserInteraction(sessionId: string, data: UserInteractionData): Promise<void> {
    const path = `/run/${sessionId}/user_interaction`;
    await this.makeRequest<void>('POST', path, data);
  }

  /**
   * Responds to an execution.input_required event whose reason is
   * "non_dismissible_popup" by picking one of the CTA buttons surfaced in
   * popup_context.available_actions. The backend dispatches a synthetic
   * click on the chosen button and resumes the workflow.
   *
   * Only valid while the session is waiting for input. The backing endpoint
   * returns 400 if the wait already expired (the workspace setting
   * input_required_timeout_seconds, default 15s, max 300s).
   *
   * @param sessionId - The session waiting for input.
   * @param actionId - One of the ids in popup_context.available_actions.
   */
  async submitModalAction(sessionId: string, actionId: string): Promise<void> {
    const path = `/run/${sessionId}/new_input_variables`;
    await this.makeRequest<void>('POST', path, { modal_action: actionId });
  }

  /**
   * Responds to an execution.input_required event whose reason is
   * "non_dismissible_popup" by choosing one of the decision options by its
   * label. Pass { save: true } to persist the choice so future matching runs
   * auto-apply it without pausing.
   *
   * Mutually exclusive with submitInputVariables at the endpoint level.
   *
   * @param sessionId - The session waiting for input.
   * @param chosenOption - The exact option label to choose.
   * @param opts - { save } to persist the choice for future matching runs.
   */
  async submitDecision(
    sessionId: string,
    chosenOption: string,
    opts?: { save?: boolean }
  ): Promise<void> {
    const path = `/run/${sessionId}/new_input_variables`;
    await this.makeRequest<void>('POST', path, {
      chosen_option: chosenOption,
      save_decision: opts?.save === true,
    });
  }

  /**
   * Responds to an execution.input_required event whose reason is
   * "input_required", "incorrect_form_input", or "multiple_matching_results"
   * by supplying the corrected/required input variables. Backend resumes from
   * the appropriate recovery node with the new values substituted in.
   *
   * Mutually exclusive with submitModalAction at the endpoint level.
   *
   * @param sessionId - The session waiting for input.
   * @param inputVariables - Mapping of variable name to new value.
   */
  async submitInputVariables(sessionId: string, inputVariables: Record<string, any>): Promise<void> {
    const path = `/run/${sessionId}/new_input_variables`;
    await this.makeRequest<void>('POST', path, { input_variables: inputVariables });
  }

  /**
   * Registers a listener that auto-responds ONLY to non-dismissible modal
   * input_required events (reason === "non_dismissible_popup"). The decider
   * receives the popup_context and must return one of the action ids in
   * popup_context.available_actions.
   *
   * The SDK never picks an action on its own. The customer's decider IS the
   * decision point. If decider throws, the listener swallows it and skips
   * submission; the backend's input wait will time out naturally.
   *
   * Other input_required reasons (incorrect_form_input, etc.) are ignored
   * here and should be routed to onInputVariablesRequired.
   *
   * @returns An unsubscribe callable.
   */
  onPopupDecisionRequired(
    handle: RunHandle,
    decider: (ctx: PopupContext) => string | Promise<string>,
    onError?: (err: unknown) => void,
    options?: { verbose?: boolean },
  ): () => void {
    const verbose = options?.verbose === true;
    const reportError = (err: unknown) => {
      const reporter = onError ?? defaultRecoverySubmitErrorLog('submitModalAction');
      try {
        reporter(err);
      } catch {
        // defense: a buggy onError must not crash the event loop
      }
    };
    if (verbose) verboseLog('onPopupDecisionRequired', 'listener registered');
    const listener = async (event: any) => {
      const payload = (event?.data?.payload ?? event?.payload) as
        | ExecutionInputRequiredPayload
        | undefined;
      if (!payload || payload.reason !== 'non_dismissible_popup' || !payload.popup_context) {
        if (verbose) {
          verboseLog('onPopupDecisionRequired', `skipping reason=${payload?.reason ?? 'undefined'}`);
        }
        return;
      }

      if (verbose) {
        const attempt = payload.popup_context.retry?.attempt;
        const actions = payload.popup_context.available_actions?.map((a) => a.id) ?? [];
        verboseLog(
          'onPopupDecisionRequired',
          `event received attempt=${attempt} actions=${JSON.stringify(actions)}`,
        );
      }

      let actionId: string;
      try {
        actionId = await decider(payload.popup_context);
      } catch (e) {
        if (verbose) verboseLog('onPopupDecisionRequired', `decider raised: ${e}`);
        return;
      }
      if (typeof actionId !== 'string' || actionId.length === 0) {
        if (verbose) verboseLog('onPopupDecisionRequired', `decider returned non-string/empty (${JSON.stringify(actionId)}); skipping`);
        return;
      }

      const sid = payload.session_id || handle.sessionId;
      if (verbose) verboseLog('onPopupDecisionRequired', `submitting modal_action=${JSON.stringify(actionId)} for session=${sid}`);
      try {
        await this.submitModalAction(sid, actionId);
        if (verbose) verboseLog('onPopupDecisionRequired', `submit ok for action=${JSON.stringify(actionId)}`);
      } catch (err) {
        reportError(err);
      }
    };
    const unsubscribe = handle.on(EventType.ExecutionInputRequired, listener as any);
    return typeof unsubscribe === 'function' ? unsubscribe : () => {};
  }

  /**
   * Registers a listener that auto-responds ONLY to workflow-variable
   * input_required events (reason in {"input_required",
   * "incorrect_form_input", "multiple_matching_results"}). The decider
   * receives the full payload and must return the input_variables dict.
   *
   * Counterpart to onPopupDecisionRequired. Modal events
   * (reason === "non_dismissible_popup") are routed there and ignored here.
   *
   * @returns An unsubscribe callable.
   */
  onInputVariablesRequired(
    handle: RunHandle,
    decider: (payload: ExecutionInputRequiredPayload) => Record<string, any> | Promise<Record<string, any>>,
    onError?: (err: unknown) => void,
    options?: { verbose?: boolean },
  ): () => void {
    const verbose = options?.verbose === true;
    const VARIABLE_REASONS = new Set([
      'input_required',
      'incorrect_form_input',
      'multiple_matching_results',
    ]);
    const reportError = (err: unknown) => {
      const reporter = onError ?? defaultRecoverySubmitErrorLog('submitInputVariables');
      try {
        reporter(err);
      } catch {
        // defense
      }
    };
    if (verbose) verboseLog('onInputVariablesRequired', 'listener registered');
    const listener = async (event: any) => {
      const payload = (event?.data?.payload ?? event?.payload) as
        | ExecutionInputRequiredPayload
        | undefined;
      if (!payload || !payload.reason || !VARIABLE_REASONS.has(payload.reason)) {
        if (verbose) verboseLog('onInputVariablesRequired', `skipping reason=${payload?.reason ?? 'undefined'}`);
        return;
      }

      if (verbose) verboseLog('onInputVariablesRequired', `event received reason=${payload.reason}`);

      let inputVars: Record<string, any>;
      try {
        inputVars = await decider(payload);
      } catch (e) {
        if (verbose) verboseLog('onInputVariablesRequired', `decider raised: ${e}`);
        return;
      }
      if (!inputVars || typeof inputVars !== 'object' || Array.isArray(inputVars)) {
        if (verbose) verboseLog('onInputVariablesRequired', `decider returned non-object (${Array.isArray(inputVars) ? 'array' : typeof inputVars}); skipping`);
        return;
      }

      const sid = payload.session_id || handle.sessionId;
      if (verbose) verboseLog('onInputVariablesRequired', `submitting input_variables keys=${JSON.stringify(Object.keys(inputVars))} for session=${sid}`);
      try {
        await this.submitInputVariables(sid, inputVars);
        if (verbose) verboseLog('onInputVariablesRequired', 'submit ok');
      } catch (err) {
        reportError(err);
      }
    };
    const unsubscribe = handle.on(EventType.ExecutionInputRequired, listener as any);
    return typeof unsubscribe === 'function' ? unsubscribe : () => {};
  }

  /**
   * Retrieves comprehensive results and execution details for a specific run
   * @param sessionId - The unique identifier for the workflow execution session
   * @returns Promise resolving to complete run results
   */
  async getResults(sessionId: string): Promise<GetRunResult> {
    const path = `/run/${sessionId}`;
    return await this.makeRequest<GetRunResult>('GET', path);
  }

  /**
   * Fetches a fresh live-view connection (viewer URL + auth token) for
   * watching an active session's browser stream. The auth token is
   * single-use, so reopening a previously used viewer link will fail —
   * call this again to mint a new one instead.
   *
   * Only works while the session is still active; throws once the session
   * has ended.
   *
   * @param sessionId - The unique identifier for the workflow execution session
   */
  async getLiveViewConnection(sessionId: string): Promise<LiveViewConnection> {
    const path = `/live/sessions/${sessionId}/connection`;
    return await this.makeRequest<LiveViewConnection>('GET', path);
  }

  /**
   * Interrupts a running browser agent run
   * @param sessionId - The unique identifier for the workflow execution session
   */
  async interrupt(sessionId: string): Promise<void> {
    const path = `/run/${sessionId}/interrupt`;
    await this.makeRequest<void>('POST', path);
  }

  /**
   * Replays all webhooks that were sent during a session
   * @param sessionId - The ID of the session to replay webhooks for
   * @returns Promise resolving to webhook replay results
   */
  async replayWebhooks(sessionId: string): Promise<WebhookReplayResponse> {
    const path = `/webhooks/${sessionId}/replay`;
    return await this.makeRequest<WebhookReplayResponse>('POST', path);
  }
}
