import { describe, it, expect, beforeEach } from 'vitest';
import { issueVisitorToken, verifyVisitorToken } from '@/lib/chat/token';

describe('chat visitor token', () => {
  beforeEach(() => {
    process.env.CHAT_TOKEN_SECRET = 'unit-test-secret-1234';
  });

  it('round-trips a valid token', () => {
    const token = issueVisitorToken(42);
    const verified = verifyVisitorToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.conversationId).toBe(42);
    expect(verified?.expiresAt).toBeGreaterThan(Date.now());
  });

  it('rejects null / empty / malformed tokens', () => {
    expect(verifyVisitorToken(null)).toBeNull();
    expect(verifyVisitorToken(undefined)).toBeNull();
    expect(verifyVisitorToken('')).toBeNull();
    expect(verifyVisitorToken('not.a.token')).toBeNull();
    expect(verifyVisitorToken('1.2')).toBeNull(); // missing sig
    expect(verifyVisitorToken('1.2.3.4')).toBeNull(); // extra parts
  });

  it('rejects a tampered conversation id', () => {
    const token = issueVisitorToken(42);
    const [, exp, sig] = token.split('.');
    const tampered = `99.${exp}.${sig}`;
    expect(verifyVisitorToken(tampered)).toBeNull();
  });

  it('rejects a tampered signature', () => {
    const token = issueVisitorToken(42);
    const [conv, exp] = token.split('.');
    const tampered = `${conv}.${exp}.${'0'.repeat(64)}`;
    expect(verifyVisitorToken(tampered)).toBeNull();
  });

  it('rejects a token signed with a different secret', () => {
    process.env.CHAT_TOKEN_SECRET = 'secret-A';
    const token = issueVisitorToken(7);
    process.env.CHAT_TOKEN_SECRET = 'secret-B';
    expect(verifyVisitorToken(token)).toBeNull();
  });

  it('rejects an expired token', () => {
    const token = issueVisitorToken(7, -1_000); // already expired
    expect(verifyVisitorToken(token)).toBeNull();
  });

  it('rejects a non-positive conversation id', () => {
    // Construct a "token" claiming conversation 0 with a valid sig for the
    // same payload — verifyVisitorToken must reject on the id check.
    const fake = issueVisitorToken(1);
    const [, exp, sig] = fake.split('.');
    expect(verifyVisitorToken(`0.${exp}.${sig}`)).toBeNull();
    expect(verifyVisitorToken(`-5.${exp}.${sig}`)).toBeNull();
  });
});
