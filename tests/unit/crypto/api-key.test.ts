import { describe, it, expect, beforeEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import { encryptApiKey, decryptApiKey, maskApiKey } from '@/lib/crypto/api-key';

const TEST_KEY = randomBytes(32).toString('hex');

beforeEach(() => {
  process.env.ENCRYPTION_KEY = TEST_KEY;
});

describe('encryptApiKey / decryptApiKey', () => {
  it('round-trips an Anthropic-shaped key', () => {
    const plaintext = 'sk-ant-api03-' + 'A'.repeat(86) + 'AA';
    const encrypted = encryptApiKey(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(decryptApiKey(encrypted)).toBe(plaintext);
  });

  it('round-trips an OpenAI-shaped key', () => {
    const plaintext = 'sk-proj-' + 'B'.repeat(48);
    const encrypted = encryptApiKey(plaintext);
    expect(decryptApiKey(encrypted)).toBe(plaintext);
  });

  it('round-trips empty string', () => {
    const encrypted = encryptApiKey('');
    expect(decryptApiKey(encrypted)).toBe('');
  });

  it('produces different ciphertexts on each call (random IV)', () => {
    const plaintext = 'sk-identical';
    const a = encryptApiKey(plaintext);
    const b = encryptApiKey(plaintext);
    expect(a).not.toBe(b);
    expect(decryptApiKey(a)).toBe(plaintext);
    expect(decryptApiKey(b)).toBe(plaintext);
  });

  it('produces base64 output that decodes to >= 28 bytes (iv 12 + tag 16)', () => {
    const blob = encryptApiKey('x');
    const decoded = Buffer.from(blob, 'base64');
    expect(decoded.length).toBeGreaterThanOrEqual(12 + 16);
  });

  it('decrypt fails when the auth tag is tampered', () => {
    const encrypted = encryptApiKey('sensitive');
    const buf = Buffer.from(encrypted, 'base64');
    buf[15] ^= 0x01;
    expect(() => decryptApiKey(buf.toString('base64'))).toThrow();
  });

  it('decrypt fails when ciphertext is tampered', () => {
    const encrypted = encryptApiKey('sensitive-and-long-enough');
    const buf = Buffer.from(encrypted, 'base64');
    if (buf.length > 28) buf[28] ^= 0x01;
    expect(() => decryptApiKey(buf.toString('base64'))).toThrow();
  });

  it('decrypt fails when wrong key is used', () => {
    const encrypted = encryptApiKey('sensitive');
    process.env.ENCRYPTION_KEY = randomBytes(32).toString('hex');
    expect(() => decryptApiKey(encrypted)).toThrow();
  });

  it('throws when env key is missing', () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => encryptApiKey('x')).toThrow(/not set/);
  });

  it('throws when env key is not hex-encoded', () => {
    process.env.ENCRYPTION_KEY = 'z'.repeat(64);
    expect(() => encryptApiKey('x')).toThrow(/hex/);
  });

  it('throws when env key is the wrong length', () => {
    process.env.ENCRYPTION_KEY = 'aa';
    expect(() => encryptApiKey('x')).toThrow(/64 hex chars/);
  });

  it('throws on a too-short blob', () => {
    expect(() => decryptApiKey('YWJj')).toThrow(/too short/);
  });

  it('does not collide with the lib/crypto/secrets envelope (different env var)', () => {
    // Setting WORKSPACE_TENANT_SECRETS_KEY should not affect this module.
    process.env.WORKSPACE_TENANT_SECRETS_KEY = randomBytes(32).toString('hex');
    const plaintext = 'sk-ant-test';
    expect(decryptApiKey(encryptApiKey(plaintext))).toBe(plaintext);
  });
});

describe('maskApiKey', () => {
  it('masks a stored key, showing prefix and last-4', () => {
    const plaintext = 'sk-ant-api03-ABCDEFGHIJKLMNOP';
    const blob = encryptApiKey(plaintext);
    const masked = maskApiKey(blob);
    expect(masked).toContain('sk-ant');
    expect(masked).toContain('MNOP');
    expect(masked).not.toBe(plaintext);
    expect(masked).toContain('…');
  });

  it('returns bullets for short plaintext', () => {
    const blob = encryptApiKey('abc');
    expect(maskApiKey(blob)).toBe('•••');
  });

  it('returns sentinel for unparseable blob', () => {
    expect(maskApiKey('not-a-real-blob-zzzz')).toBe('••••');
  });
});
