// @vitest-environment node
/**
 * app/sitemap.ts — the marketing sitemap's blog-post query.
 *
 * SEO-018: this query filtered on `published` alone while the route that
 * actually serves /blog/<slug> (getBlogPostBySlug in lib/actions/blog.ts)
 * requires four conditions. The sitemap therefore advertised ~154 URLs that
 * 404 — 77% of it — and, worse, rows with a non-null websiteId belong to a
 * CLIENT's website, so other tenants' slugs were being published on
 * simplerdevelopment.com.
 *
 * These assert on the WHERE clause rather than on output rows, because the
 * leak is defined by which predicates are present. A test that only checked
 * "returns some urls" would have passed happily throughout the bug.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const whereCalls: unknown[] = [];

vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => ({ op: 'and', args }),
  eq: (col: unknown, val: unknown) => ({ op: 'eq', col, val }),
  isNull: (col: unknown) => ({ op: 'isNull', col }),
}));

vi.mock('@/lib/db/schema', () => ({
  posts: {
    slug: { __col: 'slug' },
    updatedAt: { __col: 'updatedAt' },
    published: { __col: 'published' },
    postType: { __col: 'postType' },
    websiteId: { __col: 'websiteId' },
  },
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (clause: unknown) => {
          whereCalls.push(clause);
          return Promise.resolve([]);
        },
      }),
    }),
  },
}));

vi.mock('@/lib/data/solutions', () => ({ getAllSolutions: () => [] }));
vi.mock('@/lib/data/migrations', () => ({ getAllMigrations: () => [] }));
vi.mock('@/config/site', () => ({ siteConfig: { url: 'https://example.com' } }));
vi.mock('@/app/docs/_lib/nav', () => ({ ALL_SLUGS: [] }));

const sitemap = (await import('@/app/sitemap')).default;

/** Flatten the nested and()/eq()/isNull() marker tree into comparable tuples. */
function predicates(clause: unknown): string[] {
  const out: string[] = [];
  const walk = (n: unknown) => {
    const node = n as { op?: string; args?: unknown[]; col?: { __col?: string }; val?: unknown };
    if (!node || typeof node !== 'object') return;
    if (node.op === 'and') { (node.args ?? []).forEach(walk); return; }
    if (node.op === 'eq') out.push(`eq:${node.col?.__col}=${String(node.val)}`);
    if (node.op === 'isNull') out.push(`isNull:${node.col?.__col}`);
  };
  walk(clause);
  return out.sort();
}

describe('app/sitemap.ts — blog post scoping (SEO-018)', () => {
  beforeEach(() => { whereCalls.length = 0; });

  it('scopes blog posts to published, blog-type, marketing-site rows', async () => {
    await sitemap();
    expect(whereCalls).toHaveLength(1);
    expect(predicates(whereCalls[0])).toEqual([
      'eq:postType=blog',
      'eq:published=true',
      'isNull:websiteId',
    ]);
  });

  it('excludes client-website posts specifically', async () => {
    // The tenancy half, called out on its own: a non-null websiteId means the
    // row belongs to a client's site. Dropping this predicate would put other
    // tenants' slugs back into this site's public sitemap.
    await sitemap();
    expect(predicates(whereCalls[0])).toContain('isNull:websiteId');
  });
});
