export interface SSEHandlers {
  onOpen?: () => void;
  onEvent?: (evt: { event: string; data?: any; id?: string; raw?: string }) => void;
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

  const canUseEventSource =
    typeof window !== 'undefined' &&
    typeof (window as any).EventSource !== 'undefined' &&
    withCredentials === true &&
    (!headers || Object.keys(headers).length === 0);

  if (canUseEventSource) {
    const ES: any = (window as any).EventSource;
    const es = new ES(url, { withCredentials: true });

    const onOpenHandler = () => onOpen?.();
    const onErrorHandler = (e: any) => onError?.(e instanceof Error ? e : new Error('EventSource error'));
    const onRunEvent = (e: MessageEvent) => {
      let parsed: any = e.data;
      try { parsed = e.data ? JSON.parse(e.data) : undefined; } catch {}
      onEvent?.({ event: 'run.event', data: parsed, id: (e as any).lastEventId, raw: String(e.data ?? '') });
    };
    const onPing = (e: MessageEvent) => {
      let parsed: any = e.data;
      try { parsed = e.data ? JSON.parse(e.data) : undefined; } catch {}
      onEvent?.({ event: 'ping', data: parsed, id: (e as any).lastEventId, raw: String(e.data ?? '') });
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
      }
    };
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal) signal.addEventListener('abort', abort, { once: true });

  (async () => {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          'Cache-Control': 'no-cache',
          ...(headers ?? {})
        },
        // credentials has effect in browsers; ignored in Node
        credentials: withCredentials ? 'include' : 'same-origin',
        signal: controller.signal
      } as RequestInit);
      if (!res.ok || !res.body) throw new Error(`SSE HTTP ${res.status}`);

      onOpen?.();

      const reader = (res.body as ReadableStream<Uint8Array>).getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const flush = (chunk: string) => {
        const frames = (buffer + chunk).split(/\r?\n\r?\n/);
        buffer = frames.pop() ?? '';
        for (const frame of frames) {
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

          let parsed: any = data;
          try { parsed = data ? JSON.parse(data) : undefined; } catch {}
          onEvent?.({ event, data: parsed, id, raw: frame });
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        flush(decoder.decode(value, { stream: true }));
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
    }
  };
}


