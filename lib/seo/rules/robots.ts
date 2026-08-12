// Site-level robots.txt presence check. Per-directive crawlability is
// parsed upstream by the crawler (lib/seo/robots.ts, note: different file —
// that one is the robots.txt parser, this one is the audit rule); this rule
// only flags the case where there's no robots.txt at all.

import type { SeoRule } from '@/lib/seo/types';

export const rules: SeoRule[] = [
  {
    id: 'robots-txt-missing',
    category: 'robots',
    severity: 'notice',
    title: 'No robots.txt found',
    description: 'We couldn\'t find a robots.txt file for this site.',
    whyItMatters: 'Without robots.txt, you have no standard way to point search engines at your sitemap or steer them away from pages you\'d rather keep out of the crawl.',
    howToFix: 'Add a robots.txt file at the root of your domain — even a minimal one that just references your sitemap.',
    evaluate(ctx) {
      if (ctx.robotsTxt !== null) return [];
      return [{ ruleId: 'robots-txt-missing' }];
    },
  },
];
