import { describe, it, expect } from 'vitest';
import {
  CLIENT_SECRET_PREFIX,
  generateClientSecret,
  parseBasicAuthHeader,
  verifyClientSecret,
} from '@/lib/oauth/server';

describe('generateClientSecret', () => {
  it('returns a prefixed secret, its sha256 hash, and a UI preview', () => {
    const { secret, hash, preview } = generateClientSecret();
    expect(secret.startsWith(CLIENT_SECRET_PREFIX)).toBe(true);
    expect(secret.length).toBeGreaterThan(CLIENT_SECRET_PREFIX.length + 32);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(preview.startsWith(secret.slice(0, 12))).toBe(true);
    expect(preview.endsWith(secret.slice(-4))).toBe(true);
    expect(preview.includes('…')).toBe(true);
    // Preview must never expose enough of the secret to be useful.
    expect(preview.length).toBeLessThan(secret.length / 2);
  });

  it('mints distinct secrets across calls', () => {
    const a = generateClientSecret();
    const b = generateClientSecret();
    expect(a.secret).not.toBe(b.secret);
    expect(a.hash).not.toBe(b.hash);
  });
});

describe('verifyClientSecret', () => {
  it('accepts a matching secret', () => {
    const { secret, hash } = generateClientSecret();
    expect(verifyClientSecret(secret, hash)).toBe(true);
  });

  it('rejects a mismatched secret', () => {
    const { hash } = generateClientSecret();
    expect(verifyClientSecret('sd_cs_not_the_right_one', hash)).toBe(false);
  });

  it('rejects when the stored hash is malformed', () => {
    const { secret } = generateClientSecret();
    expect(verifyClientSecret(secret, 'not-hex')).toBe(false);
    expect(verifyClientSecret(secret, '')).toBe(false);
  });

  it('rejects when the stored hash is the wrong length but still hex', () => {
    const { secret } = generateClientSecret();
    expect(verifyClientSecret(secret, 'deadbeef')).toBe(false);
  });
});

describe('parseBasicAuthHeader', () => {
  function basic(id: string, secret: string): string {
    return `Basic ${Buffer.from(`${encodeURIComponent(id)}:${encodeURIComponent(secret)}`).toString('base64')}`;
  }

  it('returns null for missing or non-Basic headers', () => {
    expect(parseBasicAuthHeader(null)).toBeNull();
    expect(parseBasicAuthHeader('')).toBeNull();
    expect(parseBasicAuthHeader('Bearer abc')).toBeNull();
  });

  it('parses a simple client_id and client_secret pair', () => {
    const parsed = parseBasicAuthHeader(basic('oc_abc', 'sd_cs_xyz'));
    expect(parsed).toEqual({ clientId: 'oc_abc', clientSecret: 'sd_cs_xyz' });
  });

  it('preserves a colon embedded inside the secret', () => {
    // RFC 6749 §2.3.1 — both values are URI-encoded, so ":" inside the secret
    // becomes "%3A" and the first literal ":" still separates id from secret.
    const parsed = parseBasicAuthHeader(basic('oc_abc', 'has:colon'));
    expect(parsed).toEqual({ clientId: 'oc_abc', clientSecret: 'has:colon' });
  });

  it('returns null when the decoded payload is malformed', () => {
    const bad = `Basic ${Buffer.from('no-colon-here').toString('base64')}`;
    expect(parseBasicAuthHeader(bad)).toBeNull();
  });

  it('returns null when the base64 itself is malformed', () => {
    expect(parseBasicAuthHeader('Basic !!!not base64!!!')).toBeNull();
  });
});
