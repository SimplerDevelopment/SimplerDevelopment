// JSON-LD structured data checks.

import type { SeoPageMeta } from '@/lib/db/schema';
import type { SeoRule } from '@/lib/seo/types';

// jsonLdParseErrors is an extraction-side extra field, not yet declared on
// SeoPageMeta (see the caller's NOTE) — cast locally.
type MetaExtras = { jsonLdParseErrors?: number };

export const rules: SeoRule[] = [
  {
    id: 'json-ld-invalid',
    category: 'structured-data',
    severity: 'warning',
    title: 'Invalid JSON-LD',
    description: 'This page has JSON-LD structured data that failed to parse.',
    whyItMatters: 'Malformed structured data is ignored by search engines, so any rich-result eligibility it was meant to unlock is lost.',
    howToFix: 'Run the JSON-LD through a validator and fix the syntax error it reports.',
    evaluate(ctx) {
      return ctx.pages
        .filter(p => ((p.meta as SeoPageMeta & MetaExtras)?.jsonLdParseErrors ?? 0) > 0)
        .map(p => ({
          ruleId: 'json-ld-invalid',
          pageUrl: p.url,
          details: { jsonLdParseErrors: (p.meta as SeoPageMeta & MetaExtras).jsonLdParseErrors },
        }));
    },
  },
  {
    id: 'no-structured-data',
    category: 'structured-data',
    severity: 'notice',
    title: 'No structured data',
    description: 'This page has no JSON-LD structured data.',
    whyItMatters: 'Structured data helps search engines understand and sometimes richly display your content — its absence is a missed opportunity, not a broken page.',
    howToFix: 'Add relevant JSON-LD, such as Article, Product, or Organization schema, depending on what the page is about.',
    evaluate(ctx) {
      return ctx.pages
        .filter(p => p.httpStatus === 200 && p.indexable === true && (!p.meta?.jsonLdTypes || p.meta.jsonLdTypes.length === 0))
        .map(p => ({
          ruleId: 'no-structured-data',
          pageUrl: p.url,
        }));
    },
  },
];
