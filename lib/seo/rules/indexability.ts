// Indexability signal checks — noindex/robots-blocked pages, and the case
// where a page told search engines to skip it but the site still links to
// it as if it should be found.

import type { SeoIssueDraft, SeoRule } from '@/lib/seo/types';

export const rules: SeoRule[] = [
  {
    id: 'noindex-page',
    category: 'indexability',
    severity: 'notice',
    title: 'Page is set to noindex',
    description: 'This page has a noindex meta tag, so search engines won\'t include it in results.',
    whyItMatters: 'Noindex is often intentional, but it\'s worth confirming this page really isn\'t meant to be found in search.',
    howToFix: 'If this page should be searchable, remove the noindex tag. If not, no action is needed.',
    evaluate(ctx) {
      return ctx.pages
        .filter(p => p.indexabilityReason === 'noindex-meta')
        .map(p => ({ ruleId: 'noindex-page', pageUrl: p.url }));
    },
  },
  {
    id: 'noindex-internally-linked',
    category: 'indexability',
    severity: 'warning',
    title: 'Noindex page is still linked internally',
    description: 'This page is set to noindex, but other pages on your site still link to it.',
    whyItMatters: 'Linking to a noindex page from elsewhere on your site wastes link equity that could flow to a page you actually want ranked.',
    howToFix: 'Remove internal links to this page, or remove the noindex tag if it should be indexed after all.',
    evaluate(ctx) {
      const pagesById = new Map(ctx.pages.map(p => [p.id, p]));
      const linkedFrom = new Map<number, string[]>();
      for (const link of ctx.links) {
        if (!link.isInternal || link.toPageId == null) continue;
        const target = pagesById.get(link.toPageId);
        if (!target || target.indexabilityReason !== 'noindex-meta') continue;
        const source = pagesById.get(link.fromPageId);
        if (!source) continue;
        const list = linkedFrom.get(link.toPageId) ?? [];
        list.push(source.url);
        linkedFrom.set(link.toPageId, list);
      }
      const issues: SeoIssueDraft[] = [];
      for (const [targetId, sources] of linkedFrom) {
        const target = pagesById.get(targetId)!;
        issues.push({ ruleId: 'noindex-internally-linked', pageUrl: target.url, details: { linkedFrom: sources } });
      }
      return issues;
    },
  },
  {
    id: 'robots-blocked',
    category: 'indexability',
    severity: 'notice',
    title: 'Page is blocked by robots.txt',
    description: 'This page is disallowed by robots.txt, so search engines won\'t crawl it.',
    whyItMatters: 'Robots.txt blocking is often intentional, but it\'s worth confirming this page really isn\'t meant to be crawled and indexed.',
    howToFix: 'If this page should be crawlable, update robots.txt to allow it. If not, no action is needed.',
    evaluate(ctx) {
      return ctx.pages
        .filter(p => p.indexabilityReason === 'robots-blocked')
        .map(p => ({ ruleId: 'robots-blocked', pageUrl: p.url }));
    },
  },
];
