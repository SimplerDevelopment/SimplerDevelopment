// Unit tests for lib/plugins/kms — AES-256-GCM round-trip + tamper detection.
//
// We use a freshly-generated random key (base64) per spec run, set via
// PORTAL_KMS_KEY in beforeEach so test ordering can't leak state. The dev
// fallback path (no env var, NODE_ENV !== 'production') is exercised by the
// "uses dev fallback when env is missing in non-prod" case.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { encryptSecret, decryptSecret } from '@/lib/plugins/kms';

function setRandomKey(): string {
  const key = randomBytes(32).toString('base64');
  process.env.PORTAL_KMS_KEY = key;
  return key;
}

describe('lib/plugins/kms — encryptSecret / decryptSecret', () => {
  beforeEach(() => {
    setRandomKey();
  });

  afterEach(() => {
    delete process.env.PORTAL_KMS_KEY;
  });

  it('round-trips a typical signing secret', () => {
    const plaintext = 'sk-portal-' + randomBytes(24).toString('hex');
    const encrypted = encryptSecret(plaintext);
    expect(encrypted).not.toBe(plaintext);
    // Format: three colon-delimited base64 segments.
    expect(encrypted.split(':')).toHaveLength(3);
    expect(decryptSecret(encrypted)).toBe(plaintext);
  });

  it('produces different ciphertexts for the same input (random IV)', () => {
    const a = encryptSecret('identical');
    const b = encryptSecret('identical');
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe('identical');
    expect(decryptSecret(b)).toBe('identical');
  });

  it('round-trips utf-8 content (multibyte chars)', () => {
    const plaintext = '日本語-emoji-content';
    expect(decryptSecret(encryptSecret(plaintext))).toBe(plaintext);
  });

  it('round-trips empty string', () => {
    expect(decryptSecret(encryptSecret(''))).toBe('');
  });

  it('fails to decrypt when the wrong key is used', () => {
    const encrypted = encryptSecret('top-secret');
    // Rotate to a different key — auth tag check must fail.
    setRandomKey();
    expect(() => decryptSecret(encrypted)).toThrow();
  });

  it('fails to decrypt when the auth tag is tampered', () => {
    const encrypted = encryptSecret('top-secret');
    const parts = encrypted.split(':');
    // Flip a bit in the tag segment.
    const tagBuf = Buffer.from(parts[2], 'base64');
    tagBuf[0] ^= 0x01;
    parts[2] = tagBuf.toString('base64');
    expect(() => decryptSecret(parts.join(':'))).toThrow();
  });

  it('fails to decrypt when the ciphertext is tampered', () => {
    const encrypted = encryptSecret('top-secret-payload-of-known-length');
    const parts = encrypted.split(':');
    const ctBuf = Buffer.from(parts[1], 'base64');
    expect(ctBuf.length).toBeGreaterThan(0);
    ctBuf[0] ^= 0x01;
    parts[1] = ctBuf.toString('base64');
    expect(() => decryptSecret(parts.join(':'))).toThrow();
  });

  it('fails to decrypt when the IV is tampered', () => {
    const encrypted = encryptSecret('top-secret');
    const parts = encrypted.split(':');
    const ivBuf = Buffer.from(parts[0], 'base64');
    ivBuf[0] ^= 0x01;
    parts[0] = ivBuf.toString('base64');
    expect(() => decryptSecret(parts.join(':'))).toThrow();
  });

  it('rejects a blob with the wrong number of segments', () => {
    expect(() => decryptSecret('only-one-segment')).toThrow(
      /expected <iv>:<ciphertext>:<tag>/,
    );
    expect(() => decryptSecret('a:b')).toThrow();
    expect(() => decryptSecret('a:b:c:d')).toThrow();
  });

  it('rejects a blob whose iv is not 12 bytes', () => {
    const encrypted = encryptSecret('x');
    const parts = encrypted.split(':');
    parts[0] = Buffer.from([1, 2, 3]).toString('base64');
    expect(() => decryptSecret(parts.join(':'))).toThrow(/iv must be 12 bytes/);
  });

  it('rejects a blob whose tag is not 16 bytes', () => {
    const encrypted = encryptSecret('x');
    const parts = encrypted.split(':');
    parts[2] = Buffer.from([1, 2, 3]).toString('base64');
    expect(() => decryptSecret(parts.join(':'))).toThrow(
      /auth tag must be 16 bytes/,
    );
  });

  it('rejects when PORTAL_KMS_KEY decodes to a non-32-byte length', () => {
    process.env.PORTAL_KMS_KEY = Buffer.from([1, 2, 3]).toString('base64');
    expect(() => encryptSecret('x')).toThrow(/32 bytes/);
  });

  describe('dev fallback', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    beforeEach(() => {
      delete process.env.PORTAL_KMS_KEY;
      // The dev fallback only kicks in when NODE_ENV !== 'production'.
      process.env.NODE_ENV = 'test';
    });
    afterEach(() => {
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalNodeEnv;
    });

    it('falls back to a fixed dev key when PORTAL_KMS_KEY is missing (with warning)', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        // Encryption should succeed.
        const encrypted = encryptSecret('dev-payload');
        // Round-trip with same fallback key.
        expect(decryptSecret(encrypted)).toBe('dev-payload');
      } finally {
        warn.mockRestore();
      }
    });

    it('hard-fails in production when PORTAL_KMS_KEY is missing', () => {
      process.env.NODE_ENV = 'production';
      expect(() => encryptSecret('x')).toThrow(/required in production/);
    });
  });
});
