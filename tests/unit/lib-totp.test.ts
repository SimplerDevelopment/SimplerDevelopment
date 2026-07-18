// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { generateTOTP, verifyTOTP, generateTOTPSecret, getTOTPUri } from '@/lib/totp';

// RFC 6238 Appendix B seed "12345678901234567890" (ASCII) in base32 — the
// canonical interop vector. If these pass, real authenticator apps agree.
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('generateTOTP — RFC 6238 interop vectors', () => {
  it('matches the published 6-digit code at T=59s (counter 1)', () => {
    // RFC 8-digit value 94287082 → 6-digit truncation 287082.
    expect(generateTOTP(RFC_SECRET, 0, 59_000)).toBe('287082');
  });

  it('matches the published code at T=1111111109s', () => {
    // RFC 8-digit 07081804 → 6-digit 081804.
    expect(generateTOTP(RFC_SECRET, 0, 1_111_111_109_000)).toBe('081804');
  });
});

describe('verifyTOTP', () => {
  const secret = generateTOTPSecret();
  const at = 1_700_000_000_000;

  it('accepts the current code', () => {
    expect(verifyTOTP(secret, generateTOTP(secret, 0, at), 1, at)).toBe(true);
  });

  it('accepts a code from the adjacent step (clock skew within ±1)', () => {
    expect(verifyTOTP(secret, generateTOTP(secret, -1, at), 1, at)).toBe(true);
    expect(verifyTOTP(secret, generateTOTP(secret, 1, at), 1, at)).toBe(true);
  });

  it('rejects a code two steps away (outside the drift window)', () => {
    expect(verifyTOTP(secret, generateTOTP(secret, 2, at), 1, at)).toBe(false);
  });

  it('rejects a wrong code', () => {
    const right = generateTOTP(secret, 0, at);
    const wrong = right === '000000' ? '111111' : '000000';
    expect(verifyTOTP(secret, wrong, 1, at)).toBe(false);
  });

  it('rejects malformed input (non-6-digit) without throwing', () => {
    expect(verifyTOTP(secret, '', 1, at)).toBe(false);
    expect(verifyTOTP(secret, '12345', 1, at)).toBe(false);
    expect(verifyTOTP(secret, 'abcdef', 1, at)).toBe(false);
    expect(verifyTOTP(secret, '1234567', 1, at)).toBe(false);
  });
});

describe('generateTOTPSecret / getTOTPUri', () => {
  it('generates a 32-char base32 secret (160 bits)', () => {
    const s = generateTOTPSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
  });

  it('two secrets differ', () => {
    expect(generateTOTPSecret()).not.toBe(generateTOTPSecret());
  });

  it('builds a scannable otpauth:// URI', () => {
    const uri = getTOTPUri('GEZDGNBVGY3TQOJQ', 'user@example.com');
    expect(uri).toContain('otpauth://totp/');
    expect(uri).toContain('secret=GEZDGNBVGY3TQOJQ');
    expect(uri).toContain('issuer=SimplerDevelopment');
    expect(uri).toContain('algorithm=SHA1');
  });
});
