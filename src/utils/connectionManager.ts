import { openSSE, type SSEConnection } from './sse.js';
import { SimpleEventEmitter } from './events.js';
import { AsyncEventQueue } from './asyncQueue.js';
import type { SseMessage } from '../runs/types.js';

type EventName = 'open' | 'error' | 'close' | 'ping' | 'run.event' | 'end' | 'reconnect' | 'message';
type Listener = (e: any) => void;

interface SubscribeOptions {
  signal?: AbortSignal;
}

interface SessionChannel {
  sessionId: string;
  emitter: SimpleEventEmitter;
  subscribers: Set<AsyncEventQueue<SseMessage>>;
  ended: boolean;
}

function isFinalEvent(eventType: string | undefined): boolean {
  return eventType === 'execution.success' || eventType === 'execution.failed' || eventType === 'execution.stopped';
}

export interface SessionSubscription {
  on(event: string, handler: Listener): () => void;
  close(): void;
  [Symbol.asyncIterator](): AsyncIterator<SseMessage>;
}

export class ConnectionManager {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  private clientId: string | undefined;
  private conn: SSEConnection | null = null;
  private connecting = false;
  private connected = false;
  private reconnecting = false;
  private readonly reconnectDelays = [1000, 3000, 10000];
  private readonly sessions = new Map<string, SessionChannel>();

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  async ensureClientId(): Promise<string> {
    if (this.clientId) return this.clientId;
    this.clientId = this.generateClientId();
    return this.clientId;
  }

  private generateClientId(): string {
    type CryptoLike = {
      randomUUID?: () => string;
      getRandomValues?: (arr: Uint8Array) => void;
    };
    const cryptoObj = (globalThis as unknown as { crypto?: CryptoLike }).crypto;

    // Preferred: native CSPRNG-backed UUID
    if (cryptoObj?.randomUUID) {
      return cryptoObj.randomUUID();
    }

    // Fallback: RFC4122 v4 built from CSPRNG bytes
    if (cryptoObj?.getRandomValues) {
      const bytes = new Uint8Array(16);
      cryptoObj.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
      bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
      return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
    }

    // Last resort: non-CSPRNG timestamp + Math.random
    let d = Date.now();
    let d2 =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? Math.floor(performance.now() * 1000)
        : 0;
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      let r = Math.random() * 16;
      if (d > 0) {
        r = ((d + r) % 16) | 0;
        d = Math.floor(d / 16);
      } else {
        r = ((d2 + r) % 16) | 0;
        d2 = Math.floor(d2 / 16);
      }
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  async connectIfNeeded(): Promise<void> {
    if (this.connected || this.connecting) return;
    if (!this.clientId) await this.ensureClientId();
    await this.openMuxConnection();
  }

  subscribe(sessionId: string, opts?: SubscribeOptions): SessionSubscription {
    // Ensure channel exists
    let channel = this.sessions.get(sessionId);
    if (!channel) {
      channel = {
        sessionId,
        emitter: new SimpleEventEmitter(),
        subscribers: new Set<AsyncEventQueue<SseMessage>>(),
        ended: false
      };
      this.sessions.set(sessionId, channel);
    }

    // Create per-handle queue
    const queue = new AsyncEventQueue<SseMessage>();
    channel.subscribers.add(queue);

    // Propagate abort to handle close
    if (opts?.signal) {
      const onAbort = () => sub.close();
      opts.signal.addEventListener('abort', onAbort, { once: true });
    }

    const sub: SessionSubscription = {
      on: (event: string, handler: Listener) => channel!.emitter.on(event, handler),
      close: () => {
        if (!channel) return;
        queue.close();
        channel.subscribers.delete(queue);
        // If no more subscribers and channel is ended, remove it
        if (channel.subscribers.size === 0 && channel.ended) {
          this.sessions.delete(sessionId);
        }
      },
      [Symbol.asyncIterator](): AsyncIterator<SseMessage> {
        return queue[Symbol.asyncIterator]();
      }
    };

    return sub;
  }

  private async openMuxConnection() {
    if (this.connecting || this.connected) return;
    if (!this.clientId) await this.ensureClientId();

    this.connecting = true;

    const headers: Record<string, string> = {
      'cc-key': this.apiKey
    };

    const url = `${this.baseUrl}/run/clients/${this.clientId}/events`;

    const emitAll = (event: EventName, payload?: any) => {
      for (const ch of this.sessions.values()) {
        ch.emitter.emit(event, payload);
      }
    };

    try {
      this.conn = openSSE(
        url,
        {
          onOpen: () => {
            this.connected = true;
            this.connecting = false;
            emitAll('open');
          },
          onEvent: (evt) => {
            if (evt.event === 'ping') {
              emitAll('ping', evt);
              return;
            }
            if (evt.event === 'run.event') {
              const data = (evt as any)?.data;
              const sessionId = data?.payload?.session_id;
              if (!sessionId) return;
              const channel = this.sessions.get(sessionId);
              if (!channel) return;

              const msg: SseMessage = { event: 'run.event', data } as SseMessage;

              // fan-out to all subscribers
              for (const q of channel.subscribers) q.push(msg);
              channel.emitter.emit('run.event', msg);

              const eventType = data?.event;
              if (isFinalEvent(eventType)) {
                channel.ended = true;
                channel.emitter.emit('end', { type: eventType });
                for (const q of channel.subscribers) q.close();
                channel.subscribers.clear();
                // Remove the channel after notifying
                this.sessions.delete(sessionId);
              }
              return;
            }
          },
          onError: (err) => {
            // Surface error to all channels and attempt reconnect
            emitAll('error', err);
            if (!this.reconnecting) this.scheduleReconnect();
          },
          onClose: () => {
            this.connected = false;
            this.connecting = false;
            emitAll('close');
            if (!this.reconnecting) this.scheduleReconnect();
          }
        },
        {
          headers,
          withCredentials: false
        }
      );
    } catch (e) {
      this.connected = false;
      this.connecting = false;
      if (!this.reconnecting) this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnecting) return;
    this.reconnecting = true;

    (async () => {
      for (const delay of this.reconnectDelays) {
        // Notify listeners about reconnect attempt
        for (const ch of this.sessions.values()) ch.emitter.emit('reconnect', { attemptDelayMs: delay });
        await new Promise(r => setTimeout(r, delay));
        try {
          await this.openMuxConnection();
          if (this.connected) {
            this.reconnecting = false;
            return;
          }
        } catch {
          // continue to next delay
        }
      }
      // Give up after exhausting delays; next event/subscribe will try again
      this.reconnecting = false;
    })();
  }
}
