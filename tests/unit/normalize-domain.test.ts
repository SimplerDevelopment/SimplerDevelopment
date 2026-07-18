/**
 * Regression coverage for `normalizeCustomDomain`.
 *
 * The previous in-route inline implementation had a subtle ordering bug:
 * it ran the (case-sensitive) scheme-strip regex BEFORE `toLowerCase()`,
 * so upper-case schemes like `HTTPS://Example.COM/` survived intact and
 * landed in the DB / Vercel as `https://example.com`. These tests pin
 * the order of operations down so a future re-inversion surfaces here
 * instead of only in the slow integration suite.
 */
import { describe, it, expect } from 'vitest';
import { normalizeCustomDomain } from '@/lib/normalize-domain';

describe('normalizeCustomDomain', () => {
  it('strips lowercase https://', () => {
    expect(normalizeCustomDomain('https://example.com')).toBe('example.com');
  });

  it('strips lowercase http://', () => {
    expect(normalizeCustomDomain('http://example.com')).toBe('example.com');
  });

  it('strips uppercase HTTPS:// (regression)', () => {
    expect(normalizeCustomDomain('HTTPS://Example.COM')).toBe('example.com');
  });

  it('strips uppercase HTTP:// (regression)', () => {
    expect(normalizeCustomDomain('HTTP://Example.COM')).toBe('example.com');
  });

  it('strips mixed-case scheme (HtTpS://)', () => {
    expect(normalizeCustomDomain('HtTpS://EXAMPLE.com')).toBe('example.com');
  });

  it('strips a single trailing slash', () => {
    expect(normalizeCustomDomain('example.com/')).toBe('example.com');
  });

  it('strips multiple trailing slashes', () => {
    expect(normalizeCustomDomain('example.com///')).toBe('example.com');
  });

  it('lowercases mixed-case bare hosts', () => {
    expect(normalizeCustomDomain('Portal.Acme.COM')).toBe('portal.acme.com');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeCustomDomain('  example.com  ')).toBe('example.com');
  });

  it('handles all transforms in one input', () => {
    expect(normalizeCustomDomain('  HTTPS://Example.COM/  ')).toBe('example.com');
  });

  it('leaves an already-canonical bare host unchanged', () => {
    expect(normalizeCustomDomain('portal.acme.com')).toBe('portal.acme.com');
  });

  it('preserves subdomains and TLDs', () => {
    expect(normalizeCustomDomain('https://app.team.example.co.uk/'))
      .toBe('app.team.example.co.uk');
  });
});
