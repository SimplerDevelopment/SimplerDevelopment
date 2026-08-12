// Canonical tag checks. `canonicalUrl` as extracted from a page's HTML may
// not be normalized the same way crawled page URLs are, so every lookup
// against ctx.pages normalizes first.

import type { SeoCrawlPage, SeoPageMeta } from '@/lib/db/schema';
import type { SeoIssueDraft, SeoRule } from '@/lib/seo/types';
import { canonicalHost, normalizeUrl } from '@/lib/seo/url';

function isIndexable200(p: SeoCrawlPage): boolean {
  return p.httpStatus === 200 && p.indexable === true;
}

// canonicalCount is an extraction-side extra field, not yet declared on
// SeoPageMeta (see the caller's NOTE) — cast locally.
type MetaExtras = { canonicalCount?: number };

// Resolves a page's canonicalUrl to the crawled page row it points at, if
// that URL was itself crawled in this run. Returns undefined (not an
// issue) when the canonical target falls outside the crawl — that's normal
// for e.g. a canonical to a paginated param variant we didn't fetch.
function resolveCanonicalTarget(p: SeoCrawlPage, urlToPage: Map<string, SeoCrawlPage>): SeoCrawlPage | undefined {
  if (!p.canonicalUrl) return undefined;
  const normalized = normalizeUrl(p.canonicalUrl, p.url) ?? p.canonicalUrl;
  return urlToPage.get(normalized);
}

export const rules: SeoRule[] = [
  {
    id: 'canonical-missing',
    category: 'canonicalization',
    severity: 'notice',
    title: 'Missing canonical tag',
    description: 'This page has no canonical tag.',
    whyItMatters: 'Without a canonical tag, search engines have to guess which version of a page — with tracking parameters, trailing slashes, and so on — is the one to rank.',
    howToFix: 'Add a self-referencing canonical tag, or point it at the preferred version of this page.',
    evaluate(ctx) {
      return ctx.pages
        .filter(p => isIndexable200(p) && !p.canonicalUrl)
        .map(p => ({ ruleId: 'canonical-missing', pageUrl: p.url }));
    },
  },
  {
    id: 'canonical-points-to-broken',
    category: 'canonicalization',
    severity: 'critical',
    title: 'Canonical tag points to a broken page',
    description: 'This page\'s canonical tag points at a URL that returns an error.',
    whyItMatters: 'A canonical pointing at a broken page tells search engines to consolidate ranking signal onto a page that doesn\'t exist.',
    howToFix: 'Point the canonical tag at a working page — often the page itself, if it\'s the preferred version.',
    evaluate(ctx) {
      const urlToPage = new Map(ctx.pages.map(p => [p.url, p]));
      const issues: SeoIssueDraft[] = [];
      for (const p of ctx.pages) {
        const target = resolveCanonicalTarget(p, urlToPage);
        if (target && target.httpStatus != null && target.httpStatus >= 400) {
          issues.push({
            ruleId: 'canonical-points-to-broken',
            pageUrl: p.url,
            details: { canonicalUrl: p.canonicalUrl, httpStatus: target.httpStatus },
          });
        }
      }
      return issues;
    },
  },
  {
    id: 'canonical-to-redirect',
    category: 'canonicalization',
    severity: 'warning',
    title: 'Canonical tag points to a redirect',
    description: 'This page\'s canonical tag points at a URL that redirects elsewhere.',
    whyItMatters: 'A canonical should point straight at the final version of a page — pointing at a redirect adds ambiguity about which URL is really preferred.',
    howToFix: 'Update the canonical tag to point directly at the final destination URL.',
    evaluate(ctx) {
      const urlToPage = new Map(ctx.pages.map(p => [p.url, p]));
      const issues: SeoIssueDraft[] = [];
      for (const p of ctx.pages) {
        const target = resolveCanonicalTarget(p, urlToPage);
        if (target && target.httpStatus != null && target.httpStatus >= 300 && target.httpStatus <= 399) {
          issues.push({
            ruleId: 'canonical-to-redirect',
            pageUrl: p.url,
            details: { canonicalUrl: p.canonicalUrl, httpStatus: target.httpStatus },
          });
        }
      }
      return issues;
    },
  },
  {
    id: 'canonical-cross-domain',
    category: 'canonicalization',
    severity: 'warning',
    title: 'Canonical tag points to a different domain',
    description: 'This page\'s canonical tag points at a URL on a different domain.',
    whyItMatters: 'A cross-domain canonical tells search engines this isn\'t the authoritative version of the page — usually unintentional, and it can drop the page from your own site\'s search results.',
    howToFix: 'Confirm this is intentional (e.g. syndicated content); otherwise point the canonical back at a URL on your own domain.',
    evaluate(ctx) {
      let baseHost: string;
      try {
        baseHost = canonicalHost(new URL(ctx.baseUrl).host);
      } catch {
        return [];
      }
      const issues: SeoIssueDraft[] = [];
      for (const p of ctx.pages) {
        if (!p.canonicalUrl) continue;
        let canonicalUrlHost: string;
        try {
          canonicalUrlHost = canonicalHost(new URL(p.canonicalUrl, p.url).host);
        } catch {
          continue;
        }
        if (canonicalUrlHost !== baseHost) {
          issues.push({ ruleId: 'canonical-cross-domain', pageUrl: p.url, details: { canonicalUrl: p.canonicalUrl } });
        }
      }
      return issues;
    },
  },
  {
    id: 'multiple-canonical',
    category: 'canonicalization',
    severity: 'warning',
    title: 'Multiple canonical tags',
    description: 'This page has more than one canonical tag.',
    whyItMatters: 'When a page declares more than one canonical URL, search engines may disregard all of them and choose on their own.',
    howToFix: 'Remove the extra canonical tags so the page declares exactly one.',
    evaluate(ctx) {
      return ctx.pages
        .filter(p => ((p.meta as SeoPageMeta & MetaExtras)?.canonicalCount ?? 0) > 1)
        .map(p => ({
          ruleId: 'multiple-canonical',
          pageUrl: p.url,
          details: { canonicalCount: (p.meta as SeoPageMeta & MetaExtras).canonicalCount },
        }));
    },
  },
];
