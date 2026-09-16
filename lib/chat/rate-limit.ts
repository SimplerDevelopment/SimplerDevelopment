/**
 * Visitor message rate limit — token-bucket-ish, in-memory.
 *
 * No `lib/rate-limit.ts` exists in the repo today, so this is a small
 * keyed limiter scoped to chat. Lives in-process: when we eventually
 * scale to multiple Node instances we'll lift this into Redis.
 */

import { MemoryRateLimiter } from '@/lib/security/memory-rate-limit';

const WINDOW_MS = 10_000; // 10s sliding window
const MAX_HITS = 10;      // 10 messages per visitor per 10s

const hits = new MemoryRateLimiter();

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the next attempt is allowed when ok=false. */
  retryAfter?: number;
}

export function checkVisitorRateLimit(key: string, now: number = Date.now()): RateLimitResult {
  const retryMs = hits.check(key, MAX_HITS, WINDOW_MS, now);
  return retryMs === 0 ? { ok: true } : { ok: false, retryAfter: Math.ceil(retryMs / 1000) };
}

/** Test-only — clear the in-memory state between cases. */
export function __resetRateLimit() {
  hits.clear();
}
