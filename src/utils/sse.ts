export interface SSEHandlers {
  onOpen?: () => void;
  onEvent?: (evt: { event: string; data?: unknown; id?: string; raw?: string }) => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
}

export interface SSEOptions {
  headers?: HeadersInit;
  withCredentials?: boolean;
  signal?: AbortSignal;
}

export interface SSEConnection {
  close(): void;
}

/**
 * Open an SSE connection using either native EventSource (browser, cookie auth)
 * or fetch streaming (Node 18+ and modern browsers) when custom headers are needed.
 */
export function openSSE(url: string, handlers: SSEHandlers, opts?: SSEOptions): SSEConnection {
  const { onOpen, onEvent, onError, onClose } = handlers;
  const { headers, withCredentials, signal } = opts ?? {};

  const shouldUseEventSource = () =>
    typeof window !== 'undefined' &&
    'EventSource' in window &&
    withCredentials === true &&
    (!headers || Object.keys(headers).length === 0);

  const parseJSON = (text: string): unknown => {
    try { return text ? JSON.parse(text) : undefined; } catch { return text || undefined; }
  };

  const createEventSourceConnection = (): SSEConnection => {
    const ES = (window as unknown as { EventSource?: typeof EventSource }).EventSource as typeof EventSource;
    const es = new ES(url, { withCredentials: true });

    const onOpenHandler = () => onOpen?.();
    const onErrorHandler = (e: unknown) => onError?.(e instanceof Error ? e : new Error('EventSource error'));
    const onRunEvent = (e: MessageEvent) => {
      const raw = String(e.data ?? '');
      const parsed = parseJSON(raw);
      onEvent?.({ event: 'run.event', data: parsed, id: (e as unknown as { lastEventId?: string }).lastEventId, raw });
    };
    const onPing = (e: MessageEvent) => {
      const raw = String(e.data ?? '');
      const parsed = parseJSON(raw);
      onEvent?.({ event: 'ping', data: parsed, id: (e as unknown as { lastEventId?: string }).lastEventId, raw });
    };

    es.addEventListener('open', onOpenHandler);
    es.addEventListener('error', onErrorHandler);
    es.addEventListener('run.event', onRunEvent);
    es.addEventListener('ping', onPing);

    if (signal) {
      const onAbort = () => {
        es.close();
        onClose?.();
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }

    return {
      close() {
        es.close();
        onClose?.();
      },
    };
  };

  const createFetchConnection = (): SSEConnection => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal) signal.addEventListener('abort', abort, { once: true });

    const parseFrame = (frame: string) => {
      let event = 'message';
      let data = '';
      let id: string | undefined;
      for (const line of frame.split(/\r?\n/)) {
        if (!line || line.startsWith(':')) continue;
        const idx = line.indexOf(':');
        const field = idx === -1 ? line : line.slice(0, idx);
        const value = idx === -1 ? '' : line.slice(idx + 1).trimStart();
        if (field === 'event') event = value;
        else if (field === 'data') data += (data ? '\n' : '') + value;
        else if (field === 'id') id = value;
      }
      const parsed = parseJSON(data);
      return { event, data: parsed, id, raw: frame } as const;
    };

    (async () => {
      try {
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            Accept: 'text/event-stream',
            'Cache-Control': 'no-cache',
            ...(headers ?? {}),
          },
          credentials: withCredentials ? 'include' : 'same-origin',
          signal: controller.signal,
        } as RequestInit);
        if (!res.ok || !res.body) throw new Error(`SSE HTTP ${res.status}`);

        onOpen?.();

        const reader = (res.body as ReadableStream<Uint8Array>).getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const parts = (buffer + chunk).split(/\r?\n\r?\n/);
          buffer = parts.pop() ?? '';
          for (const frame of parts) {
            const evt = parseFrame(frame);
            onEvent?.(evt);
          }
        }
        onClose?.();
      } catch (err) {
        onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    })();

    return {
      close() {
        abort();
        onClose?.();
      },
    };
  };

  return shouldUseEventSource() ? createEventSourceConnection() : createFetchConnection();
}
