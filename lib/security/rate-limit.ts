/**
 * In-memory sliding-window rate limiter.
 *
 * IMPORTANT — serverless limitation: each Vercel/Node instance has its own
 * in-memory Map. On serverless deployments with multiple instances the limit
 * is per-instance, not global. This is a best-effort guardrail against naive
 * brute-force from a single client hitting the same cold instance repeatedly;
 * it is NOT a hard global gate. For a hard global gate, back this with Redis
 * (e.g. Upstash) keyed on the same `ip:action` string.
 */

interface Window {
  timestamps: number[];
}

const store = new Map<string, Window>();

/**
 * Check if a request should be rate-limited.
 *
 * @param key     - Unique key for this bucket (e.g. `${ip}:forgot-password`).
 * @param limit   - Max allowed requests in the window.
 * @param windowMs - Window size in milliseconds.
 * @returns `true` if the request is within the limit (allow), `false` if it
 *          exceeds the limit (block — caller should return 429).
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;

  const entry = store.get(key) ?? { timestamps: [] };

  // Drop timestamps outside the current window
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  if (entry.timestamps.length >= limit) {
    store.set(key, entry);
    return false; // over limit — block
  }

  entry.timestamps.push(now);
  store.set(key, entry);
  return true; // within limit — allow
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
