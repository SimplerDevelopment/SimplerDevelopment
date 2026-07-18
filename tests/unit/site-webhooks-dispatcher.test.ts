// @vitest-environment node
/**
 * Unit tests for the pure parts of lib/site-webhooks/dispatcher — HMAC signing,
 * secret generation, and the retry-backoff schedule. The DB-coupled path
 * (dispatchSiteWebhooksForEvent) is integration territory and is exercised by
 * the live-fire e2e in gap-site-webhooks-coverage.spec.ts.
 */
import { describe, it, expect } from 'vitest';
import { vi } from 'vitest';

// The module imports @/lib/db which throws without DATABASE_URL at module load.
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/db/schema', () => ({ siteWebhooks: {}, siteWebhookDeliveries: {} }));
vi.mock('@/lib/ssrf-guard', () => ({ assertSafeUrl: vi.fn() }));

const { signPayload, generateWebhookSecret, RETRY_BACKOFF_MS } = await import(
  '@/lib/site-webhooks/dispatcher'
);

describe('signPayload', () => {
  it('produces a 64-char lowercase hex string', () => {
    expect(signPayload('secret', 'payload')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('matches a known RFC-4231-style HMAC-SHA256 vector', () => {
    const key = Buffer.from('0b'.repeat(20), 'hex').toString('binary');
    const expected = 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7';
    expect(signPayload(key, 'Hi There')).toBe(expected);
  });

  it('is sensitive to body + secret changes', () => {
    expect(signPayload('s', '{"a":1}')).not.toBe(signPayload('s', '{"a":2}'));
    expect(signPayload('a', 'body')).not.toBe(signPayload('b', 'body'));
  });
});

describe('generateWebhookSecret', () => {
  it('returns a 64-char hex secret', () => {
    expect(generateWebhookSecret()).toMatch(/^[0-9a-f]{64}$/);
  });
  it('returns a different value each call', () => {
    expect(generateWebhookSecret()).not.toBe(generateWebhookSecret());
  });
});

describe('RETRY_BACKOFF_MS', () => {
  it('is the documented 1s/4s/16s linear-ish schedule', () => {
    expect([...RETRY_BACKOFF_MS]).toEqual([1_000, 4_000, 16_000]);
  });
});
