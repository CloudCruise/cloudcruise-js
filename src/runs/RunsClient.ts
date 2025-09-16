import type {
  StartRunRequest,
  UserInteractionData,
  RunResult,
  GetRunResult,
  WebhookReplayResponse,
  RunHandle,
  RunStreamOptions,
  SseMessage,
  EventType
} from './types.js';
import { AsyncEventQueue } from '../utils/asyncQueue.js';
import { SimpleEventEmitter } from '../utils/events.js';
import { ConnectionManager } from '../utils/connectionManager.js';
import type { SessionSubscription } from '../utils/connectionManager.js';

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
    const emitter = new SimpleEventEmitter();
    const stream = new AsyncEventQueue<SseMessage>();

    let ended = false;
    let closed = false;
    let sub: SessionSubscription | null = null;

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
      try { sub?.close(); } catch {}
      emit('end', { type: status });
      stream.close();
      emitter.clear();
    };

    const connect = () => {
      sub = this.connectionManager.subscribe(sessionId, { signal: options?.signal });

      const s = sub!;
      s.on('open', () => emit('open', undefined));
      s.on('ping', (evt) => emit('ping', evt));
      s.on('run.event', (msg: unknown) => {
        const sseMsg = msg as SseMessage;
        if (sseMsg.event !== 'run.event') return;
        stream.push(sseMsg);
        emit('run.event', sseMsg);

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
      s.on('reconnect', (e) => emit('reconnect', e));
      s.on('end', (e: unknown) => {
        const t = (e as { type?: EventType | string } | undefined)?.type;
        if (t && typeof t === 'string' && isTerminalEvent(t)) {
          endAndCleanup(t);
        } else {
          // End without explicit type; still clean up
          endAndCleanup('execution.stopped');
        }
      });
    };

    connect();

    const client = this;
    const handle: RunHandle = {
      sessionId,
      on: (event, handler) => emitter.on(event as string, handler),
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
   * Retrieves comprehensive results and execution details for a specific run
   * @param sessionId - The unique identifier for the workflow execution session
   * @returns Promise resolving to complete run results
   */
  async getResults(sessionId: string): Promise<GetRunResult> {
    const path = `/run/${sessionId}`;
    return await this.makeRequest<GetRunResult>('GET', path);
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
