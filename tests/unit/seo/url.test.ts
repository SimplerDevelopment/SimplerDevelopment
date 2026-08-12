// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { normalizeUrl, canonicalHost, isInternalUrl, urlHash } from '@/lib/seo/url';

describe('normalizeUrl — relative resolution', () => {
  it('resolves a root-relative path against base', () => {
    expect(normalizeUrl('/foo', 'https://example.com')).toBe('https://example.com/foo');
  });

  it('resolves a document-relative path against base', () => {
    expect(normalizeUrl('bar', 'https://example.com/foo/')).toBe('https://example.com/foo/bar');
  });

  it('returns null when href is relative and no base is given', () => {
    expect(normalizeUrl('/foo')).toBeNull();
  });
});

describe('normalizeUrl — fragment stripping', () => {
  it('drops the fragment', () => {
    expect(normalizeUrl('https://example.com/foo#section')).toBe('https://example.com/foo');
  });

  it('drops a bare fragment with no path change', () => {
    expect(normalizeUrl('https://example.com/#top')).toBe('https://example.com/');
  });
});

describe('normalizeUrl — query sorting', () => {
  it('sorts query params alphabetically by key', () => {
    expect(normalizeUrl('https://example.com/foo?b=2&a=1')).toBe('https://example.com/foo?a=1&b=2');
  });

  it('is stable regardless of input order', () => {
    const a = normalizeUrl('https://example.com/foo?z=1&a=2&m=3');
    const b = normalizeUrl('https://example.com/foo?m=3&z=1&a=2');
    expect(a).toBe(b);
  });

  it('preserves duplicate keys in sorted order', () => {
    expect(normalizeUrl('https://example.com/?b=2&a=1&a=0')).toBe('https://example.com/?a=1&a=0&b=2');
  });
});

describe('normalizeUrl — ignoreQueryParams', () => {
  it('strips the query entirely when set', () => {
    expect(normalizeUrl('https://example.com/foo?b=2&a=1', undefined, { ignoreQueryParams: true })).toBe(
      'https://example.com/foo'
    );
  });

  it('has no effect on a URL with no query', () => {
    expect(normalizeUrl('https://example.com/foo', undefined, { ignoreQueryParams: true })).toBe(
      'https://example.com/foo'
    );
  });
});

describe('normalizeUrl — trailing slash', () => {
  it('strips trailing slash on a non-root path', () => {
    expect(normalizeUrl('https://example.com/foo/')).toBe('https://example.com/foo');
  });

  it('keeps the slash on the root path', () => {
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com/');
  });

  it('adds the root slash when href has no path at all', () => {
    expect(normalizeUrl('https://example.com')).toBe('https://example.com/');
  });

  it('strips trailing slash on a deeper path', () => {
    expect(normalizeUrl('https://example.com/a/b/c/')).toBe('https://example.com/a/b/c');
  });
});

describe('normalizeUrl — non-http schemes rejected', () => {
  it.each([
    ['mailto:test@example.com', undefined],
    ['javascript:alert(1)', 'https://example.com'],
    ['tel:+1234567890', undefined],
    ['data:text/plain,hello', undefined],
    ['ftp://example.com/file', undefined],
  ])('returns null for %s', (href, base) => {
    expect(normalizeUrl(href, base)).toBeNull();
  });
});

describe('normalizeUrl — malformed input', () => {
  it('returns null for an unparseable URL with no base', () => {
    expect(normalizeUrl('not a url')).toBeNull();
  });

  it('returns null when the href scheme itself is malformed', () => {
    expect(normalizeUrl('ht!tp://[[[')).toBeNull();
  });

  it('returns null when base is not a valid absolute URL', () => {
    expect(normalizeUrl('/foo', 'not-a-base-at-all')).toBeNull();
  });
});

describe('normalizeUrl — misc normalization', () => {
  it('lowercases the host', () => {
    expect(normalizeUrl('https://EXAMPLE.com/Foo')).toBe('https://example.com/Foo');
  });

  it('leaves path casing untouched (path is case-sensitive)', () => {
    expect(normalizeUrl('https://example.com/Foo')).toBe('https://example.com/Foo');
  });

  it('drops the default https port', () => {
    expect(normalizeUrl('https://example.com:443/foo')).toBe('https://example.com/foo');
  });

  it('drops the default http port', () => {
    expect(normalizeUrl('http://example.com:80/foo')).toBe('http://example.com/foo');
  });

  it('keeps a non-default port', () => {
    expect(normalizeUrl('https://example.com:8443/foo')).toBe('https://example.com:8443/foo');
  });

  it('strips userinfo', () => {
    expect(normalizeUrl('https://user:pass@example.com/foo')).toBe('https://example.com/foo');
  });
});

describe('canonicalHost', () => {
  it('lowercases the host', () => {
    expect(canonicalHost('EXAMPLE.com')).toBe('example.com');
  });

  it('strips a leading www.', () => {
    expect(canonicalHost('www.example.com')).toBe('example.com');
  });

  it('does not strip www in the middle of a host', () => {
    expect(canonicalHost('www.sub.example.com')).toBe('sub.example.com');
  });

  it('is a no-op on a bare host', () => {
    expect(canonicalHost('example.com')).toBe('example.com');
  });
});

describe('isInternalUrl — www-insensitive', () => {
  it('treats www and bare host as internal to each other', () => {
    expect(isInternalUrl('https://www.example.com/foo', 'https://example.com')).toBe(true);
    expect(isInternalUrl('https://example.com/foo', 'https://www.example.com')).toBe(true);
  });

  it('returns true for an exact host match', () => {
    expect(isInternalUrl('https://example.com/foo', 'https://example.com/bar')).toBe(true);
  });

  it('returns false for a different host', () => {
    expect(isInternalUrl('https://other.com/foo', 'https://example.com')).toBe(false);
  });

  it('returns false when either URL fails to parse', () => {
    expect(isInternalUrl('not a url', 'https://example.com')).toBe(false);
    expect(isInternalUrl('https://example.com', 'not a url')).toBe(false);
  });
});

describe('urlHash', () => {
  it('is stable for the same input', () => {
    expect(urlHash('https://example.com/foo')).toBe(urlHash('https://example.com/foo'));
  });

  it('differs for different input', () => {
    expect(urlHash('https://example.com/foo')).not.toBe(urlHash('https://example.com/bar'));
  });

  it('is a 64-char lowercase hex sha256 digest', () => {
    const hash = urlHash('https://example.com/foo');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
