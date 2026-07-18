import { describe, it, expect } from 'vitest';
import { hash } from 'bcryptjs';
import {
  validatePasswordStrength,
  isPasswordReused,
  nextPasswordHistory,
  PASSWORD_HISTORY_LIMIT,
} from '@/lib/security/password-policy';

describe('validatePasswordStrength (AUTH79-003)', () => {
  it('accepts a strong password', () => {
    expect(validatePasswordStrength('Tr0ub4dour-x9')).toBeNull();
  });

  it('accepts a long all-lowercase passphrase on length alone', () => {
    expect(validatePasswordStrength('correcthorsebatterystaple')).toBeNull();
  });

  it('rejects a short password', () => {
    expect(validatePasswordStrength('ab3$X')).toMatch(/at least/i);
  });

  it('rejects the literal "password" the QA caught', () => {
    expect(validatePasswordStrength('password')).toMatch(/too common/i);
    // case-insensitive
    expect(validatePasswordStrength('PASSWORD')).toMatch(/too common/i);
  });

  it('rejects other top-corpus passwords', () => {
    for (const p of ['12345678', 'qwerty123', 'welcome1', 'iloveyou']) {
      expect(validatePasswordStrength(p)).not.toBeNull();
    }
  });

  it('rejects a single repeated character', () => {
    expect(validatePasswordStrength('zzzzzzzz')).toMatch(/repeating/i);
  });

  it('rejects a short single-character-class password', () => {
    expect(validatePasswordStrength('abcdefgh')).toMatch(/mix of/i);
  });

  it('rejects a password containing the account email local-part', () => {
    expect(validatePasswordStrength('jsmith2024', { email: 'jsmith@acme.com' })).toMatch(/email/i);
  });

  it('rejects a password containing the account name', () => {
    expect(validatePasswordStrength('Jonathan99', { name: 'Jonathan' })).toMatch(/name/i);
  });

  it('rejects a too-long password', () => {
    expect(validatePasswordStrength('a'.repeat(300))).toMatch(/or fewer/i);
  });
});

describe('isPasswordReused (AUTH79-002)', () => {
  it('detects reuse of the current password', async () => {
    const h = await hash('S3cure-Current!', 10);
    expect(await isPasswordReused('S3cure-Current!', [h])).toBe(true);
  });

  it('detects reuse of an older password in history', async () => {
    const current = await hash('CurrentOne-99', 10);
    const old = await hash('OldOne-88', 10);
    expect(await isPasswordReused('OldOne-88', [current, old])).toBe(true);
  });

  it('allows a genuinely new password', async () => {
    const current = await hash('CurrentOne-99', 10);
    expect(await isPasswordReused('BrandNew-77', [current])).toBe(false);
  });

  it('ignores null/empty history entries', async () => {
    expect(await isPasswordReused('Anything-1', [null, undefined, ''])).toBe(false);
  });
});

describe('nextPasswordHistory', () => {
  it('prepends the previous hash', () => {
    expect(nextPasswordHistory('h_new', ['h_old'])).toEqual(['h_new', 'h_old']);
  });

  it('caps at PASSWORD_HISTORY_LIMIT', () => {
    const existing = Array.from({ length: PASSWORD_HISTORY_LIMIT + 3 }, (_, i) => `h${i}`);
    const result = nextPasswordHistory('h_new', existing);
    expect(result).toHaveLength(PASSWORD_HISTORY_LIMIT);
    expect(result[0]).toBe('h_new');
  });

  it('handles null existing history', () => {
    expect(nextPasswordHistory('h_new', null)).toEqual(['h_new']);
  });
});
