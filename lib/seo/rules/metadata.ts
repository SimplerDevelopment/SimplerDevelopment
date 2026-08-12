// Title / meta-description checks, including duplicate detection across
// the indexable pages of one run. The too-long/too-short/duplicate variants
// share missing-title's and missing-description's "indexable 200 page"
// gate — length and uniqueness of a title only matters for a page that's
// actually eligible to rank.

import type { SeoCrawlPage } from '@/lib/db/schema';
import type { SeoIssueDraft, SeoRule } from '@/lib/seo/types';

function isIndexable200(p: SeoCrawlPage): boolean {
  return p.httpStatus === 200 && p.indexable === true;
}

// One issue per group of 2+ indexable pages sharing the same non-empty
// (trimmed) `pick(page)` value. Empty values are excluded here on purpose —
// that's what missing-title/missing-description already flag.
function duplicateGroups(
  ruleId: string,
  pages: SeoCrawlPage[],
  pick: (p: SeoCrawlPage) => string | null | undefined,
  detailKey: string,
): SeoIssueDraft[] {
  const groups = new Map<string, string[]>();
  for (const p of pages) {
    if (!isIndexable200(p)) continue;
    const value = pick(p)?.trim();
    if (!value) continue;
    const urls = groups.get(value) ?? [];
    urls.push(p.url);
    groups.set(value, urls);
  }
  const issues: SeoIssueDraft[] = [];
  for (const [value, urls] of groups) {
    if (urls.length < 2) continue;
    issues.push({ ruleId, details: { [detailKey]: value, urls } });
  }
  return issues;
}

export const rules: SeoRule[] = [
  {
    id: 'missing-title',
    category: 'metadata',
    severity: 'critical',
    title: 'Missing page title',
    description: 'This page has no title tag content.',
    whyItMatters: 'The title tag is what shows as the clickable headline in search results — without one, search engines have to guess what the page is about.',
    howToFix: 'Add a unique, descriptive title tag to the page.',
    evaluate(ctx) {
      return ctx.pages
        .filter(p => isIndexable200(p) && (!p.title || !p.title.trim()))
        .map(p => ({ ruleId: 'missing-title', pageUrl: p.url }));
    },
  },
  {
    id: 'title-too-long',
    category: 'metadata',
    severity: 'warning',
    title: 'Title tag is too long',
    description: 'This page\'s title is longer than 60 characters.',
    whyItMatters: 'Search engines truncate long titles in results, so the part that matters most to searchers may get cut off.',
    howToFix: 'Shorten the title to the important keywords and brand name, ideally under 60 characters.',
    evaluate(ctx) {
      return ctx.pages
        .filter(p => isIndexable200(p) && !!p.title && p.title.length > 60)
        .map(p => ({ ruleId: 'title-too-long', pageUrl: p.url, details: { length: p.title!.length } }));
    },
  },
  {
    id: 'title-too-short',
    category: 'metadata',
    severity: 'notice',
    title: 'Title tag is short',
    description: 'This page\'s title is shorter than 15 characters.',
    whyItMatters: 'A very short title often isn\'t descriptive enough to tell searchers what the page is about, wasting an opportunity to include useful keywords.',
    howToFix: 'Expand the title so it clearly describes the page\'s content.',
    evaluate(ctx) {
      return ctx.pages
        .filter(p => isIndexable200(p) && !!p.title && p.title.trim().length > 0 && p.title.length < 15)
        .map(p => ({ ruleId: 'title-too-short', pageUrl: p.url, details: { length: p.title!.length } }));
    },
  },
  {
    id: 'duplicate-title',
    category: 'metadata',
    severity: 'warning',
    title: 'Duplicate page titles',
    description: 'Two or more pages share the exact same title.',
    whyItMatters: 'Duplicate titles make it harder for search engines and visitors to tell your pages apart in search results.',
    howToFix: 'Write a unique title for each page that reflects its specific content.',
    evaluate(ctx) {
      return duplicateGroups('duplicate-title', ctx.pages, p => p.title, 'title');
    },
  },
  {
    id: 'missing-description',
    category: 'metadata',
    severity: 'warning',
    title: 'Missing meta description',
    description: 'This page has no meta description.',
    whyItMatters: 'Without a meta description, search engines generate their own snippet, which is often less compelling than one you\'d write yourself.',
    howToFix: 'Add a meta description that summarizes the page and gives searchers a reason to click.',
    evaluate(ctx) {
      return ctx.pages
        .filter(p => isIndexable200(p) && (!p.metaDescription || !p.metaDescription.trim()))
        .map(p => ({ ruleId: 'missing-description', pageUrl: p.url }));
    },
  },
  {
    id: 'description-too-long',
    category: 'metadata',
    severity: 'notice',
    title: 'Meta description is too long',
    description: 'This page\'s meta description is longer than 160 characters.',
    whyItMatters: 'Search engines truncate long descriptions in results, so the end of the message may never be seen.',
    howToFix: 'Trim the meta description to the key point, ideally under 160 characters.',
    evaluate(ctx) {
      return ctx.pages
        .filter(p => isIndexable200(p) && !!p.metaDescription && p.metaDescription.length > 160)
        .map(p => ({ ruleId: 'description-too-long', pageUrl: p.url, details: { length: p.metaDescription!.length } }));
    },
  },
  {
    id: 'description-too-short',
    category: 'metadata',
    severity: 'notice',
    title: 'Meta description is short',
    description: 'This page\'s meta description is shorter than 50 characters.',
    whyItMatters: 'A very short description usually isn\'t enough to explain the page and give searchers a reason to click.',
    howToFix: 'Expand the meta description to summarize the page and its value to the reader.',
    evaluate(ctx) {
      return ctx.pages
        .filter(p => isIndexable200(p) && !!p.metaDescription && p.metaDescription.trim().length > 0 && p.metaDescription.length < 50)
        .map(p => ({ ruleId: 'description-too-short', pageUrl: p.url, details: { length: p.metaDescription!.length } }));
    },
  },
  {
    id: 'duplicate-description',
    category: 'metadata',
    severity: 'warning',
    title: 'Duplicate meta descriptions',
    description: 'Two or more pages share the exact same meta description.',
    whyItMatters: 'Duplicate descriptions give search engines and visitors no way to tell your pages apart before they click through.',
    howToFix: 'Write a unique meta description for each page.',
    evaluate(ctx) {
      return duplicateGroups('duplicate-description', ctx.pages, p => p.metaDescription, 'description');
    },
  },
  {
    id: 'missing-social-meta',
    category: 'metadata',
    severity: 'notice',
    title: 'Missing social share metadata',
    description: 'This page has no Open Graph title and no Twitter card set.',
    whyItMatters: 'Without this metadata, links to this page shared on social media fall back to a generic or blank preview card.',
    howToFix: 'Add an og:title tag (and ideally og:image and a Twitter card) so shared links show a proper preview.',
    evaluate(ctx) {
      return ctx.pages
        .filter(p => isIndexable200(p) && !p.meta?.ogTitle && !p.meta?.twitterCard)
        .map(p => ({ ruleId: 'missing-social-meta', pageUrl: p.url }));
    },
  },
];
