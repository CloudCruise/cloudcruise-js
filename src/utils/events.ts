export type EventHandler<T = unknown> = (event: T) => void;

export class SimpleEventEmitter {
  private listeners = new Map<string, Set<EventHandler>>();

  on(event: string, handler: EventHandler<unknown>): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler as EventHandler);
    return () => {
      const set = this.listeners.get(event);
      if (set) set.delete(handler as EventHandler);
    };
  }

  emit(event: string, payload?: unknown): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const handler of set) handler(payload);
  }

  clear(): void {
    this.listeners.clear();
  }
}
