/**
 * Small bounded FIFO used at the transport boundary. Messages stay queued
 * until the sender confirms delivery, while callers may coalesce snapshots
 * that supersede one another before the channel is ready.
 */
export class BoundedOutbox<T> {
  private readonly entries: T[] = [];

  constructor(
    private readonly maxEntries: number,
    private readonly coalesceKey?: (entry: T) => string | undefined,
  ) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1) throw new Error("Outbox capacity must be positive.");
  }

  enqueue(entry: T): void {
    const key = this.coalesceKey?.(entry);
    if (key !== undefined) {
      for (let index = this.entries.length - 1; index >= 0; index -= 1) {
        if (this.coalesceKey?.(this.entries[index] as T) === key) this.entries.splice(index, 1);
      }
    }
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) this.entries.splice(0, this.entries.length - this.maxEntries);
  }

  peek(): T | undefined {
    return this.entries[0];
  }

  remove(entry: T): boolean {
    if (this.entries[0] !== entry) return false;
    this.entries.shift();
    return true;
  }

  clear(): void {
    this.entries.length = 0;
  }

  get size(): number {
    return this.entries.length;
  }
}
