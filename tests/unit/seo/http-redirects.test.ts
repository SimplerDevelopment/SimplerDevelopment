import { describe, expect, it } from 'vitest';
import type { SeoPageMeta } from '@/lib/db/schema';
import { rules as httpRules } from '@/lib/seo/rules/http';
import { rules as redirectsRules } from '@/lib/seo/rules/redirects';
import { makeCtx, makePage } from './fixtures';

const rule = (id: string) => {
  const found = [...httpRules, ...redirectsRules].find(r => r.id === id);
  if (!found) throw new Error(`no rule "${id}"`);
  return found;
};

describe('http.ts', () => {
  it('page-4xx fires on a 400-499 status', () => {
    const page = makePage({ httpStatus: 404 });
    const issues = rule('page-4xx').evaluate(makeCtx([page]));
    expect(issues).toEqual([{ ruleId: 'page-4xx', pageUrl: page.url, details: { httpStatus: 404 } }]);
  });

  it('page-5xx fires on a 500+ status', () => {
    const page = makePage({ httpStatus: 503 });
    const issues = rule('page-5xx').evaluate(makeCtx([page]));
    expect(issues).toEqual([{ ruleId: 'page-5xx', pageUrl: page.url, details: { httpStatus: 503 } }]);
  });

  it('slow-response fires on a 200 page over 1500ms', () => {
    const page = makePage({ httpStatus: 200, responseTimeMs: 3000 });
    const issues = rule('slow-response').evaluate(makeCtx([page]));
    expect(issues).toEqual([{ ruleId: 'slow-response', pageUrl: page.url, details: { responseTimeMs: 3000 } }]);
  });

  it('large-page fires when responseBytes exceeds 2MB', () => {
    const page = makePage({ responseBytes: 3_000_000 });
    const issues = rule('large-page').evaluate(makeCtx([page]));
    expect(issues).toEqual([{ ruleId: 'large-page', pageUrl: page.url, details: { responseBytes: 3_000_000 } }]);
  });
});

describe('redirects.ts', () => {
  it('redirect-chain fires when the chain has 2+ hops', () => {
    const chain = ['https://example.com/a', 'https://example.com/b'];
    const page = makePage({ redirectChain: chain });
    const issues = rule('redirect-chain').evaluate(makeCtx([page]));
    expect(issues).toEqual([{ ruleId: 'redirect-chain', pageUrl: page.url, details: { chain, hops: 2 } }]);
  });

  it('redirect-loop fires when a URL repeats in the chain', () => {
    const chain = ['https://example.com/a', 'https://example.com/b', 'https://example.com/a'];
    const page = makePage({ redirectChain: chain });
    const issues = rule('redirect-loop').evaluate(makeCtx([page]));
    expect(issues).toEqual([{ ruleId: 'redirect-loop', pageUrl: page.url, details: { chain } }]);
  });

  it('redirect-loop does not fire on a non-repeating chain', () => {
    const chain = ['https://example.com/a', 'https://example.com/b'];
    const page = makePage({ redirectChain: chain });
    expect(rule('redirect-loop').evaluate(makeCtx([page]))).toEqual([]);
  });

  it('meta-refresh fires when meta.metaRefresh is true', () => {
    const base = makePage();
    const page = makePage({ meta: { ...base.meta, metaRefresh: true } as SeoPageMeta });
    const issues = rule('meta-refresh').evaluate(makeCtx([page]));
    expect(issues).toEqual([{ ruleId: 'meta-refresh', pageUrl: page.url }]);
  });
});
