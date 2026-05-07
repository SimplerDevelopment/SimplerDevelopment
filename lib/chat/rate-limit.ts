/**
 * Visitor message rate limit — token-bucket-ish, in-memory.
 *
 * No `lib/rate-limit.ts` exists in the repo today, so this is a small
 * keyed limiter scoped to chat. Lives in-process: when we eventually
 * scale to multiple Node instances we'll lift this into Redis.
 */

const WINDOW_MS = 10_000; // 10s sliding window
const MAX_HITS = 10;      // 10 messages per visitor per 10s

const hits = new Map<string, number[]>();

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the next attempt is allowed when ok=false. */
  retryAfter?: number;
}

export function checkVisitorRateLimit(key: string, now: number = Date.now()): RateLimitResult {
  const cutoff = now - WINDOW_MS;
  const existing = hits.get(key) ?? [];
  const recent = existing.filter((t) => t > cutoff);
  if (recent.length >= MAX_HITS) {
    const oldest = recent[0];
    return { ok: false, retryAfter: Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000)) };
  }
  recent.push(now);
  hits.set(key, recent);
  // Periodic GC — cheap enough at request-rate scale.
  if (hits.size > 5_000) {
    for (const [k, v] of hits) {
      const trimmed = v.filter((t) => t > cutoff);
      if (trimmed.length === 0) hits.delete(k);
      else hits.set(k, trimmed);
    }
  }
  return { ok: true };
}

/** Test-only — clear the in-memory state between cases. */
export function __resetRateLimit() {
  hits.clear();
}
