import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { signState, verifyState, StateInvalidError } from '@/lib/google/oauth-state';

const PREV_SECRET = process.env.OAUTH_STATE_SECRET;

beforeEach(() => {
  process.env.OAUTH_STATE_SECRET = 'a'.repeat(64); // 64-char hex-ish placeholder, valid length
  vi.useRealTimers();
});

afterEach(() => {
  process.env.OAUTH_STATE_SECRET = PREV_SECRET;
});

describe('signState / verifyState', () => {
  it('round-trips a typical payload', () => {
    const state = signState({ clientId: 42, userId: 7, surfaces: ['gmail', 'calendar'] });
    const payload = verifyState(state);
    expect(payload.clientId).toBe(42);
    expect(payload.userId).toBe(7);
    expect(payload.surfaces).toEqual(['gmail', 'calendar']);
    expect(typeof payload.nonce).toBe('string');
    expect(payload.nonce.length).toBeGreaterThan(0);
    expect(payload.expiresAt).toBeGreaterThan(Date.now());
  });

  it('preserves returnTo when provided', () => {
    const state = signState({
      clientId: 1, userId: 1, surfaces: ['identity'], returnTo: '/portal/integrations/google',
    });
    expect(verifyState(state).returnTo).toBe('/portal/integrations/google');
  });

  it('omits returnTo when not provided', () => {
    const state = signState({ clientId: 1, userId: 1, surfaces: ['identity'] });
    expect(verifyState(state).returnTo).toBeUndefined();
  });

  it('produces different states for identical inputs (random nonce)', () => {
    const opts = { clientId: 1, userId: 1, surfaces: ['identity'] as const };
    const a = signState(opts);
    const b = signState(opts);
    expect(a).not.toBe(b);
    expect(verifyState(a).clientId).toBe(1);
    expect(verifyState(b).clientId).toBe(1);
  });

  it('rejects malformed state (no dot separator)', () => {
    expect(() => verifyState('garbage')).toThrowError(StateInvalidError);
    try {
      verifyState('garbage');
    } catch (e) {
      expect((e as StateInvalidError).reason).toBe('malformed');
    }
  });

  it('rejects state signed with a different secret', () => {
    const state = signState({ clientId: 1, userId: 1, surfaces: ['identity'] });
    process.env.OAUTH_STATE_SECRET = 'b'.repeat(64);
    try {
      verifyState(state);
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as StateInvalidError).reason).toBe('bad_signature');
    }
  });

  it('rejects state with a tampered payload', () => {
    const state = signState({ clientId: 1, userId: 1, surfaces: ['identity'] });
    const [, sig] = state.split('.');
    // Re-encode a forged payload claiming clientId=999, keep the original signature.
    const forgedPayload = Buffer.from(JSON.stringify({
      clientId: 999, userId: 1, surfaces: ['identity'],
      nonce: 'xx', expiresAt: Date.now() + 60_000,
    })).toString('base64url');
    const tampered = `${forgedPayload}.${sig}`;
    try {
      verifyState(tampered);
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as StateInvalidError).reason).toBe('bad_signature');
    }
  });

  it('rejects expired state', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const state = signState({ clientId: 1, userId: 1, surfaces: ['identity'] });
    // jump 11 minutes (TTL is 10 min)
    vi.setSystemTime(new Date('2026-01-01T00:11:00Z'));
    try {
      verifyState(state);
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as StateInvalidError).reason).toBe('expired');
    }
  });

  it('rejects non-JSON payload even with valid signature shape', () => {
    // Build a state with a payload that's NOT valid JSON, but signed properly.
    // We do this by signing a custom payload via the same secret.
    const { createHmac } = require('node:crypto');
    const badPayload = Buffer.from('not-json-just-text').toString('base64url');
    const sig = createHmac('sha256', Buffer.from(process.env.OAUTH_STATE_SECRET as string, 'utf8'))
      .update(badPayload).digest().toString('base64url');
    const state = `${badPayload}.${sig}`;
    try {
      verifyState(state);
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as StateInvalidError).reason).toBe('malformed');
    }
  });

  it('throws when OAUTH_STATE_SECRET is not set', () => {
    delete process.env.OAUTH_STATE_SECRET;
    expect(() => signState({ clientId: 1, userId: 1, surfaces: ['identity'] }))
      .toThrow(/OAUTH_STATE_SECRET/);
  });
});
