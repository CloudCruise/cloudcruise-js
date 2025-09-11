import type {
  StartRunRequest,
  UserInteractionData,
  RunResult,
  WebhookReplayResponse,
  RunHandle,
  RunStreamOptions,
  SseMessage,
  EventType
} from './types.js';
import { openSSE } from '../utils/sse.js';
import { AsyncEventQueue } from '../utils/asyncQueue.js';
import { SimpleEventEmitter } from '../utils/events.js';

export class RunsClient {
  private readonly makeRequest: <T = any>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: any
  ) => Promise<T>;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly workflows?: {
    validateWorkflowInput: (workflowId: string, payload: Record<string, any>) => Promise<void>;
  };

  constructor(
    makeRequest: <T = any>(
      method: 'GET' | 'POST' | 'PUT' | 'DELETE',
      path: string,
      body?: any
    ) => Promise<T>,
    baseUrl: string,
    apiKey: string,
    workflows?: {
      validateWorkflowInput: (workflowId: string, payload: Record<string, any>) => Promise<void>;
    }
  ) {
    this.makeRequest = makeRequest;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.workflows = workflows;
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
    const { session_id } = await this.makeRequest<{ session_id: string }>('POST', '/run', request);
    return this.subscribeToSession(session_id, options);
  }

  /**
   * Subscribes to SSE events for a given session. Returns a handle with helpers.
   */
  subscribeToSession(sessionId: string, options?: RunStreamOptions): RunHandle {
    const url = `${this.baseUrl}/run/${sessionId}/events`;
    const emitter = new SimpleEventEmitter();
    const stream = new AsyncEventQueue<SseMessage>();

    let ended = false;
    let closed = false;
    let conn: { close: () => void } | null = null;

    const reconnectCfg = {
      enabled: options?.reconnect?.enabled ?? true,
      delays: options?.reconnect?.delays ?? [1000, 3000, 10000],
    };

    const isTerminalEvent = (status?: string | null): status is EventType =>
      status === 'execution.success' || status === 'execution.failed' || status === 'execution.stopped';

    const emit = (event: string, payload?: unknown) => {
      emitter.emit(event, payload);
      // Mirror only SSE messages to 'message' for catch-all consumers
      if (event === 'run.event' || event === 'ping') {
        emitter.emit('message', payload);
      }
    };

    const endAndCleanup = (status: EventType) => {
      if (ended) return;
      ended = true;
      closed = true;
      try { conn?.close(); } catch {}
      emit('end', { type: status });
      stream.close();
      emitter.clear();
    };

    const connect = () => {
      const headers: Record<string, string> = {
        'cc-key': this.apiKey,
        ...(options?.headers ?? {}),
      };

      conn = openSSE(
        url,
        {
          onOpen: () => emit('open', undefined),
          onEvent: (evt) => {
            if (evt.event === 'ping') {
              const pingMsg: SseMessage = { event: 'ping', data: (evt.data ?? {}) as Record<string, unknown> } as SseMessage;
              emit('ping', pingMsg);
              return;
            }
            if (evt.event === 'run.event') {
              const data = evt.data as unknown;
              const sseMsg: SseMessage = { event: 'run.event', data } as SseMessage;
              stream.push(sseMsg);
              emit('run.event', sseMsg);

              let eventType: string | undefined;
              if (data && typeof data === 'object') {
                const outer = data as Record<string, unknown>;
                const inner = outer['data'];
                if (inner && typeof inner === 'object' && 'event' in (inner as Record<string, unknown>)) {
                  const evtVal = (inner as Record<string, unknown>)['event'];
                  if (typeof evtVal === 'string') eventType = evtVal;
                }
              }
              if (isTerminalEvent(eventType)) {
                endAndCleanup(eventType);
              }
            }
          },
          onError: (err) => {
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
                conn?.close();
                if (closed) return;
                connect();
                return;
              }
            })();
          },
          onClose: () => {
            // no-op; reconnect and end are handled elsewhere
          },
        },
        {
          headers,
          withCredentials: options?.withCredentials,
          signal: options?.signal,
        }
      );
    };

    connect();

    const client = this;
    const handle: RunHandle = {
      sessionId,
      on: (event, handler) => emitter.on(event as string, handler),
      async wait(): Promise<RunResult> {
        if (ended) {
          return await client.getResults(sessionId);
        }
        return await new Promise<RunResult>((resolve, reject) => {
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
        try { conn?.close(); } catch {}
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
   * Retrieves comprehensive results and execution details for a specific run
   * @param sessionId - The unique identifier for the workflow execution session
   * @returns Promise resolving to complete run results
   */
  async getResults(sessionId: string): Promise<RunResult> {
    const path = `/run/${sessionId}`;
    return await this.makeRequest<RunResult>('GET', path);
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
