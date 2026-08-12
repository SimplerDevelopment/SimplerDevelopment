import { describe, expect, it } from 'vitest';
import type { SeoPageMeta } from '@/lib/db/schema';
import { rules } from '@/lib/seo/rules/metadata';
import { makeCtx, makePage } from './fixtures';

const rule = (id: string) => {
  const found = rules.find(r => r.id === id);
  if (!found) throw new Error(`no rule "${id}"`);
  return found;
};

describe('metadata.ts', () => {
  it('missing-title fires when title is empty', () => {
    const page = makePage({ title: '' });
    expect(rule('missing-title').evaluate(makeCtx([page]))).toEqual([{ ruleId: 'missing-title', pageUrl: page.url }]);
  });

  it('missing-title fires when title is null', () => {
    const page = makePage({ title: null });
    expect(rule('missing-title').evaluate(makeCtx([page]))).toEqual([{ ruleId: 'missing-title', pageUrl: page.url }]);
  });

  it('title-too-long fires above 60 characters', () => {
    const title = 'x'.repeat(61);
    const page = makePage({ title });
    expect(rule('title-too-long').evaluate(makeCtx([page]))).toEqual([
      { ruleId: 'title-too-long', pageUrl: page.url, details: { length: 61 } },
    ]);
  });

  it('title-too-short fires below 15 characters', () => {
    const title = 'x'.repeat(14);
    const page = makePage({ title });
    expect(rule('title-too-short').evaluate(makeCtx([page]))).toEqual([
      { ruleId: 'title-too-short', pageUrl: page.url, details: { length: 14 } },
    ]);
  });

  it('duplicate-title fires as one site-level issue for a shared title group', () => {
    const a = makePage({ title: 'Shared Title' });
    const b = makePage({ title: 'Shared Title' });
    const c = makePage({ title: 'Unique Title' });
    const issues = rule('duplicate-title').evaluate(makeCtx([a, b, c]));
    expect(issues).toEqual([
      { ruleId: 'duplicate-title', details: { title: 'Shared Title', urls: [a.url, b.url] } },
    ]);
  });

  it('missing-description fires when metaDescription is empty', () => {
    const page = makePage({ metaDescription: '' });
    expect(rule('missing-description').evaluate(makeCtx([page]))).toEqual([
      { ruleId: 'missing-description', pageUrl: page.url },
    ]);
  });

  it('description-too-long fires above 160 characters', () => {
    const metaDescription = 'x'.repeat(161);
    const page = makePage({ metaDescription });
    expect(rule('description-too-long').evaluate(makeCtx([page]))).toEqual([
      { ruleId: 'description-too-long', pageUrl: page.url, details: { length: 161 } },
    ]);
  });

  it('description-too-short fires below 50 characters', () => {
    const metaDescription = 'x'.repeat(49);
    const page = makePage({ metaDescription });
    expect(rule('description-too-short').evaluate(makeCtx([page]))).toEqual([
      { ruleId: 'description-too-short', pageUrl: page.url, details: { length: 49 } },
    ]);
  });

  it('duplicate-description fires as one site-level issue for a shared description group', () => {
    const shared = 'x'.repeat(80);
    const a = makePage({ metaDescription: shared });
    const b = makePage({ metaDescription: shared });
    const issues = rule('duplicate-description').evaluate(makeCtx([a, b]));
    expect(issues).toEqual([
      { ruleId: 'duplicate-description', details: { description: shared, urls: [a.url, b.url] } },
    ]);
  });

  it('missing-social-meta fires when neither ogTitle nor twitterCard is set', () => {
    const base = makePage();
    const meta = { ...base.meta, ogTitle: null, twitterCard: null } as SeoPageMeta;
    const page = makePage({ meta });
    expect(rule('missing-social-meta').evaluate(makeCtx([page]))).toEqual([
      { ruleId: 'missing-social-meta', pageUrl: page.url },
    ]);
  });

  it('missing-social-meta stays silent when only ogTitle is set', () => {
    const base = makePage();
    const meta = { ...base.meta, ogTitle: 'Has an OG title', twitterCard: null } as SeoPageMeta;
    const page = makePage({ meta });
    expect(rule('missing-social-meta').evaluate(makeCtx([page]))).toEqual([]);
  });
});
