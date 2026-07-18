// @vitest-environment node
/**
 * Unit tests for lib/security/rate-limit.
 *
 * Locks in the two non-obvious behaviors of the Upstash swap:
 *  1. With Upstash UNconfigured (local dev / not provisioned), the limiter
 *     degrades to a per-instance in-memory sliding window and still enforces.
 *  2. FAIL-OPEN: if the Upstash backend throws, the request is allowed (falls
 *     back to in-memory) — a limiter outage must never lock users out.
 *
 * env + module registry are reset per test because `upstashEnabled` is computed
 * at module load from process.env.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.doUnmock('@upstash/ratelimit');
  vi.doUnmock('@upstash/redis');
});

describe('checkRateLimit — in-memory fallback (Upstash unconfigured)', () => {
  it('allows up to the limit, then blocks within the window', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    vi.resetModules();
    const { checkRateLimit } = await import('@/lib/security/rate-limit');

    const key = 'mem-ip:login';
    expect(await checkRateLimit(key, 3, 60_000)).toBe(true);
    expect(await checkRateLimit(key, 3, 60_000)).toBe(true);
    expect(await checkRateLimit(key, 3, 60_000)).toBe(true);
    expect(await checkRateLimit(key, 3, 60_000)).toBe(false); // 4th over the limit
  });
});

describe('checkRateLimit — fail-open when Upstash errors', () => {
  it('falls back to in-memory (allows) when the backend throws', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://fake.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'fake-token');
    vi.doMock('@upstash/ratelimit', () => ({
      Ratelimit: class {
        static slidingWindow() {
          return {};
        }
        limit() {
          throw new Error('upstash down');
        }
      },
    }));
    vi.doMock('@upstash/redis', () => ({ Redis: class {} }));
    vi.resetModules();
    const { checkRateLimit } = await import('@/lib/security/rate-limit');

    // Backend throws → caught → in-memory fallback → first call is within limit.
    expect(await checkRateLimit('failopen-ip:login', 5, 60_000)).toBe(true);
  });
});
