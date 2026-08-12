// Sitemap vs. crawl-reality checks. ctx.sitemapUrls are raw strings pulled
// from the sitemap XML — normalized here before matching against crawled
// pages, which are already normalized (see the seo_crawl_pages.url comment
// in the schema).

import type { SeoCrawlPage } from '@/lib/db/schema';
import type { SeoRule, SeoRunContext } from '@/lib/seo/types';
import { normalizeUrl } from '@/lib/seo/url';

// Sitemap entries matched to the crawled page each one resolves to. A
// sitemap URL that wasn't itself crawled this run (outside maxPages, or
// blocked before the crawler could reach it) has nothing to match — that's
// a gap the crawler owns, not something these rules can evaluate.
function matchedPages(ctx: SeoRunContext): { sitemapUrl: string; page: SeoCrawlPage }[] {
  const urlToPage = new Map(ctx.pages.map(p => [p.url, p]));
  const matches: { sitemapUrl: string; page: SeoCrawlPage }[] = [];
  for (const raw of ctx.sitemapUrls) {
    const normalized = normalizeUrl(raw, ctx.baseUrl);
    if (!normalized) continue;
    const page = urlToPage.get(normalized);
    if (page) matches.push({ sitemapUrl: raw, page });
  }
  return matches;
}

export const rules: SeoRule[] = [
  {
    id: 'sitemap-missing',
    category: 'sitemaps',
    severity: 'notice',
    title: 'No sitemap found',
    description: 'We couldn\'t find a sitemap for this site.',
    whyItMatters: 'A sitemap helps search engines discover and prioritize your pages, especially on larger or less well-linked sites.',
    howToFix: 'Generate an XML sitemap and reference it in robots.txt, or submit it directly in Google Search Console.',
    evaluate(ctx) {
      if (ctx.sitemapUrls.length > 0) return [];
      return [{ ruleId: 'sitemap-missing' }];
    },
  },
  {
    id: 'noindex-in-sitemap',
    category: 'sitemaps',
    severity: 'warning',
    title: 'Noindex page listed in sitemap',
    description: 'This URL is listed in your sitemap, but the page itself is set to noindex.',
    whyItMatters: 'Sitemaps should only list pages you want indexed — including a noindex page sends search engines a contradictory signal.',
    howToFix: 'Remove this URL from the sitemap, or remove the noindex tag if the page should be indexed.',
    evaluate(ctx) {
      return matchedPages(ctx)
        .filter(m => m.page.indexabilityReason === 'noindex-meta')
        .map(m => ({ ruleId: 'noindex-in-sitemap', pageUrl: m.page.url }));
    },
  },
  {
    id: 'robots-blocked-in-sitemap',
    category: 'sitemaps',
    severity: 'warning',
    title: 'Robots-blocked page listed in sitemap',
    description: 'This URL is listed in your sitemap, but robots.txt blocks it from being crawled.',
    whyItMatters: 'A blocked URL in the sitemap sends a contradictory signal and wastes the search engine\'s attention on a page it can\'t even fetch.',
    howToFix: 'Remove this URL from the sitemap, or update robots.txt to allow it.',
    evaluate(ctx) {
      return matchedPages(ctx)
        .filter(m => m.page.indexabilityReason === 'robots-blocked')
        .map(m => ({ ruleId: 'robots-blocked-in-sitemap', pageUrl: m.page.url }));
    },
  },
  {
    id: 'sitemap-4xx',
    category: 'sitemaps',
    severity: 'critical',
    title: 'Sitemap lists a broken page',
    description: 'This URL is listed in your sitemap, but it returned an error when we crawled it.',
    whyItMatters: 'A sitemap full of broken links wastes crawl budget and undermines a search engine\'s trust in the rest of the sitemap.',
    howToFix: 'Fix the page, or remove the URL from the sitemap if it should no longer exist.',
    evaluate(ctx) {
      return matchedPages(ctx)
        .filter(m => m.page.httpStatus != null && m.page.httpStatus >= 400)
        .map(m => ({ ruleId: 'sitemap-4xx', pageUrl: m.page.url, details: { httpStatus: m.page.httpStatus } }));
    },
  },
  {
    id: 'sitemap-non-canonical',
    category: 'sitemaps',
    severity: 'notice',
    title: 'Sitemap lists a non-canonical URL',
    description: 'This URL is listed in your sitemap, but it canonicals to a different page.',
    whyItMatters: 'Sitemaps should list canonical URLs — listing a non-canonical version sends a mixed signal about which page is preferred.',
    howToFix: 'Replace this URL in the sitemap with its canonical version.',
    evaluate(ctx) {
      return matchedPages(ctx)
        .filter(m => m.page.indexabilityReason === 'canonical-elsewhere')
        .map(m => ({ ruleId: 'sitemap-non-canonical', pageUrl: m.page.url }));
    },
  },
  {
    id: 'orphan-only-in-sitemap',
    category: 'sitemaps',
    severity: 'notice',
    title: 'Page only discoverable via sitemap',
    description: 'This page has no internal links pointing to it and was only found through the sitemap.',
    whyItMatters: 'A page that relies entirely on the sitemap for discovery becomes unreachable the moment it drops out of the sitemap.',
    howToFix: 'Add an internal link to this page from relevant navigation or content.',
    evaluate(ctx) {
      return ctx.pages
        .filter(p => p.discoveredFrom === 'sitemap' && p.incomingLinks === 0)
        .map(p => ({ ruleId: 'orphan-only-in-sitemap', pageUrl: p.url }));
    },
  },
];
