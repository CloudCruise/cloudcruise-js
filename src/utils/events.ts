export type EventHandler<T = unknown> = (event: T) => void;

/**
 * Event emitter that supports both typed and untyped usage.
 * 
 * - Use without type parameter for untyped events (backward compatible)
 * - Use with EventMap type parameter for type-safe events
 * 
 * @example
 * // Untyped usage
 * const emitter = new SimpleEventEmitter();
 * emitter.on('foo', (data) => console.log(data));
 * 
 * @example
 * // Typed usage
 * type Events = { foo: string; bar: number };
 * const emitter = new SimpleEventEmitter<Events>();
 * emitter.on('foo', (data) => console.log(data)); // data is string
 */
export class SimpleEventEmitter<EventMap extends Record<string, any> = Record<string, unknown>> {
  private listeners = new Map<keyof EventMap | string, Set<EventHandler<any>>>();

  on<K extends keyof EventMap>(
    event: K,
    handler: EventHandler<EventMap[K]>
  ): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler);
    return () => {
      const set = this.listeners.get(event);
      if (set) set.delete(handler);
    };
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const handler of set) handler(payload);
  }

  clear(): void {
    this.listeners.clear();
  }
}
