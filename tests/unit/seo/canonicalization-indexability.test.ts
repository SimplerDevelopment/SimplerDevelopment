import { describe, expect, it } from 'vitest';
import type { SeoPageMeta } from '@/lib/db/schema';
import { rules as canonicalizationRules } from '@/lib/seo/rules/canonicalization';
import { rules as indexabilityRules } from '@/lib/seo/rules/indexability';
import { makeCtx, makeLink, makePage } from './fixtures';

const rule = (id: string) => {
  const found = [...canonicalizationRules, ...indexabilityRules].find(r => r.id === id);
  if (!found) throw new Error(`no rule "${id}"`);
  return found;
};

describe('canonicalization.ts', () => {
  it('canonical-missing fires when canonicalUrl is not set', () => {
    const page = makePage({ canonicalUrl: null });
    expect(rule('canonical-missing').evaluate(makeCtx([page]))).toEqual([
      { ruleId: 'canonical-missing', pageUrl: page.url },
    ]);
  });

  it('canonical-points-to-broken fires when the canonical resolves to a 4xx crawled page', () => {
    // broken has no canonical of its own — otherwise its self-canonical
    // would also resolve to its own 404 and double the expected issues.
    const broken = makePage({ url: 'https://example.com/broken', httpStatus: 404, canonicalUrl: null });
    const page = makePage({ url: 'https://example.com/page', canonicalUrl: 'https://example.com/broken' });
    const issues = rule('canonical-points-to-broken').evaluate(makeCtx([page, broken]));
    expect(issues).toEqual([
      { ruleId: 'canonical-points-to-broken', pageUrl: page.url, details: { canonicalUrl: page.canonicalUrl, httpStatus: 404 } },
    ]);
  });

  it('canonical-to-redirect fires when the canonical resolves to a 3xx crawled page', () => {
    // redirecting has no canonical of its own, for the same reason as above.
    const redirecting = makePage({ url: 'https://example.com/old', httpStatus: 301, canonicalUrl: null });
    const page = makePage({ url: 'https://example.com/page', canonicalUrl: 'https://example.com/old' });
    const issues = rule('canonical-to-redirect').evaluate(makeCtx([page, redirecting]));
    expect(issues).toEqual([
      { ruleId: 'canonical-to-redirect', pageUrl: page.url, details: { canonicalUrl: page.canonicalUrl, httpStatus: 301 } },
    ]);
  });

  it('canonical-cross-domain fires when the canonical host differs from baseUrl', () => {
    const page = makePage({ canonicalUrl: 'https://other-domain.com/page' });
    const issues = rule('canonical-cross-domain').evaluate(makeCtx([page], { baseUrl: 'https://example.com' }));
    expect(issues).toEqual([
      { ruleId: 'canonical-cross-domain', pageUrl: page.url, details: { canonicalUrl: page.canonicalUrl } },
    ]);
  });

  it('canonical-cross-domain treats www as the same domain', () => {
    const page = makePage({ canonicalUrl: 'https://www.example.com/page' });
    expect(rule('canonical-cross-domain').evaluate(makeCtx([page], { baseUrl: 'https://example.com' }))).toEqual([]);
  });

  it('multiple-canonical fires when meta.canonicalCount is greater than 1', () => {
    const base = makePage();
    const meta = { ...base.meta, canonicalCount: 2 } as SeoPageMeta;
    const page = makePage({ meta });
    expect(rule('multiple-canonical').evaluate(makeCtx([page]))).toEqual([
      { ruleId: 'multiple-canonical', pageUrl: page.url, details: { canonicalCount: 2 } },
    ]);
  });
});

describe('indexability.ts', () => {
  it('noindex-page fires when indexabilityReason is noindex-meta', () => {
    const page = makePage({ indexabilityReason: 'noindex-meta' });
    expect(rule('noindex-page').evaluate(makeCtx([page]))).toEqual([{ ruleId: 'noindex-page', pageUrl: page.url }]);
  });

  it('noindex-internally-linked fires when a noindex page is still linked internally', () => {
    const linker = makePage({ url: 'https://example.com/linker' });
    const noindexed = makePage({ url: 'https://example.com/noindexed', indexabilityReason: 'noindex-meta' });
    const link = makeLink({ fromPageId: linker.id, toPageId: noindexed.id, isInternal: true });
    const issues = rule('noindex-internally-linked').evaluate(makeCtx([linker, noindexed], { links: [link] }));
    expect(issues).toEqual([
      { ruleId: 'noindex-internally-linked', pageUrl: noindexed.url, details: { linkedFrom: [linker.url] } },
    ]);
  });

  it('robots-blocked fires when indexabilityReason is robots-blocked', () => {
    const page = makePage({ indexabilityReason: 'robots-blocked' });
    expect(rule('robots-blocked').evaluate(makeCtx([page]))).toEqual([{ ruleId: 'robots-blocked', pageUrl: page.url }]);
  });
});
