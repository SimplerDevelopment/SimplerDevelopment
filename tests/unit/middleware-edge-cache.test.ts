/**
 * Pins which tenant responses may enter a SHARED (CDN) cache.
 *
 * Every case below is a way the same URL renders differently for two visitors,
 * or a way private content could land in a cache everyone reads. Getting this
 * wrong is not a performance regression — it is one visitor seeing another's
 * page, or an unpublished draft going public. The default is "do not cache";
 * each test asserts a specific reason to refuse.
 */
import { describe, it, expect } from 'vitest';
import { mayShareCache, type SiteHostInfoLike } from '@/lib/sites/edge-cache-policy';

const cacheable: SiteHostInfoLike = {
  siteId: 1,
  publicAccess: true,
  cdnCacheEnabled: true,
  hasRunningExperiment: false,
};

function req(opts: { url?: string; method?: string; cookie?: string } = {}) {
  return {
    method: opts.method ?? 'GET',
    url: opts.url ?? 'https://acme.com/about',
    cookie: opts.cookie ?? '',
  };
}

describe('mayShareCache', () => {
  it('allows an anonymous GET on an opted-in public site', () => {
    expect(mayShareCache(req(), cacheable)).toBe(true);
  });

  it('refuses when the tenant has not opted in (the kill switch)', () => {
    expect(mayShareCache(req(), { ...cacheable, cdnCacheEnabled: false })).toBe(false);
  });

  it('refuses while an A/B experiment is running', () => {
    // Content varies per visitor — one variant would be served to everyone.
    expect(mayShareCache(req(), { ...cacheable, hasRunningExperiment: true })).toBe(false);
  });

  it('refuses for a gated site', () => {
    // Renders either an access wall or the unlocked content depending on a
    // signed cookie, so it is never one-size-fits-all.
    expect(mayShareCache(req(), { ...cacheable, publicAccess: false })).toBe(false);
  });

  it('refuses non-GET methods', () => {
    expect(mayShareCache(req({ method: 'POST' }), cacheable)).toBe(false);
    expect(mayShareCache(req({ method: 'HEAD' }), cacheable)).toBe(false);
  });

  it.each(['_edit', '_preview', '_token'])('refuses when %s is present', (param) => {
    // These render UNPUBLISHED content. The token is verified in the page, not
    // here — middleware decides caching, never authorization — so the mere
    // presence of a preview-shaped param is enough to refuse.
    expect(mayShareCache(req({ url: `https://acme.com/about?${param}=1` }), cacheable)).toBe(false);
  });

  it('refuses when a session cookie is present', () => {
    for (const c of [
      'next-auth.session-token=abc',
      '__Secure-next-auth.session-token=abc',
      'authjs.session-token=abc',
      'foo=1; next-auth.session-token=abc; bar=2',
    ]) {
      expect(mayShareCache(req({ cookie: c }), cacheable)).toBe(false);
    }
  });

  it('refuses when a gated-site unlock cookie is present', () => {
    expect(mayShareCache(req({ cookie: 'sd_unlocked_42=sig' }), cacheable)).toBe(false);
  });

  it('still caches for a visitor carrying only unrelated cookies', () => {
    // A false positive costs a cache miss, but being too shy about ordinary
    // analytics cookies would make the cache useless.
    expect(mayShareCache(req({ cookie: 'sd_visitor=abc; _ga=GA1.2.3' }), cacheable)).toBe(true);
  });

  it('is not fooled by a cookie whose name merely contains a blocked substring', () => {
    expect(mayShareCache(req({ cookie: 'not_sd_unlocked_42=x' }), cacheable)).toBe(true);
  });
});
