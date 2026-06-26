/**
 * Sliding-window rate limiter, backed by Upstash Redis on serverless.
 *
 * Why Upstash: the app runs on Vercel serverless (many short-lived instances).
 * A shared store is required so a per-IP counter is *global*, not per-instance.
 * Upstash speaks HTTP, so there's no TCP connection pool to exhaust on cold
 * starts (a plain Redis/ioredis client would be the wrong tool here).
 *
 * Failure policy — FAIL-OPEN with in-memory fallback: if Upstash is unset
 * (local dev) or unreachable/slow, we degrade to a per-instance in-memory
 * window rather than block. The limiter is defense-in-depth (bcrypt + account
 * checks still gate auth); a limiter outage must never lock legit users out.
 */
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// ---------------------------------------------------------------------------
// In-memory fallback — also the active path locally until Upstash is provisioned.
// ---------------------------------------------------------------------------
interface MemWindow {
  timestamps: number[];
}

const memStore = new Map<string, MemWindow>();

function checkRateLimitInMemory(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;

  const entry = memStore.get(key) ?? { timestamps: [] };
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  if (entry.timestamps.length >= limit) {
    memStore.set(key, entry);
    return false; // over limit — block
  }

  entry.timestamps.push(now);
  memStore.set(key, entry);
  return true; // within limit — allow
}

// ---------------------------------------------------------------------------
// Upstash backend.
// ---------------------------------------------------------------------------
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const upstashEnabled = Boolean(UPSTASH_URL && UPSTASH_TOKEN);

const UPSTASH_TIMEOUT_MS = 1000;

let redis: Redis | null = null;
function getRedis(): Redis {
  if (!redis) redis = new Redis({ url: UPSTASH_URL!, token: UPSTASH_TOKEN! });
  return redis;
}

// The callers pass (limit, windowMs) per call, but @upstash/ratelimit bakes the
// window+limit into a Ratelimit instance. Memoize one instance per distinct
// (limit, windowMs) so the existing call-site signature stays unchanged.
const limiters = new Map<string, Ratelimit>();
function getLimiter(limit: number, windowMs: number): Ratelimit {
  const memoKey = `${limit}:${windowMs}`;
  let rl = limiters.get(memoKey);
  if (!rl) {
    rl = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(limit, `${Math.ceil(windowMs / 1000)} s`),
      prefix: 'rl',
      analytics: false,
    });
    limiters.set(memoKey, rl);
  }
  return rl;
}

/**
 * Check if a request should be rate-limited.
 *
 * @param key      - Unique bucket key (e.g. `${ip}:login`).
 * @param limit    - Max allowed requests in the window.
 * @param windowMs - Window size in milliseconds.
 * @returns `true` to allow, `false` to block (caller should return 429).
 *
 * Async because the Upstash backend is an HTTP call. Fails open to in-memory.
 */
export async function checkRateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  if (!upstashEnabled) {
    return checkRateLimitInMemory(key, limit, windowMs);
  }

  try {
    const limiter = getLimiter(limit, windowMs);
    // ponytail: dangling timer on the win-path is a <=1s no-op; not worth clearing.
    const result = await Promise.race([
      limiter.limit(key),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('upstash-timeout')), UPSTASH_TIMEOUT_MS),
      ),
    ]);

    if (!result.success) {
      console.warn(
        JSON.stringify({ level: 'warn', event: 'rate_limit_block', key, limit, windowMs }),
      );
    }
    return result.success;
  } catch (err) {
    // Fail-open: degrade to per-instance in-memory rather than block on a
    // backend blip. Log so the outage is visible.
    console.warn(
      JSON.stringify({
        level: 'warn',
        event: 'rate_limit_backend_error',
        key,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return checkRateLimitInMemory(key, limit, windowMs);
  }
}

/**
 * Extract the client IP from a Next.js / Vercel request.
 * Falls back to "unknown" when no header is present (local dev).
 */
export function getClientIp(req: Request): string {
  const headers = req.headers;
  return (
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headers.get('x-real-ip') ??
    'unknown'
  );
}
