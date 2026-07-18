// @vitest-environment node
/**
 * Unit tests for lib/voice/confirm-token.ts — the signed confirmation tokens
 * that gate mutating voice actions. Pure crypto, no DB/request, so unit-layer.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { signConfirmToken, verifyConfirmToken } from '@/lib/voice/confirm-token';

const BASE = { tool: 'create_contact', userId: 7, clientId: 100 };

beforeEach(() => {
  process.env.AUTH_SECRET = 'test-secret-for-voice-confirm-tokens';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('voice confirm-token', () => {
  it('round-trips a valid token for the exact call', () => {
    const args = { firstName: 'Jane', lastName: 'Doe' };
    const token = signConfirmToken({ ...BASE, args });
    expect(verifyConfirmToken(token, { ...BASE, args })).toBe(true);
  });

  it('is insensitive to argument key order (canonicalized)', () => {
    const token = signConfirmToken({ ...BASE, args: { firstName: 'Jane', email: 'j@x.co' } });
    // Same args, different key order on verify.
    expect(verifyConfirmToken(token, { ...BASE, args: { email: 'j@x.co', firstName: 'Jane' } })).toBe(
      true,
    );
  });

  it('rejects when the args differ (tamper between confirm and execute)', () => {
    const token = signConfirmToken({ ...BASE, args: { firstName: 'Jane' } });
    expect(verifyConfirmToken(token, { ...BASE, args: { firstName: 'Mallory' } })).toBe(false);
  });

  it('rejects when clientId differs (cross-tenant replay)', () => {
    const args = { firstName: 'Jane' };
    const token = signConfirmToken({ ...BASE, args });
    expect(verifyConfirmToken(token, { ...BASE, clientId: 999, args })).toBe(false);
  });

  it('rejects when userId differs', () => {
    const args = { firstName: 'Jane' };
    const token = signConfirmToken({ ...BASE, args });
    expect(verifyConfirmToken(token, { ...BASE, userId: 8, args })).toBe(false);
  });

  it('rejects when the tool differs', () => {
    const args = { title: 'x' };
    const token = signConfirmToken({ ...BASE, tool: 'create_task', args });
    expect(verifyConfirmToken(token, { ...BASE, tool: 'create_contact', args })).toBe(false);
  });

  it('rejects a tampered MAC', () => {
    const args = { firstName: 'Jane' };
    const token = signConfirmToken({ ...BASE, args });
    const tampered = token.slice(0, -2) + (token.endsWith('aa') ? 'bb' : 'aa');
    expect(verifyConfirmToken(tampered, { ...BASE, args })).toBe(false);
  });

  it('rejects malformed tokens', () => {
    expect(verifyConfirmToken('', { ...BASE, args: {} })).toBe(false);
    expect(verifyConfirmToken('a.b', { ...BASE, args: {} })).toBe(false);
    expect(verifyConfirmToken('a.b.c.d', { ...BASE, args: {} })).toBe(false);
  });

  it('rejects an expired token', () => {
    const args = { firstName: 'Jane' };
    const token = signConfirmToken({ ...BASE, args });
    // Jump 6 minutes ahead (TTL is 5 min).
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 6 * 60 * 1000);
    expect(verifyConfirmToken(token, { ...BASE, args })).toBe(false);
  });

  it('throws when no signing secret is configured', () => {
    delete process.env.AUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;
    expect(() => signConfirmToken({ ...BASE, args: {} })).toThrow(/AUTH_SECRET/);
  });
});
