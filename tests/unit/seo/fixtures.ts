// Shared fixture builders for the SEO rules-engine tests. makePage()'s
// defaults are deliberately tuned to be "clean" — a run over
// makeCtx([makePage()]) should trip zero rules (see engine.test.ts) — so
// every positive-case test only needs to override the one or two fields
// that make its scenario bad.

import type { SeoCrawlPage, SeoPageLink } from '@/lib/db/schema';
import type { SeoRunContext } from '@/lib/seo/types';

let pageIdCounter = 1;
let linkIdCounter = 1;

export function makePage(overrides: Partial<SeoCrawlPage> = {}): SeoCrawlPage {
  const id = overrides.id ?? pageIdCounter++;
  const url = overrides.url ?? `https://example.com/page-${id}`;
  const base: SeoCrawlPage = {
    id,
    runId: 1,
    projectId: 1,
    clientId: 1,
    url,
    urlHash: `hash-${id}`,
    httpStatus: 200,
    finalUrl: null,
    redirectChain: [],
    contentType: 'text/html; charset=utf-8',
    responseTimeMs: 200,
    responseBytes: 1000,
    depth: 1,
    discoveredFrom: 'link',
    indexable: true,
    indexabilityReason: null,
    canonicalUrl: url,
    title: 'A perfectly reasonable example page title',
    metaDescription: 'A perfectly reasonable example meta description used for fixture testing purposes.',
    h1: 'A perfectly reasonable example heading',
    h1Count: 1,
    wordCount: 500,
    lang: 'en',
    contentHash: `content-hash-${id}`,
    internalLinksCount: 5,
    externalLinksCount: 2,
    nofollowLinksCount: 0,
    imagesCount: 2,
    imagesMissingAlt: 0,
    meta: {
      ogTitle: 'Example OG title',
      ogDescription: 'Example OG description.',
      ogImage: null,
      twitterCard: 'summary',
      jsonLdTypes: ['Organization'],
      hreflang: [],
      robotsMeta: null,
      headers: { 'strict-transport-security': 'max-age=31536000; includeSubDomains' },
      iframeCount: 0,
    },
    internalRank: null,
    incomingLinks: 1,
    orphan: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
  return { ...base, ...overrides };
}

export function makeLink(overrides: Partial<SeoPageLink> = {}): SeoPageLink {
  const id = overrides.id ?? linkIdCounter++;
  const base: SeoPageLink = {
    id,
    runId: 1,
    clientId: 1,
    fromPageId: 1,
    toUrl: 'https://example.com/target',
    toUrlHash: 'target-hash',
    toPageId: null,
    anchorText: 'Example link',
    isInternal: true,
    nofollow: false,
  };
  return { ...base, ...overrides };
}

export function makeCtx(pages: SeoCrawlPage[], extra: Partial<SeoRunContext> = {}): SeoRunContext {
  return {
    baseUrl: 'https://example.com',
    pages,
    links: [],
    sitemapUrls: pages.map(p => p.url),
    robotsTxt: 'User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml',
    ...extra,
  };
}
