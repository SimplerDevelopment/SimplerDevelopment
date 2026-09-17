/** Lazy TTL + LRU capacity: idle entries never accumulate without a hard bound. */
export class BoundedTtlCache<T, K extends string | number = string> {
  private readonly entries = new Map<K, { value: T; expiresAt: number }>();
  private nextSweepAt = 0;

  constructor(private readonly capacity: number, private readonly ttlMs: number) {}

  get size(): number { return this.entries.size; }

  private sweep(): void {
    const now = Date.now();
    if (now < this.nextSweepAt) return;
    this.nextSweepAt = now + 1_000;
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
  }

  get(key: K): T | undefined {
    this.sweep();
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    if (entry.expiresAt <= Date.now()) return undefined;
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: K, value: T): void {
    this.sweep();
    this.entries.delete(key);
    if (this.ttlMs <= 0 || this.capacity <= 0) return;
    if (this.entries.size >= this.capacity) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  delete(key: K): boolean { return this.entries.delete(key); }

  keys(): IterableIterator<K> { this.sweep(); return this.entries.keys(); }

  clear(): void { this.entries.clear(); this.nextSweepAt = 0; }
}
