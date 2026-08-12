import { describe, expect, it } from 'vitest';
import type { SeoPageMeta } from '@/lib/db/schema';
import { rules as sitemapsRules } from '@/lib/seo/rules/sitemaps';
import { rules as robotsRules } from '@/lib/seo/rules/robots';
import { rules as securityRules } from '@/lib/seo/rules/security';
import { rules as structuredDataRules } from '@/lib/seo/rules/structured-data';
import { makeCtx, makeLink, makePage } from './fixtures';

const rule = (id: string) => {
  const found = [...sitemapsRules, ...robotsRules, ...securityRules, ...structuredDataRules].find(r => r.id === id);
  if (!found) throw new Error(`no rule "${id}"`);
  return found;
};

describe('sitemaps.ts', () => {
  it('sitemap-missing fires (site-level) when ctx.sitemapUrls is empty', () => {
    const page = makePage();
    expect(rule('sitemap-missing').evaluate(makeCtx([page], { sitemapUrls: [] }))).toEqual([
      { ruleId: 'sitemap-missing' },
    ]);
  });

  it('noindex-in-sitemap fires when a sitemap URL crawled as noindex', () => {
    const page = makePage({ indexabilityReason: 'noindex-meta' });
    const ctx = makeCtx([page], { sitemapUrls: [page.url] });
    expect(rule('noindex-in-sitemap').evaluate(ctx)).toEqual([{ ruleId: 'noindex-in-sitemap', pageUrl: page.url }]);
  });

  it('robots-blocked-in-sitemap fires when a sitemap URL crawled as robots-blocked', () => {
    const page = makePage({ indexabilityReason: 'robots-blocked' });
    const ctx = makeCtx([page], { sitemapUrls: [page.url] });
    expect(rule('robots-blocked-in-sitemap').evaluate(ctx)).toEqual([
      { ruleId: 'robots-blocked-in-sitemap', pageUrl: page.url },
    ]);
  });

  it('sitemap-4xx fires when a sitemap URL crawled with a 4xx+ status', () => {
    const page = makePage({ httpStatus: 404 });
    const ctx = makeCtx([page], { sitemapUrls: [page.url] });
    expect(rule('sitemap-4xx').evaluate(ctx)).toEqual([
      { ruleId: 'sitemap-4xx', pageUrl: page.url, details: { httpStatus: 404 } },
    ]);
  });

  it('sitemap-non-canonical fires when a sitemap URL canonicals elsewhere', () => {
    const page = makePage({ indexabilityReason: 'canonical-elsewhere' });
    const ctx = makeCtx([page], { sitemapUrls: [page.url] });
    expect(rule('sitemap-non-canonical').evaluate(ctx)).toEqual([
      { ruleId: 'sitemap-non-canonical', pageUrl: page.url },
    ]);
  });

  it('orphan-only-in-sitemap fires when a sitemap-discovered page has zero incoming links', () => {
    const page = makePage({ discoveredFrom: 'sitemap', incomingLinks: 0 });
    expect(rule('orphan-only-in-sitemap').evaluate(makeCtx([page]))).toEqual([
      { ruleId: 'orphan-only-in-sitemap', pageUrl: page.url },
    ]);
  });
});

describe('robots.ts', () => {
  it('robots-txt-missing fires (site-level) when ctx.robotsTxt is null', () => {
    const page = makePage();
    expect(rule('robots-txt-missing').evaluate(makeCtx([page], { robotsTxt: null }))).toEqual([
      { ruleId: 'robots-txt-missing' },
    ]);
  });
});

describe('security.ts', () => {
  it('http-links-from-https fires, grouped per source page', () => {
    const source = makePage({ url: 'https://example.com/source' });
    const link = makeLink({ fromPageId: source.id, isInternal: true, toUrl: 'http://example.com/insecure' });
    const issues = rule('http-links-from-https').evaluate(makeCtx([source], { links: [link] }));
    expect(issues).toEqual([
      { ruleId: 'http-links-from-https', pageUrl: source.url, details: { httpLinks: ['http://example.com/insecure'] } },
    ]);
  });

  it('mixed-content fires when an https page reports insecure resources', () => {
    const base = makePage({ url: 'https://example.com/page' });
    const meta = { ...base.meta, insecureResourceCount: 3 } as SeoPageMeta;
    const page = makePage({ url: 'https://example.com/page', meta });
    expect(rule('mixed-content').evaluate(makeCtx([page]))).toEqual([
      { ruleId: 'mixed-content', pageUrl: page.url, details: { insecureResourceCount: 3 } },
    ]);
  });

  it('missing-hsts fires (site-level) when no 200 page returns an HSTS header on an https site', () => {
    const base = makePage();
    const meta = { ...base.meta, headers: {} } as SeoPageMeta;
    const page = makePage({ meta });
    expect(rule('missing-hsts').evaluate(makeCtx([page], { baseUrl: 'https://example.com' }))).toEqual([
      { ruleId: 'missing-hsts' },
    ]);
  });

  it('missing-hsts stays silent on a non-https site', () => {
    const base = makePage();
    const meta = { ...base.meta, headers: {} } as SeoPageMeta;
    const page = makePage({ meta });
    expect(rule('missing-hsts').evaluate(makeCtx([page], { baseUrl: 'http://example.com' }))).toEqual([]);
  });
});

describe('structured-data.ts', () => {
  it('json-ld-invalid fires when meta.jsonLdParseErrors is greater than 0', () => {
    const base = makePage();
    const meta = { ...base.meta, jsonLdParseErrors: 1 } as SeoPageMeta;
    const page = makePage({ meta });
    expect(rule('json-ld-invalid').evaluate(makeCtx([page]))).toEqual([
      { ruleId: 'json-ld-invalid', pageUrl: page.url, details: { jsonLdParseErrors: 1 } },
    ]);
  });

  it('no-structured-data fires on an indexable 200 page with no jsonLdTypes', () => {
    const base = makePage();
    const meta = { ...base.meta, jsonLdTypes: [] } as SeoPageMeta;
    const page = makePage({ meta });
    expect(rule('no-structured-data').evaluate(makeCtx([page]))).toEqual([
      { ruleId: 'no-structured-data', pageUrl: page.url },
    ]);
  });
});
