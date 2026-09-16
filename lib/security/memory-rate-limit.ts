interface Bucket {
  timestamps: number[];
  expiresAt: number;
}

/** Bounded sliding windows. Never evict live buckets: that would reset quotas. */
export class MemoryRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private nextSweepAt = 0;

  constructor(private readonly maxBuckets = 5_000) {}

  get size(): number { return this.buckets.size; }

  clear(): void {
    this.buckets.clear();
    this.nextSweepAt = 0;
  }

  check(key: string, limit: number, windowMs: number, now = Date.now()): number {
    // Sweep at most once per second, not once per request after 5,000 visitors.
    if (now >= this.nextSweepAt) {
      for (const [id, bucket] of this.buckets) {
        if (bucket.expiresAt <= now) this.buckets.delete(id);
      }
      this.nextSweepAt = now + 1_000;
    }
    let bucket = this.buckets.get(key);
    if (!bucket) {
      // Conservatively reject new identities when full, preserving existing quotas.
      if (this.buckets.size >= this.maxBuckets) return Math.max(1, this.nextSweepAt - now);
      bucket = { timestamps: [], expiresAt: now + windowMs };
      this.buckets.set(key, bucket);
    }
    bucket.timestamps = bucket.timestamps.filter(t => t > now - windowMs);
    if (bucket.timestamps.length >= limit) {
      return Math.max(1, bucket.timestamps[0] + windowMs - now);
    }
    bucket.timestamps.push(now);
    bucket.expiresAt = Math.max(bucket.expiresAt, now + windowMs);
    return 0;
  }
}
