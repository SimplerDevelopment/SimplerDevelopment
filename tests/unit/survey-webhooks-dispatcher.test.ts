// @vitest-environment node
/**
 * Unit tests for the pure parts of lib/survey-webhooks/dispatcher — HMAC
 * signing, secret generation, and retry-backoff schedule. DB-coupled paths
 * (dispatchSurveyResponseWebhooks) are integration territory.
 */
import { describe, it, expect, vi } from 'vitest';

// The module imports @/lib/db which throws without DATABASE_URL at module load.
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/db/schema', () => ({
  surveyWebhooks: {},
  surveyWebhookDeliveries: {},
  surveyResponses: {},
}));
vi.mock('@/lib/ssrf-guard', () => ({ assertSafeUrl: vi.fn() }));

const { signPayload, generateWebhookSecret, RETRY_BACKOFF_MS } = await import(
  '@/lib/survey-webhooks/dispatcher'
);

describe('signPayload', () => {
  it('produces a 64-char lowercase hex string', () => {
    expect(signPayload('secret', 'payload')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('matches a known RFC-4231-style HMAC-SHA256 vector', () => {
    // RFC 4231 §4.2: key = 20 × 0x0b, data = "Hi There"
    const key = Buffer.from('0b'.repeat(20), 'hex').toString('binary');
    const expected = 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7';
    expect(signPayload(key, 'Hi There')).toBe(expected);
  });

  it('is sensitive to body changes', () => {
    expect(signPayload('s', '{"a":1}')).not.toBe(signPayload('s', '{"a":2}'));
  });

  it('is sensitive to secret changes', () => {
    expect(signPayload('a', 'body')).not.toBe(signPayload('b', 'body'));
  });
});

describe('generateWebhookSecret', () => {
  it('returns 64 hex chars', () => {
    expect(generateWebhookSecret()).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces unique values across calls', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 64; i++) seen.add(generateWebhookSecret());
    expect(seen.size).toBe(64);
  });
});

describe('retry policy', () => {
  it('schedules 3 attempts with linear-ish backoff (1s, 4s, 16s)', () => {
    expect(RETRY_BACKOFF_MS).toEqual([1_000, 4_000, 16_000]);
    expect(RETRY_BACKOFF_MS.length).toBe(3);
  });

  it('backoff steps are strictly increasing', () => {
    for (let i = 1; i < RETRY_BACKOFF_MS.length; i++) {
      expect(RETRY_BACKOFF_MS[i]).toBeGreaterThan(RETRY_BACKOFF_MS[i - 1]);
    }
  });
});
