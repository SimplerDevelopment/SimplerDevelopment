import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock node:dns/promises *before* importing the module under test so the
// module picks up the mock when it captures `resolveTxt` at import time.
// Vitest 4 requires a `default` key on factory mocks of modules that have
// a default export (node:dns/promises has both default and named exports).
vi.mock('node:dns/promises', () => {
  const resolveTxt = vi.fn();
  return {
    default: { resolveTxt },
    resolveTxt,
  };
});

import { resolveTxt } from 'node:dns/promises';
import {
  generateVerificationToken,
  isPlausibleDomain,
  verifyDomainOwnership,
} from '@/lib/agency/dns-verify';

const mockedResolveTxt = vi.mocked(resolveTxt);

describe('verifyDomainOwnership', () => {
  afterEach(() => {
    mockedResolveTxt.mockReset();
  });

  it('returns true when the TXT record exactly matches the expected token', async () => {
    mockedResolveTxt.mockResolvedValueOnce([
      ['unrelated-other-record'],
      ['expected-token-123'],
    ]);
    const ok = await verifyDomainOwnership('example.com', 'expected-token-123');
    expect(ok).toBe(true);
    expect(mockedResolveTxt).toHaveBeenCalledWith('_simplerdev.example.com');
  });

  it('joins multi-chunk TXT records before comparing (resolveTxt returns string[][])', async () => {
    mockedResolveTxt.mockResolvedValueOnce([['part1', 'part2']]);
    const ok = await verifyDomainOwnership('example.com', 'part1part2');
    expect(ok).toBe(true);
  });

  it('returns false when no TXT record matches', async () => {
    mockedResolveTxt.mockResolvedValueOnce([['something-else']]);
    const ok = await verifyDomainOwnership('example.com', 'expected-token');
    expect(ok).toBe(false);
  });

  it('returns false (does not throw) on DNS lookup failure', async () => {
    mockedResolveTxt.mockRejectedValueOnce(new Error('ENOTFOUND'));
    const ok = await verifyDomainOwnership('example.com', 'token');
    expect(ok).toBe(false);
  });

  it('returns false for empty inputs without calling DNS', async () => {
    expect(await verifyDomainOwnership('', 'token')).toBe(false);
    expect(await verifyDomainOwnership('example.com', '')).toBe(false);
    expect(mockedResolveTxt).not.toHaveBeenCalled();
  });

  it('lowercases the domain before lookup so case differences do not matter', async () => {
    mockedResolveTxt.mockResolvedValueOnce([['t']]);
    await verifyDomainOwnership('Example.COM', 't');
    expect(mockedResolveTxt).toHaveBeenCalledWith('_simplerdev.example.com');
  });
});

describe('generateVerificationToken', () => {
  it('produces a 64-character hex string', () => {
    const t = generateVerificationToken();
    expect(t).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces unique tokens across calls', () => {
    const a = generateVerificationToken();
    const b = generateVerificationToken();
    expect(a).not.toBe(b);
  });
});

describe('isPlausibleDomain', () => {
  it('accepts normal apex and subdomains', () => {
    expect(isPlausibleDomain('acme.com')).toBe(true);
    expect(isPlausibleDomain('portal.acme-agency.com')).toBe(true);
    expect(isPlausibleDomain('a.b.c.d.example.org')).toBe(true);
  });

  it('rejects garbage', () => {
    expect(isPlausibleDomain('')).toBe(false);
    expect(isPlausibleDomain('no-tld')).toBe(false);
    expect(isPlausibleDomain('has spaces.com')).toBe(false);
    expect(isPlausibleDomain('https://acme.com')).toBe(false);
    expect(isPlausibleDomain('acme.com/path')).toBe(false);
  });

  it('rejects our own platform domain to prevent hijack', () => {
    expect(isPlausibleDomain('simplerdevelopment.com')).toBe(false);
    expect(isPlausibleDomain('foo.simplerdevelopment.com')).toBe(false);
  });

  it('rejects labels that violate hostname rules', () => {
    expect(isPlausibleDomain('-leading-dash.com')).toBe(false);
    expect(isPlausibleDomain('trailing-dash-.com')).toBe(false);
    expect(isPlausibleDomain('a..b.com')).toBe(false);
  });
});
