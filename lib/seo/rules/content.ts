// Content quality checks: headings, body length, duplicate content, plus a
// couple of hygiene checks (lang, URL length) that live here because
// they're about the page's content identity rather than its HTTP behavior.

import type { SeoCrawlPage } from '@/lib/db/schema';
import type { SeoIssueDraft, SeoRule } from '@/lib/seo/types';

function isIndexable200(p: SeoCrawlPage): boolean {
  return p.httpStatus === 200 && p.indexable === true;
}

// One issue per group of 2+ indexable pages sharing the same non-empty
// (trimmed) `pick(page)` value — mirrors metadata.ts's duplicateGroups,
// kept local so each rules file stays self-contained.
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
    id: 'missing-h1',
    category: 'content',
    severity: 'warning',
    title: 'Missing H1 heading',
    description: 'This page has no H1 heading.',
    whyItMatters: 'The H1 is the primary signal to visitors and search engines of what the page is about.',
    howToFix: 'Add a single, descriptive H1 heading near the top of the page.',
    evaluate(ctx) {
      return ctx.pages
        .filter(p => isIndexable200(p) && p.h1Count === 0)
        .map(p => ({ ruleId: 'missing-h1', pageUrl: p.url }));
    },
  },
  {
    id: 'multiple-h1',
    category: 'content',
    severity: 'notice',
    title: 'Multiple H1 headings',
    description: 'This page has more than one H1 heading.',
    whyItMatters: 'Multiple H1s can dilute a page\'s topical focus and make it less clear what the main subject is.',
    howToFix: 'Keep a single H1 for the page\'s main heading and use H2/H3 for subsections.',
    evaluate(ctx) {
      return ctx.pages
        .filter(p => isIndexable200(p) && p.h1Count > 1)
        .map(p => ({ ruleId: 'multiple-h1', pageUrl: p.url, details: { h1Count: p.h1Count } }));
    },
  },
  {
    id: 'thin-content',
    category: 'content',
    severity: 'warning',
    title: 'Thin content',
    description: 'This page has fewer than 100 words of body content.',
    whyItMatters: 'Search engines generally struggle to rank pages with very little content because there\'s not much to judge relevance from.',
    howToFix: 'Expand the page with more substantive, useful content, or fold it into a related page.',
    evaluate(ctx) {
      return ctx.pages
        .filter(p => isIndexable200(p) && p.wordCount < 100)
        .map(p => ({ ruleId: 'thin-content', pageUrl: p.url, details: { wordCount: p.wordCount } }));
    },
  },
  {
    id: 'duplicate-content',
    category: 'content',
    severity: 'warning',
    title: 'Duplicate content',
    description: 'Two or more pages have identical body content.',
    whyItMatters: 'Search engines may only index one version of duplicate content, so the rest compete against each other instead of ranking.',
    howToFix: 'Make each page\'s content unique, or add a canonical tag pointing duplicates at the preferred version.',
    evaluate(ctx) {
      return duplicateGroups('duplicate-content', ctx.pages, p => p.contentHash, 'contentHash');
    },
  },
  {
    id: 'missing-lang',
    category: 'content',
    severity: 'notice',
    title: 'Missing language declaration',
    description: 'This page\'s html tag has no lang attribute.',
    whyItMatters: 'The lang attribute helps search engines and screen readers know what language the page is written in.',
    howToFix: 'Add a lang attribute to the html tag, e.g. <html lang="en">.',
    evaluate(ctx) {
      return ctx.pages
        .filter(p => p.httpStatus === 200 && !!p.contentType?.toLowerCase().includes('html') && (!p.lang || !p.lang.trim()))
        .map(p => ({ ruleId: 'missing-lang', pageUrl: p.url }));
    },
  },
  {
    id: 'url-too-long',
    category: 'content',
    severity: 'notice',
    title: 'URL is too long',
    description: 'This page\'s URL is longer than 115 characters.',
    whyItMatters: 'Very long URLs are harder to share and remember, and can get truncated in search results.',
    howToFix: 'Shorten the URL path, ideally to a short, readable slug.',
    evaluate(ctx) {
      return ctx.pages
        .filter(p => p.url.length > 115)
        .map(p => ({ ruleId: 'url-too-long', pageUrl: p.url, details: { length: p.url.length } }));
    },
  },
  {
    id: 'duplicate-h1',
    category: 'content',
    severity: 'notice',
    title: 'Duplicate H1 headings',
    description: 'Two or more pages have the exact same H1 heading text.',
    whyItMatters: 'A shared H1 makes it harder for search engines to tell the pages\' topics apart.',
    howToFix: 'Write a distinct H1 for each page that reflects its specific content.',
    evaluate(ctx) {
      return duplicateGroups('duplicate-h1', ctx.pages, p => p.h1, 'h1');
    },
  },
];
