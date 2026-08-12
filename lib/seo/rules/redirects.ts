// Redirect-chain and meta-refresh checks.

import type { SeoPageMeta } from '@/lib/db/schema';
import type { SeoRule } from '@/lib/seo/types';

// metaRefresh is an extraction-side extra field on the meta jsonb bag, not
// yet declared on SeoPageMeta itself (see the caller's NOTE on the extra
// fields) — cast locally rather than touching the schema.
type MetaExtras = { metaRefresh?: boolean };

export const rules: SeoRule[] = [
  {
    id: 'redirect-chain',
    category: 'redirects',
    severity: 'warning',
    title: 'Redirect chain',
    description: 'This page redirects through more than one hop before reaching its final destination.',
    whyItMatters: 'Every extra hop adds delay for visitors and dilutes the link equity search engines pass through the chain.',
    howToFix: 'Point the original link straight at the final URL instead of chaining redirects.',
    evaluate(ctx) {
      return ctx.pages
        .filter(p => Array.isArray(p.redirectChain) && p.redirectChain.length >= 2)
        .map(p => ({
          ruleId: 'redirect-chain',
          pageUrl: p.url,
          details: { chain: p.redirectChain, hops: p.redirectChain.length },
        }));
    },
  },
  {
    id: 'redirect-loop',
    category: 'redirects',
    severity: 'critical',
    title: 'Redirect loop',
    description: 'This page\'s redirect chain revisits a URL it already passed through, so it never reaches a final destination.',
    whyItMatters: 'A redirect loop means the page never actually loads for visitors or search engines — it just keeps bouncing between the same URLs.',
    howToFix: 'Trace the chain and remove or rewrite whichever redirect rule sends traffic back to a URL already in the chain.',
    evaluate(ctx) {
      return ctx.pages
        .filter(p => {
          const chain = p.redirectChain;
          if (!Array.isArray(chain) || chain.length < 2) return false;
          return new Set(chain).size !== chain.length;
        })
        .map(p => ({
          ruleId: 'redirect-loop',
          pageUrl: p.url,
          details: { chain: p.redirectChain },
        }));
    },
  },
  {
    id: 'meta-refresh',
    category: 'redirects',
    severity: 'notice',
    title: 'Meta refresh redirect',
    description: 'This page redirects using a meta refresh tag instead of a server-side redirect.',
    whyItMatters: 'Meta refresh redirects are slower and less reliably followed by search engines than a proper HTTP redirect.',
    howToFix: 'Replace the meta refresh tag with a 301 (permanent) or 302 (temporary) server-side redirect.',
    evaluate(ctx) {
      return ctx.pages
        .filter(p => (p.meta as SeoPageMeta & MetaExtras)?.metaRefresh === true)
        .map(p => ({
          ruleId: 'meta-refresh',
          pageUrl: p.url,
        }));
    },
  },
];
