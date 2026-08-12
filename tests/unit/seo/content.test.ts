import { describe, expect, it } from 'vitest';
import { rules } from '@/lib/seo/rules/content';
import { makeCtx, makePage } from './fixtures';

const rule = (id: string) => {
  const found = rules.find(r => r.id === id);
  if (!found) throw new Error(`no rule "${id}"`);
  return found;
};

describe('content.ts', () => {
  it('missing-h1 fires when h1Count is 0', () => {
    const page = makePage({ h1Count: 0 });
    expect(rule('missing-h1').evaluate(makeCtx([page]))).toEqual([{ ruleId: 'missing-h1', pageUrl: page.url }]);
  });

  it('multiple-h1 fires when h1Count is greater than 1', () => {
    const page = makePage({ h1Count: 2 });
    expect(rule('multiple-h1').evaluate(makeCtx([page]))).toEqual([
      { ruleId: 'multiple-h1', pageUrl: page.url, details: { h1Count: 2 } },
    ]);
  });

  it('thin-content fires below 100 words', () => {
    const page = makePage({ wordCount: 99 });
    expect(rule('thin-content').evaluate(makeCtx([page]))).toEqual([
      { ruleId: 'thin-content', pageUrl: page.url, details: { wordCount: 99 } },
    ]);
  });

  it('duplicate-content fires as one site-level issue for a shared contentHash group', () => {
    const a = makePage({ contentHash: 'shared-hash' });
    const b = makePage({ contentHash: 'shared-hash' });
    const c = makePage({ contentHash: 'other-hash' });
    const issues = rule('duplicate-content').evaluate(makeCtx([a, b, c]));
    expect(issues).toEqual([
      { ruleId: 'duplicate-content', details: { contentHash: 'shared-hash', urls: [a.url, b.url] } },
    ]);
  });

  it('missing-lang fires on a 200 HTML page with no lang', () => {
    const page = makePage({ lang: null });
    expect(rule('missing-lang').evaluate(makeCtx([page]))).toEqual([{ ruleId: 'missing-lang', pageUrl: page.url }]);
  });

  it('missing-lang stays silent on a non-HTML 200 response', () => {
    const page = makePage({ lang: null, contentType: 'application/json' });
    expect(rule('missing-lang').evaluate(makeCtx([page]))).toEqual([]);
  });

  it('url-too-long fires above 115 characters', () => {
    const url = `https://example.com/${'a'.repeat(100)}`;
    const page = makePage({ url });
    expect(rule('url-too-long').evaluate(makeCtx([page]))).toEqual([
      { ruleId: 'url-too-long', pageUrl: page.url, details: { length: url.length } },
    ]);
  });

  it('duplicate-h1 fires as one site-level issue for a shared H1 group', () => {
    const a = makePage({ h1: 'Shared Heading' });
    const b = makePage({ h1: 'Shared Heading' });
    const issues = rule('duplicate-h1').evaluate(makeCtx([a, b]));
    expect(issues).toEqual([
      { ruleId: 'duplicate-h1', details: { h1: 'Shared Heading', urls: [a.url, b.url] } },
    ]);
  });
});
