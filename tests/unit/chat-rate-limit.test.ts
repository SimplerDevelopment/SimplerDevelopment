// @vitest-environment node
/**
 * Unit tests for the in-memory visitor message rate limiter in
 * lib/chat/rate-limit.ts. Module-level state is reset between tests
 * via the exported __resetRateLimit() helper.
 *
 * Rate-limit knobs (constants in the SUT):
 *   WINDOW_MS = 10_000  — 10s sliding window
 *   MAX_HITS  = 10      — max 10 messages per key per window
 *
 * `now` can be passed explicitly so tests don't need fake timers.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { checkVisitorRateLimit, __resetRateLimit } from '@/lib/chat/rate-limit';

beforeEach(() => {
  __resetRateLimit();
});

describe('checkVisitorRateLimit — happy path within window', () => {
  it('returns ok=true with no retryAfter on the first hit for a key', () => {
    const r = checkVisitorRateLimit('visitor-1', 1_000);
    expect(r).toEqual({ ok: true });
    expect(r.retryAfter).toBeUndefined();
  });

  it('accepts up to MAX_HITS (10) requests in the same window', () => {
    const t0 = 1_000;
    for (let i = 0; i < 10; i++) {
      const r = checkVisitorRateLimit('visitor-1', t0 + i);
      expect(r.ok).toBe(true);
    }
  });

  it('rejects the 11th request inside the window', () => {
    const t0 = 1_000;
    for (let i = 0; i < 10; i++) {
      checkVisitorRateLimit('visitor-1', t0 + i);
    }
    const r = checkVisitorRateLimit('visitor-1', t0 + 11);
    expect(r.ok).toBe(false);
    expect(r.retryAfter).toBeGreaterThan(0);
  });

  it('isolates keys — visitor-2 is unaffected by visitor-1 hitting the cap', () => {
    const t0 = 1_000;
    for (let i = 0; i < 10; i++) {
      checkVisitorRateLimit('visitor-1', t0 + i);
    }
    // visitor-1 is now over the cap, but visitor-2 has its own bucket.
    expect(checkVisitorRateLimit('visitor-1', t0 + 11).ok).toBe(false);
    expect(checkVisitorRateLimit('visitor-2', t0 + 11).ok).toBe(true);
  });
});

describe('checkVisitorRateLimit — window expiry', () => {
  it('allows new hits once the oldest age out of the window', () => {
    const t0 = 1_000;
    for (let i = 0; i < 10; i++) {
      checkVisitorRateLimit('visitor-1', t0 + i);
    }
    // Just inside the window — still rejected.
    expect(checkVisitorRateLimit('visitor-1', t0 + 9_999).ok).toBe(false);

    // Move past WINDOW_MS — the oldest 10 fall off, so a new attempt fits.
    expect(checkVisitorRateLimit('visitor-1', t0 + 10_001).ok).toBe(true);
  });

  it('partial expiry — drops only the hits that fell out of the window', () => {
    // 5 hits at t=0, then 5 hits at t=8000 → all 10 fit in the 10s window.
    const t0 = 0;
    for (let i = 0; i < 5; i++) checkVisitorRateLimit('visitor-1', t0 + i);
    for (let i = 0; i < 5; i++) checkVisitorRateLimit('visitor-1', t0 + 8_000 + i);

    // Now at t=11000, the 5 early hits have aged out → only 5 hits left.
    // Five more fit before the cap kicks in.
    for (let i = 0; i < 5; i++) {
      expect(checkVisitorRateLimit('visitor-1', t0 + 11_000 + i).ok).toBe(true);
    }
    // The 11th total fresh hit is rejected.
    expect(checkVisitorRateLimit('visitor-1', t0 + 11_000 + 5).ok).toBe(false);
  });
});

describe('checkVisitorRateLimit — retryAfter math', () => {
  it('retryAfter is the seconds-until the oldest in-window hit ages out', () => {
    // Place 10 hits at t=0..9 — window expires at t=10_000.
    for (let i = 0; i < 10; i++) {
      checkVisitorRateLimit('visitor-1', i);
    }
    // At t=5_000, oldest (t=0) ages out at t=10_000 → 5s wait.
    const r = checkVisitorRateLimit('visitor-1', 5_000);
    expect(r.ok).toBe(false);
    expect(r.retryAfter).toBe(5);
  });

  it('retryAfter is clamped to a minimum of 1 (no zero/negative waits)', () => {
    for (let i = 0; i < 10; i++) {
      checkVisitorRateLimit('visitor-1', i);
    }
    // Right at the edge — oldest ages out in ~0.0001s, but math.max(1, ...) clamps.
    const r = checkVisitorRateLimit('visitor-1', 9_999);
    expect(r.ok).toBe(false);
    expect(r.retryAfter).toBe(1);
  });

  it('retryAfter rounds up to the next whole second', () => {
    // 10 hits, then a probe 0.5s before the oldest ages out → retryAfter=1 (ceil(0.5))
    for (let i = 0; i < 10; i++) {
      checkVisitorRateLimit('visitor-1', i);
    }
    const r = checkVisitorRateLimit('visitor-1', 9_500);
    expect(r.ok).toBe(false);
    expect(r.retryAfter).toBe(1);
  });
});

describe('checkVisitorRateLimit — defaults + state isolation', () => {
  it('defaults `now` to Date.now() when not provided', () => {
    // Just smoke-check it doesn't throw and returns a sane result.
    const r = checkVisitorRateLimit('visitor-default-now');
    expect(r.ok).toBe(true);
  });

  it('__resetRateLimit clears all per-key state', () => {
    for (let i = 0; i < 10; i++) {
      checkVisitorRateLimit('visitor-1', i);
    }
    expect(checkVisitorRateLimit('visitor-1', 100).ok).toBe(false);
    __resetRateLimit();
    expect(checkVisitorRateLimit('visitor-1', 100).ok).toBe(true);
  });
});

describe('checkVisitorRateLimit — GC behavior when map grows', () => {
  it('GC pass after >5_000 keys drops fully-expired entries', () => {
    // Seed 5_001 unique keys at t=0 → triggers the GC branch on the 5_001st insert.
    // The GC walks the map and trims/expires entries against the cutoff.
    const t0 = 0;
    for (let i = 0; i < 5_001; i++) {
      checkVisitorRateLimit(`visitor-${i}`, t0);
    }
    // Now jump past the window — every existing entry has expired.
    // A fresh hit at t=11_000 should run the GC (size > 5_000) and clear stale buckets.
    const r = checkVisitorRateLimit('visitor-fresh', t0 + 11_000);
    expect(r.ok).toBe(true);

    // After GC, an old key starts fresh (its bucket was cleared).
    expect(checkVisitorRateLimit('visitor-0', t0 + 11_001).ok).toBe(true);
  });

  it('GC keeps still-in-window entries intact', () => {
    const t0 = 0;
    // Seed 5_001 keys at t=0 to trip the GC branch on a later insert.
    for (let i = 0; i < 5_001; i++) {
      checkVisitorRateLimit(`bg-${i}`, t0);
    }
    // Now at t=5_000 (mid-window), saturate one specific key to MAX_HITS (10).
    for (let i = 0; i < 10; i++) {
      checkVisitorRateLimit('hot-key', t0 + 5_000 + i);
    }
    // Trigger another insert that walks the GC (still > 5_000 entries).
    checkVisitorRateLimit('cold-fresh', t0 + 5_100);
    // GC's cutoff at t=5_100 is t=-4_900 — none of hot-key's hits are stale,
    // so the bucket stays saturated → next hit at t=5_200 is rejected.
    expect(checkVisitorRateLimit('hot-key', t0 + 5_200).ok).toBe(false);
  });
});
