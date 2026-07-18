import { describe, it, expect } from 'vitest';
import { safeCallbackUrl } from '@/lib/security/safe-callback-url';

const FALLBACK = '/portal/dashboard';

describe('safeCallbackUrl', () => {
  it('allows genuine same-origin relative paths', () => {
    expect(safeCallbackUrl('/portal/websites/5')).toBe('/portal/websites/5');
    expect(safeCallbackUrl('/portal/x?a=1#b')).toBe('/portal/x?a=1#b');
  });

  it('falls back on empty/nullish', () => {
    expect(safeCallbackUrl(null)).toBe(FALLBACK);
    expect(safeCallbackUrl(undefined)).toBe(FALLBACK);
    expect(safeCallbackUrl('')).toBe(FALLBACK);
  });

  it('blocks the backslash open-redirect bypass', () => {
    // The bug: these pass a naive "starts with / and not //" check but the URL
    // parser resolves them off-site.
    expect(safeCallbackUrl('/\\evil.com')).toBe(FALLBACK);
    expect(safeCallbackUrl('\\/evil.com')).toBe(FALLBACK);
    expect(safeCallbackUrl('/\\\\evil.com')).toBe(FALLBACK);
    expect(safeCallbackUrl('/\tevil.com')).toBe(FALLBACK);
  });

  it('blocks absolute, protocol-relative, and scheme URLs', () => {
    expect(safeCallbackUrl('//evil.com')).toBe(FALLBACK);
    expect(safeCallbackUrl('https://evil.com')).toBe(FALLBACK);
    expect(safeCallbackUrl('javascript:alert(1)')).toBe(FALLBACK);
    expect(safeCallbackUrl('not-a-path')).toBe(FALLBACK);
  });
});
