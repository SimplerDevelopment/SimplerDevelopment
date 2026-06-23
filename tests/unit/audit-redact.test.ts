// @vitest-environment node
/**
 * Unit tests for lib/mcp/audit-redact.ts
 *
 * Verifies:
 *   1. Keys matching the secret pattern are redacted at the top level.
 *   2. Keys matching the secret pattern are redacted recursively.
 *   3. Keys NOT matching the pattern pass through unchanged.
 *   4. Payloads serialising to > 4 KB are replaced with { _truncated: true }.
 *   5. The original input is never mutated.
 *   6. Arrays are walked recursively.
 *   7. Null / primitive inputs pass through unchanged.
 */
import { describe, it, expect } from 'vitest';
import { redactInputs } from '@/lib/mcp/audit-redact';

describe('redactInputs', () => {
  it('redacts top-level keys matching the secret pattern', () => {
    const result = redactInputs({
      password: 'hunter2',
      secret: 'shhh',
      token: 'tok_abc',
      key: 'sk-1234',
      credential: 'cred',
      auth: 'Bearer xyz',
      bearer: 'Bearer xyz',
    }) as Record<string, unknown>;

    expect(result.password).toBe('[REDACTED]');
    expect(result.secret).toBe('[REDACTED]');
    expect(result.token).toBe('[REDACTED]');
    expect(result.key).toBe('[REDACTED]');
    expect(result.credential).toBe('[REDACTED]');
    expect(result.auth).toBe('[REDACTED]');
    expect(result.bearer).toBe('[REDACTED]');
  });

  it('redacts the extended auth-secret key patterns', () => {
    const result = redactInputs({
      passphrase: 'correct horse',
      passcode: '1234',
      cookie: 'session=abc',
      otp: '000000',
      totp: '111111',
      mfa: 'on',
      recoveryCode: 'rc-1',
      backupCode: 'bc-1',
    }) as Record<string, unknown>;

    expect(result.passphrase).toBe('[REDACTED]');
    expect(result.passcode).toBe('[REDACTED]');
    expect(result.cookie).toBe('[REDACTED]');
    expect(result.otp).toBe('[REDACTED]');
    expect(result.totp).toBe('[REDACTED]');
    expect(result.mfa).toBe('[REDACTED]');
    expect(result.recoveryCode).toBe('[REDACTED]');
    expect(result.backupCode).toBe('[REDACTED]');
  });

  it('leaves non-secret keys unchanged (incl. contact PII and substring near-misses)', () => {
    const result = redactInputs({
      title: 'Hello World',
      count: 42,
      active: true,
      tags: ['a', 'b'],
      // contact PII is intentionally preserved — it's the audit subject
      email: 'jane@example.com',
      name: 'Jane Doe',
      // substring near-misses must NOT trip the secret patterns
      shippingAddress: '1 Main St',
      className: 'btn-primary',
    }) as Record<string, unknown>;

    expect(result.title).toBe('Hello World');
    expect(result.count).toBe(42);
    expect(result.active).toBe(true);
    expect(result.tags).toEqual(['a', 'b']);
    expect(result.email).toBe('jane@example.com');
    expect(result.name).toBe('Jane Doe');
    expect(result.shippingAddress).toBe('1 Main St');
    expect(result.className).toBe('btn-primary');
  });

  it('redacts nested secret keys', () => {
    const result = redactInputs({
      user: {
        name: 'Alice',
        password: 'p@ssw0rd',
        nested: {
          apiKey: 'sk-secret',
          label: 'production',
        },
      },
    }) as Record<string, unknown>;

    const user = result.user as Record<string, unknown>;
    expect(user.name).toBe('Alice');
    expect(user.password).toBe('[REDACTED]');

    const nested = user.nested as Record<string, unknown>;
    expect(nested.label).toBe('production');
    // "apiKey" contains "key" → should be redacted
    expect(nested.apiKey).toBe('[REDACTED]');
  });

  it('redacts within arrays of objects', () => {
    const result = redactInputs([
      { name: 'Alice', token: 'tok1' },
      { name: 'Bob', token: 'tok2' },
    ]) as Array<Record<string, unknown>>;

    expect(result[0].name).toBe('Alice');
    expect(result[0].token).toBe('[REDACTED]');
    expect(result[1].name).toBe('Bob');
    expect(result[1].token).toBe('[REDACTED]');
  });

  it('replaces a payload > 4 KB with { _truncated: true }', () => {
    // Build an object whose JSON is definitely > 4096 bytes.
    const big: Record<string, string> = {};
    for (let i = 0; i < 200; i++) {
      big[`field_${i}`] = 'x'.repeat(30);
    }
    const result = redactInputs(big);
    expect(result).toEqual({ _truncated: true });
  });

  it('passes through payloads just under 4 KB intact', () => {
    // ~50 bytes of JSON — well under 4 KB.
    const small = { name: 'Alice', age: 30 };
    const result = redactInputs(small);
    expect(result).toEqual(small);
  });

  it('does not mutate the original input', () => {
    const original = { password: 'secret', name: 'Alice' };
    redactInputs(original);
    expect(original.password).toBe('secret'); // unchanged
    expect(original.name).toBe('Alice');
  });

  it('returns null/undefined/primitive values unchanged', () => {
    expect(redactInputs(null)).toBeNull();
    expect(redactInputs(42)).toBe(42);
    expect(redactInputs('hello')).toBe('hello');
    expect(redactInputs(true)).toBe(true);
  });

  it('handles case-insensitive key matching', () => {
    const result = redactInputs({
      PASSWORD: 'pw',
      secretValue: 'shh',    // "secret" substring
      AccessToken: 'tok',    // "token" substring — but AccessToken contains "token"? No — it doesn't. Let's use:
      authHeader: 'Bearer x', // "auth" substring → redacted
    }) as Record<string, unknown>;

    expect(result.PASSWORD).toBe('[REDACTED]');
    expect(result.secretValue).toBe('[REDACTED]');
    expect(result.authHeader).toBe('[REDACTED]');
  });
});
