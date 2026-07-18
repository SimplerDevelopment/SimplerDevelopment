// Plugin callback rate limiter — sliding-window in-memory counter keyed by
// (appId, clientId). Default 30 req/min per
// .planning/plugin-registry-spec.md §"Rate limiting".
//
// Pattern is duplicated from `lib/api-keys.ts::checkRateLimit` rather than
// imported because the api-keys helper is keyed by a single integer
// (apiKey.id). Plugin callbacks need a composite key. Keeping the
// implementation local also avoids dragging the api-keys schema into Edge
// builds that might consume this in future.
//
// The single-process in-memory Map is the same trade-off the api-keys
// limiter makes: works on a single Vercel function, "good enough" for v1
// abuse-prevention. A distributed counter (Redis / Upstash) is the v2
// migration path; the surface here doesn't need to change.

const WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 30;

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

function keyOf(appId: number, clientId: number): string {
  return `${appId}:${clientId}`;
}

export interface RateLimitOk {
  ok: true;
  remaining: number;
  resetAt: Date;
}

export interface RateLimitDenied {
  ok: false;
  /** Seconds until the bucket resets. Suitable for the Retry-After header. */
  retryAfter: number;
  resetAt: Date;
}

export type RateLimitResult = RateLimitOk | RateLimitDenied;

/**
 * Consume one slot in the (appId, clientId) bucket. Returns `ok:true` while
 * the bucket is under the limit; returns `ok:false` with a retryAfter once
 * the count exceeds the limit.
 *
 * `limit` defaults to 30/min. Tests can override.
 */
export function checkPluginCallbackRateLimit(
  appId: number,
  clientId: number,
  limit: number = DEFAULT_LIMIT,
): RateLimitResult {
  const now = Date.now();
  const k = keyOf(appId, clientId);
  const bucket = buckets.get(k);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(k, { count: 1, resetAt: now + WINDOW_MS });
    return {
      ok: true,
      remaining: limit - 1,
      resetAt: new Date(now + WINDOW_MS),
    };
  }
  bucket.count++;
  if (bucket.count > limit) {
    const retryAfterMs = bucket.resetAt - now;
    return {
      ok: false,
      retryAfter: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      resetAt: new Date(bucket.resetAt),
    };
  }
  return {
    ok: true,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: new Date(bucket.resetAt),
  };
}

/** Test / admin reset. Clears all buckets when called with no args. */
export function resetPluginCallbackRateLimit(
  appId?: number,
  clientId?: number,
): void {
  if (appId === undefined || clientId === undefined) {
    buckets.clear();
    return;
  }
  buckets.delete(keyOf(appId, clientId));
}
