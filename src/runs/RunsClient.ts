import type {
  StartRunRequest,
  UserInteractionData,
  RunResult,
  WebhookReplayResponse,
  RunHandle,
  RunStreamOptions,
  SseMessage
} from './types.js';
import { openSSE } from '../utils/sse.js';

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
    // Validate input against workflow schema when workflows client is available
    if (this.workflows) {
      await this.workflows.validateWorkflowInput(request.workflow_id, request.run_input_variables);
    }
    const { session_id } = await this.makeRequest<{ session_id: string }>('POST', '/run', request);
    return this.subscribeToSession(session_id, options);
  }

  /**
   * Subscribes to SSE events for a given session. Returns a handle with helpers.
   */
  subscribeToSession(sessionId: string, options?: RunStreamOptions): RunHandle {
    const url = `${this.baseUrl}/run/${sessionId}/events`;
    const listeners = new Map<string, Set<(e: any) => void>>();
    const queue: SseMessage[] = [];
    let resolveNext: ((v: any) => void) | null = null;

    const emit = (type: string, e?: any) => {
      listeners.get(type)?.forEach(fn => fn(e));
      listeners.get('message')?.forEach(fn => fn(e));
    };

    let ended = false;
    let closed = false;
    let conn: { close: () => void } | null = null;

    const reconnectCfg = {
      enabled: options?.reconnect?.enabled ?? true,
      delays: options?.reconnect?.delays ?? [1000, 3000, 10000],
      jitter: options?.reconnect?.jitter ?? 0.2
    };

    const connect = () => {
      const headers: Record<string, string> = {
        'cc-key': this.apiKey,
        ...(options?.headers ?? {})
      };

      conn = openSSE(
        url,
        {
          onOpen: () => emit('open'),
          onEvent: (evt) => {
            if (evt.event === 'ping') {
              emit('ping', evt);
              return;
            }
            if (evt.event === 'run.event') {
              const msg = evt as unknown as { data?: any };
              const data = msg?.data;
              const sseMsg: SseMessage = { event: 'run.event', data } as SseMessage;
              const fnPending = resolveNext;
              if (fnPending) {
                resolveNext = null;
                (fnPending as (arg: any) => void)({ value: sseMsg, done: false });
              } else {
                queue.push(sseMsg);
              }
              emit('run.event', sseMsg);

              const eventType = data?.data?.event;
              if (eventType === 'execution.success' || eventType === 'execution.failed' || eventType === 'execution.stopped') {
                ended = true;
                closed = true;
                try { conn?.close(); } catch {}
                emit('end', { type: eventType });
                // complete iterator
                const fnDone = resolveNext;
                if (fnDone) {
                  resolveNext = null;
                  (fnDone as (arg: any) => void)({ value: undefined, done: true });
                }
                // clear listeners to avoid leaks
                listeners.clear();
              }
              return;
            }
          },
          onError: (err) => {
            emit('error', err);
            if (!reconnectCfg.enabled || ended || closed) return;

            (async () => {
              for (const base of reconnectCfg.delays) {
                if (ended || closed) return;
                const jitter = base * reconnectCfg.jitter * (Math.random() * 2 - 1);
                const delay = Math.max(0, base + jitter);
                await new Promise(r => setTimeout(r, delay));
                if (ended || closed) return;

                try {
                  const snapshot = await this.getResults(sessionId);
                  const status = snapshot?.status;
                  if (status === 'execution.success' || status === 'execution.failed' || status === 'execution.stopped') {
                    ended = true;
                    emit('end', { type: status });
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
            // if ended or closed, iterator should complete; otherwise, reconnect logic handles elsewhere
          }
        },
        {
          headers,
          withCredentials: options?.withCredentials,
          signal: options?.signal
        }
      );
    };

    connect();

    const client = this;
    const handle: RunHandle = {
      sessionId,
      on: (event, handler) => {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event)!.add(handler);
        return () => listeners.get(event)!.delete(handler);
      },
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
      async submit(data: UserInteractionData) {
        await client.submitUserInteraction(sessionId, data);
      },
      async interrupt() {
        await client.interrupt(sessionId);
      },
      async replayWebhooks() {
        return await client.replayWebhooks(sessionId);
      },
      close() {
        closed = true;
        conn?.close();
        // complete iterator and clear listeners
        if (resolveNext) {
          resolveNext({ value: undefined as any, done: true });
          resolveNext = null;
        }
        listeners.clear();
      },
      async *[Symbol.asyncIterator](): AsyncIterator<SseMessage> {
        try {
          while (true) {
            if (queue.length) {
              yield queue.shift()!;
              continue;
            }
            const next = await new Promise<any>(r => (resolveNext = r));
            if (next && next.done) {
              return;
            }
            if (next) yield next.value;
          }
        } finally {
          // iterator closed by consumer; no action
        }
      }
    };

    // methods already close over client

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
