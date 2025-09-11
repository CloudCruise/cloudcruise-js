export class AsyncEventQueue<T> implements AsyncIterable<T> {
  private items: T[] = [];
  private pending: ((value: IteratorResult<T>) => void) | null = null;
  private done = false;

  push(item: T): void {
    if (this.done) return;
    if (this.pending) {
      const resolve = this.pending;
      this.pending = null;
      resolve({ value: item, done: false });
    } else {
      this.items.push(item);
    }
  }

  close(): void {
    if (this.done) return;
    this.done = true;
    if (this.pending) {
      const resolve = this.pending;
      this.pending = null;
      resolve({ value: undefined as unknown as T, done: true });
    }
  }

  async next(): Promise<IteratorResult<T>> {
    if (this.items.length) {
      return { value: this.items.shift() as T, done: false };
    }
    if (this.done) {
      return { value: undefined as unknown as T, done: true };
    }
    return await new Promise<IteratorResult<T>>(resolve => {
      this.pending = resolve;
    });
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => this.next(),
    } as AsyncIterator<T>;
  }
}
