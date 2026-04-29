import { describe, it, expect, beforeEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import { encryptSecret, decryptSecret } from '@/lib/crypto/secrets';

const TEST_KEY = randomBytes(32).toString('hex');

beforeEach(() => {
  process.env.WORKSPACE_TENANT_SECRETS_KEY = TEST_KEY;
});

describe('encryptSecret / decryptSecret', () => {
  it('round-trips a typical OAuth client secret', () => {
    const plaintext = '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';
    const encrypted = encryptSecret(plaintext);
    expect(encrypted).not.toBe(plaintext);
    const decrypted = decryptSecret(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('round-trips empty string', () => {
    const encrypted = encryptSecret('');
    expect(decryptSecret(encrypted)).toBe('');
  });

  it('round-trips utf-8 content', () => {
    const plaintext = '日本語 + emoji 🔐 + ascii';
    expect(decryptSecret(encryptSecret(plaintext))).toBe(plaintext);
  });

  it('produces different ciphertexts on each call (random IV)', () => {
    const plaintext = 'identical-input';
    const a = encryptSecret(plaintext);
    const b = encryptSecret(plaintext);
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe(plaintext);
    expect(decryptSecret(b)).toBe(plaintext);
  });

  it('produces base64 output that decodes to >= 28 bytes (iv 12 + tag 16)', () => {
    const blob = encryptSecret('x');
    const decoded = Buffer.from(blob, 'base64');
    expect(decoded.length).toBeGreaterThanOrEqual(12 + 16);
  });

  it('decrypt fails when the auth tag is tampered', () => {
    const plaintext = 'sensitive';
    const encrypted = encryptSecret(plaintext);
    const buf = Buffer.from(encrypted, 'base64');
    // Flip a bit in the tag (bytes 12..28).
    buf[15] ^= 0x01;
    const tampered = buf.toString('base64');
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it('decrypt fails when ciphertext is tampered', () => {
    const encrypted = encryptSecret('sensitive');
    const buf = Buffer.from(encrypted, 'base64');
    // Flip a bit in ciphertext (anything past byte 28).
    if (buf.length > 28) buf[28] ^= 0x01;
    const tampered = buf.toString('base64');
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it('decrypt fails when wrong key is used', () => {
    const encrypted = encryptSecret('sensitive');
    process.env.WORKSPACE_TENANT_SECRETS_KEY = randomBytes(32).toString('hex');
    expect(() => decryptSecret(encrypted)).toThrow();
  });

  it('throws when env key is missing', () => {
    delete process.env.WORKSPACE_TENANT_SECRETS_KEY;
    expect(() => encryptSecret('x')).toThrow(/not set/);
  });

  it('throws when env key is not hex-encoded', () => {
    process.env.WORKSPACE_TENANT_SECRETS_KEY = 'z'.repeat(64);
    expect(() => encryptSecret('x')).toThrow(/hex/);
  });

  it('throws when env key is the wrong length', () => {
    process.env.WORKSPACE_TENANT_SECRETS_KEY = 'aa';
    expect(() => encryptSecret('x')).toThrow(/64 hex chars/);
  });

  it('throws on a too-short blob', () => {
    expect(() => decryptSecret('YWJj')).toThrow(/too short/);
  });
});
