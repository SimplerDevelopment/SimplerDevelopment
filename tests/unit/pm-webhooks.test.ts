// @vitest-environment node
/**
 * Unit tests for the pure parts of lib/pm-webhooks — HMAC signing and secret generation.
 * DB-coupled code paths (fireProjectEvent, deliver) are covered in integration-api.
 */
import { describe, it, expect, vi } from 'vitest';

// The module imports @/lib/db which throws without DATABASE_URL at module load.
// Stub it so we can import the pure exports in isolation.
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/db/schema', () => ({
  projectWebhooks: {},
  projectWebhookDeliveries: {},
}));
vi.mock('@/lib/ssrf-guard', () => ({ assertSafeUrl: vi.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { signPayload, generateWebhookSecret } = await import('@/lib/pm-webhooks');

describe('signPayload', () => {
  it('produces a 64-char lowercase hex string', () => {
    const sig = signPayload('secret', 'payload');
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it('matches a known RFC-4231-style HMAC-SHA256 vector', () => {
    // Test vector from RFC 4231 section 4.2: key = 20 × 0x0b, data = "Hi There"
    const key = Buffer.from('0b'.repeat(20), 'hex').toString('binary');
    const expected = 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7';
    expect(signPayload(key, 'Hi There')).toBe(expected);
  });

  it('is deterministic — same inputs produce the same signature', () => {
    const a = signPayload('secret', '{"event":"card.created","id":1}');
    const b = signPayload('secret', '{"event":"card.created","id":1}');
    expect(a).toBe(b);
  });

  it('is sensitive to body changes — flipping one character changes the signature', () => {
    const a = signPayload('secret', '{"id":1}');
    const b = signPayload('secret', '{"id":2}');
    expect(a).not.toBe(b);
  });

  it('is sensitive to secret changes — same body under a different key changes the signature', () => {
    const a = signPayload('secret-a', 'body');
    const b = signPayload('secret-b', 'body');
    expect(a).not.toBe(b);
  });

  it('produces distinct signatures for empty vs non-empty body', () => {
    const a = signPayload('k', '');
    const b = signPayload('k', ' ');
    expect(a).not.toBe(b);
  });

  it('handles unicode body bytes correctly (UTF-8 encoded)', () => {
    const a = signPayload('k', 'café');
    const b = signPayload('k', 'café'); // same
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('generateWebhookSecret', () => {
  it('returns a 64-char lowercase hex string (32 bytes)', () => {
    const s = generateWebhookSecret();
    expect(s).toMatch(/^[0-9a-f]{64}$/);
    expect(s.length).toBe(64);
  });

  it('produces unique values across calls (collision probability ≈ 0)', () => {
    const set = new Set<string>();
    for (let i = 0; i < 100; i++) set.add(generateWebhookSecret());
    expect(set.size).toBe(100);
  });

  it('distributes across the hex space — no trivially-constant prefix', () => {
    // Quick sanity check: across 20 samples, the first 4 chars should vary
    const prefixes = new Set<string>();
    for (let i = 0; i < 20; i++) prefixes.add(generateWebhookSecret().slice(0, 4));
    // Extremely unlikely to all be the same; 2+ distinct means it's sampling randomness
    expect(prefixes.size).toBeGreaterThanOrEqual(10);
  });
});
