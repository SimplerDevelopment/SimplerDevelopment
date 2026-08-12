import { describe, expect, it } from 'vitest';
import { rules } from '@/lib/seo/rules/internal-links';
import { makeCtx, makeLink, makePage } from './fixtures';

const rule = (id: string) => {
  const found = rules.find(r => r.id === id);
  if (!found) throw new Error(`no rule "${id}"`);
  return found;
};

describe('internal-links.ts', () => {
  it('broken-internal-link fires, grouped per source page', () => {
    const source = makePage({ url: 'https://example.com/source' });
    const broken = makePage({ url: 'https://example.com/broken', httpStatus: 404 });
    const link = makeLink({ fromPageId: source.id, toPageId: broken.id, isInternal: true });
    const ctx = makeCtx([source, broken], { links: [link] });

    const issues = rule('broken-internal-link').evaluate(ctx);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ ruleId: 'broken-internal-link', pageUrl: source.url });
    expect(issues[0].details?.targets).toEqual([{ url: broken.url, httpStatus: 404, anchorText: link.anchorText }]);
  });

  it('broken-internal-link ignores an external link to a broken URL', () => {
    const source = makePage({ url: 'https://example.com/source' });
    const broken = makePage({ url: 'https://example.com/broken', httpStatus: 404 });
    const link = makeLink({ fromPageId: source.id, toPageId: broken.id, isInternal: false });
    expect(rule('broken-internal-link').evaluate(makeCtx([source, broken], { links: [link] }))).toEqual([]);
  });

  it('internal-link-to-redirect fires for a 300-399 target', () => {
    const source = makePage({ url: 'https://example.com/source' });
    const redirecting = makePage({ url: 'https://example.com/old', httpStatus: 301 });
    const link = makeLink({ fromPageId: source.id, toPageId: redirecting.id, isInternal: true });
    const issues = rule('internal-link-to-redirect').evaluate(makeCtx([source, redirecting], { links: [link] }));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ ruleId: 'internal-link-to-redirect', pageUrl: source.url });
  });

  it('internal-nofollow fires when an internal link is marked nofollow', () => {
    const source = makePage({ url: 'https://example.com/source' });
    const link = makeLink({ fromPageId: source.id, isInternal: true, nofollow: true, toUrl: 'https://example.com/target' });
    const issues = rule('internal-nofollow').evaluate(makeCtx([source], { links: [link] }));
    expect(issues).toEqual([
      { ruleId: 'internal-nofollow', pageUrl: source.url, details: { targets: [{ url: link.toUrl, anchorText: link.anchorText }] } },
    ]);
  });

  it('no-outgoing-internal fires for an indexable 200 page with zero internal links', () => {
    const page = makePage({ internalLinksCount: 0 });
    expect(rule('no-outgoing-internal').evaluate(makeCtx([page]))).toEqual([
      { ruleId: 'no-outgoing-internal', pageUrl: page.url },
    ]);
  });

  it('excessive-internal-links fires above 200', () => {
    const page = makePage({ internalLinksCount: 201 });
    expect(rule('excessive-internal-links').evaluate(makeCtx([page]))).toEqual([
      { ruleId: 'excessive-internal-links', pageUrl: page.url, details: { internalLinksCount: 201 } },
    ]);
  });

  it('orphan-page fires when page.orphan is true', () => {
    const page = makePage({ orphan: true });
    expect(rule('orphan-page').evaluate(makeCtx([page]))).toEqual([{ ruleId: 'orphan-page', pageUrl: page.url }]);
  });

  it('page-too-deep fires at depth >= 5', () => {
    const page = makePage({ depth: 5 });
    expect(rule('page-too-deep').evaluate(makeCtx([page]))).toEqual([
      { ruleId: 'page-too-deep', pageUrl: page.url, details: { depth: 5 } },
    ]);
  });
});
