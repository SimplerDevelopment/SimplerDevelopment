// Rules over the internal link graph — ctx.links plus each page's own
// link-count columns. `toPageId` is only resolved when the target URL was
// itself crawled in this run (see the seo_page_links comment in the
// schema); an unresolved target is out of scope for these rules, not
// evidence of anything broken.

import type { SeoCrawlPage, SeoPageLink } from '@/lib/db/schema';
import type { SeoIssueDraft, SeoRule } from '@/lib/seo/types';

// Groups edges in `links` by source page, keeping only edges that pass
// `match`, then emits one issue per source page listing every surviving
// target (via `describe`). Shared shape behind broken-link / redirect- /
// nofollow-target checks below — each source page gets exactly one issue
// with all its offending links as evidence, not one issue per link.
function groupBySource(
  ruleId: string,
  pages: SeoCrawlPage[],
  links: SeoPageLink[],
  match: (link: SeoPageLink, target: SeoCrawlPage | undefined) => boolean,
  describe: (link: SeoPageLink, target: SeoCrawlPage | undefined) => Record<string, unknown>,
): SeoIssueDraft[] {
  const pagesById = new Map(pages.map(p => [p.id, p]));
  const bySource = new Map<number, Record<string, unknown>[]>();
  for (const link of links) {
    const target = link.toPageId != null ? pagesById.get(link.toPageId) : undefined;
    if (!match(link, target)) continue;
    const list = bySource.get(link.fromPageId) ?? [];
    list.push(describe(link, target));
    bySource.set(link.fromPageId, list);
  }
  const issues: SeoIssueDraft[] = [];
  for (const [fromId, targets] of bySource) {
    const source = pagesById.get(fromId);
    if (!source) continue;
    issues.push({ ruleId, pageUrl: source.url, details: { targets } });
  }
  return issues;
}

export const rules: SeoRule[] = [
  {
    id: 'broken-internal-link',
    category: 'internal-links',
    severity: 'critical',
    title: 'Internal link points to a broken page',
    description: 'This page links to another page on your site that returned an error.',
    whyItMatters: 'Broken internal links send visitors to dead ends and waste the crawl budget search engines spend on your site.',
    howToFix: 'Update the link to point at the correct URL, or remove it if the target page no longer exists.',
    evaluate(ctx) {
      return groupBySource(
        'broken-internal-link',
        ctx.pages,
        ctx.links,
        (link, target) => link.isInternal && !!target && target.httpStatus != null && target.httpStatus >= 400,
        (link, target) => ({ url: target!.url, httpStatus: target!.httpStatus, anchorText: link.anchorText }),
      );
    },
  },
  {
    id: 'internal-link-to-redirect',
    category: 'internal-links',
    severity: 'notice',
    title: 'Internal link points to a redirect',
    description: 'This page links directly to a URL that redirects elsewhere instead of the final destination.',
    whyItMatters: 'Linking straight to a redirect adds an unnecessary hop for visitors and search engines on every click.',
    howToFix: 'Update the link to point directly at the final destination URL.',
    evaluate(ctx) {
      return groupBySource(
        'internal-link-to-redirect',
        ctx.pages,
        ctx.links,
        (link, target) => link.isInternal && !!target && target.httpStatus != null && target.httpStatus >= 300 && target.httpStatus <= 399,
        (link, target) => ({ url: target!.url, httpStatus: target!.httpStatus, anchorText: link.anchorText }),
      );
    },
  },
  {
    id: 'internal-nofollow',
    category: 'internal-links',
    severity: 'warning',
    title: 'Internal link marked nofollow',
    description: 'This page has one or more internal links marked nofollow.',
    whyItMatters: 'Nofollow on an internal link tells search engines not to pass ranking signal to your own page, which usually isn\'t what you want within your own site.',
    howToFix: 'Remove the nofollow attribute from internal links unless you specifically want to keep that page out of the link graph.',
    evaluate(ctx) {
      return groupBySource(
        'internal-nofollow',
        ctx.pages,
        ctx.links,
        (link) => link.isInternal && link.nofollow,
        (link) => ({ url: link.toUrl, anchorText: link.anchorText }),
      );
    },
  },
  {
    id: 'no-outgoing-internal',
    category: 'internal-links',
    severity: 'notice',
    title: 'No outgoing internal links',
    description: 'This page doesn\'t link to any other page on your site.',
    whyItMatters: 'A page with no outgoing internal links is a dead end — it doesn\'t help visitors discover more of your site or pass link equity onward.',
    howToFix: 'Add relevant links from this page to other pages on your site.',
    evaluate(ctx) {
      return ctx.pages
        .filter(p => p.httpStatus === 200 && p.indexable === true && p.internalLinksCount === 0)
        .map(p => ({ ruleId: 'no-outgoing-internal', pageUrl: p.url }));
    },
  },
  {
    id: 'excessive-internal-links',
    category: 'internal-links',
    severity: 'notice',
    title: 'Excessive internal links on one page',
    description: 'This page has more than 200 internal links.',
    whyItMatters: 'Spreading link equity across hundreds of links on one page dilutes how much weight each individual link carries.',
    howToFix: 'Trim navigation, footer, or in-content links down to the ones that matter most for this page.',
    evaluate(ctx) {
      return ctx.pages
        .filter(p => p.httpStatus === 200 && p.indexable === true && p.internalLinksCount > 200)
        .map(p => ({ ruleId: 'excessive-internal-links', pageUrl: p.url, details: { internalLinksCount: p.internalLinksCount } }));
    },
  },
  {
    id: 'orphan-page',
    category: 'internal-links',
    severity: 'warning',
    title: 'Orphan page',
    description: 'No other page on your site links to this one.',
    whyItMatters: 'Orphan pages are hard for visitors and search engines to find — without an internal link, only a direct visit or an external link can reach them.',
    howToFix: 'Add a link to this page from relevant navigation or content so it\'s discoverable.',
    evaluate(ctx) {
      return ctx.pages
        .filter(p => p.orphan === true)
        .map(p => ({ ruleId: 'orphan-page', pageUrl: p.url }));
    },
  },
  {
    id: 'page-too-deep',
    category: 'internal-links',
    severity: 'notice',
    title: 'Page is buried too deep',
    description: 'This page is 5 or more clicks away from your homepage.',
    whyItMatters: 'Pages buried deep in the site structure get crawled less often and are harder for visitors to stumble onto.',
    howToFix: 'Add links from higher-level pages, such as navigation or category pages, to bring this page closer to the homepage.',
    evaluate(ctx) {
      return ctx.pages
        .filter(p => p.depth >= 5)
        .map(p => ({ ruleId: 'page-too-deep', pageUrl: p.url, details: { depth: p.depth } }));
    },
  },
];
