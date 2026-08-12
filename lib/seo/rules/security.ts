// HTTPS / mixed-content hygiene checks.

import type { SeoPageMeta } from '@/lib/db/schema';
import type { SeoIssueDraft, SeoRule } from '@/lib/seo/types';

// insecureResourceCount is an extraction-side extra field, not yet declared
// on SeoPageMeta (see the caller's NOTE) — cast locally.
type MetaExtras = { insecureResourceCount?: number };

export const rules: SeoRule[] = [
  {
    id: 'http-links-from-https',
    category: 'security',
    severity: 'warning',
    title: 'HTTPS page links to HTTP internally',
    description: 'This page is served over HTTPS but has internal links pointing to the http:// version of your site.',
    whyItMatters: 'Linking to the http:// version forces an unnecessary extra redirect for every visitor and can trigger mixed-content warnings.',
    howToFix: 'Update internal links to use https:// consistently.',
    evaluate(ctx) {
      const pagesById = new Map(ctx.pages.map(p => [p.id, p]));
      const bySource = new Map<number, string[]>();
      for (const link of ctx.links) {
        if (!link.isInternal || !link.toUrl.startsWith('http://')) continue;
        const source = pagesById.get(link.fromPageId);
        if (!source || !source.url.startsWith('https://')) continue;
        const list = bySource.get(link.fromPageId) ?? [];
        list.push(link.toUrl);
        bySource.set(link.fromPageId, list);
      }
      const issues: SeoIssueDraft[] = [];
      for (const [fromId, urls] of bySource) {
        const source = pagesById.get(fromId)!;
        issues.push({ ruleId: 'http-links-from-https', pageUrl: source.url, details: { httpLinks: urls } });
      }
      return issues;
    },
  },
  {
    id: 'mixed-content',
    category: 'security',
    severity: 'warning',
    title: 'Mixed content',
    description: 'This HTTPS page loads one or more resources over plain HTTP.',
    whyItMatters: 'Browsers block or warn about insecure resources on an HTTPS page, which can break functionality or scare off visitors.',
    howToFix: 'Update image, script, and stylesheet URLs on this page to use https://.',
    evaluate(ctx) {
      return ctx.pages
        .filter(p => p.url.startsWith('https://') && ((p.meta as SeoPageMeta & MetaExtras)?.insecureResourceCount ?? 0) > 0)
        .map(p => ({
          ruleId: 'mixed-content',
          pageUrl: p.url,
          details: { insecureResourceCount: (p.meta as SeoPageMeta & MetaExtras).insecureResourceCount },
        }));
    },
  },
  {
    id: 'missing-hsts',
    category: 'security',
    severity: 'notice',
    title: 'Missing HSTS header',
    description: 'Your site serves HTTPS, but no crawled page returned a Strict-Transport-Security header.',
    whyItMatters: 'Without HSTS, browsers have no way to remember to always use HTTPS for your site, leaving a window open for downgrade attacks.',
    howToFix: 'Add a Strict-Transport-Security header to your server\'s HTTPS responses.',
    evaluate(ctx) {
      if (!ctx.baseUrl.startsWith('https://')) return [];
      const hasHsts = ctx.pages.some(p => {
        if (p.httpStatus !== 200) return false;
        const headers = p.meta?.headers;
        if (!headers) return false;
        return Object.keys(headers).some(k => k.toLowerCase() === 'strict-transport-security');
      });
      if (hasHsts) return [];
      return [{ ruleId: 'missing-hsts' }];
    },
  },
];
