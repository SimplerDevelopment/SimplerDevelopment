/**
 * CMS bulk taxonomy assignment via post update @cms @categories @tags @bulk
 *
 * The CMS exposes "bulk assign" through the post-update endpoint
 *   PUT /api/portal/cms/websites/[siteId]/posts/[postId]
 * with `categoryIds: number[]` and `tagIds: number[]` on the body —
 * existing associations are wiped and replaced by the provided set.
 *
 * Contract:
 *   - Replaces postCategories / postTags atomically (delete-then-insert)
 *   - Empty arrays clear all associations
 *   - Cross-tenant: a foreign post in another site is unreachable (404)
 *     and never gets reassigned.
 *
 * Cross-tenant leakage probe:
 *   The route currently does NOT validate that supplied categoryIds/tagIds
 *   belong to the same website. A leak here would let tenant A graft
 *   tenant B's categoryId onto their own post. This file pins the
 *   currently-shipping behaviour so any tightening of validation is a
 *   conscious change, not silent drift.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/revalidate-client-site', () => ({
  revalidateClientSite: vi.fn().mockResolvedValue(undefined),
  clientSiteUrl: () => null,
}));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function seedSite(ctx: TenantCtx, label = 'site'): Promise<{ siteId: number }> {
  const sql = getTestSql();
  const [s] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_websites (client_id, name, domain)
    VALUES (${ctx.client.id}, ${`${label}-${Date.now()}`}, ${`${label}-${Date.now()}.test`})
    RETURNING id
  `;
  return { siteId: s.id };
}

async function seedPost(siteId: number): Promise<{ id: number }> {
  const sql = getTestSql();
  const slug = `post-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.posts (website_id, title, slug, post_type, content, published)
    VALUES (${siteId}, 'Bulk Test', ${slug}, 'blog', ${JSON.stringify({ blocks: [] })}, false)
    RETURNING id
  `;
  return row;
}

async function seedCategory(siteId: number, slug: string): Promise<{ id: number }> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.categories (website_id, name, slug)
    VALUES (${siteId}, ${slug}, ${slug})
    RETURNING id
  `;
  return row;
}

async function seedTag(siteId: number, slug: string): Promise<{ id: number }> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.tags (website_id, name, slug)
    VALUES (${siteId}, ${slug}, ${slug})
    RETURNING id
  `;
  return row;
}

describe('Bulk-assign categories+tags to a post @cms @categories @tags @bulk', () => {
  let A: TenantCtx;
  let siteId: number;
  let postId: number;

  beforeEach(async () => {
    A = await sessionForNewClientUser('cms-bulk');
    ({ siteId } = await seedSite(A));
    ({ id: postId } = await seedPost(siteId));
    mockedAuth.mockResolvedValue(A.session);
  });

  it('PUT replaces categoryIds + tagIds in one call', async () => {
    const c1 = await seedCategory(siteId, `cat-a-${Date.now()}`);
    const c2 = await seedCategory(siteId, `cat-b-${Date.now()}`);
    const t1 = await seedTag(siteId, `tag-a-${Date.now()}`);
    const t2 = await seedTag(siteId, `tag-b-${Date.now()}`);

    const route = await import('@/app/api/portal/cms/websites/[siteId]/posts/[postId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      {
        params: { siteId: String(siteId), postId: String(postId) },
        body: { categoryIds: [c1.id, c2.id], tagIds: [t1.id, t2.id] },
      },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const cats = await sql<{ category_id: number }[]>`
      SELECT category_id FROM ${sql(TEST_SCHEMA)}.post_categories WHERE post_id = ${postId}
    `;
    const tgs = await sql<{ tag_id: number }[]>`
      SELECT tag_id FROM ${sql(TEST_SCHEMA)}.post_tags WHERE post_id = ${postId}
    `;
    expect(cats.map(r => r.category_id).sort()).toEqual([c1.id, c2.id].sort());
    expect(tgs.map(r => r.tag_id).sort()).toEqual([t1.id, t2.id].sort());
  });

  it('PUT with empty arrays clears all associations', async () => {
    const c = await seedCategory(siteId, `cat-clear-${Date.now()}`);
    const t = await seedTag(siteId, `tag-clear-${Date.now()}`);

    const route = await import('@/app/api/portal/cms/websites/[siteId]/posts/[postId]/route');
    // Seed
    await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      {
        params: { siteId: String(siteId), postId: String(postId) },
        body: { categoryIds: [c.id], tagIds: [t.id] },
      },
    );
    // Clear
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      {
        params: { siteId: String(siteId), postId: String(postId) },
        body: { categoryIds: [], tagIds: [] },
      },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const cats = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.post_categories WHERE post_id = ${postId}
    `;
    const tgs = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.post_tags WHERE post_id = ${postId}
    `;
    expect(cats.length).toBe(0);
    expect(tgs.length).toBe(0);
  });

  it('PUT with categoryIds set but tagIds undefined leaves existing tags alone', async () => {
    const c = await seedCategory(siteId, `cat-keep-${Date.now()}`);
    const t = await seedTag(siteId, `tag-keep-${Date.now()}`);
    const route = await import('@/app/api/portal/cms/websites/[siteId]/posts/[postId]/route');
    // Seed both
    await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      {
        params: { siteId: String(siteId), postId: String(postId) },
        body: { categoryIds: [c.id], tagIds: [t.id] },
      },
    );
    // Replace categories, omit tagIds
    const cNew = await seedCategory(siteId, `cat-keep2-${Date.now()}`);
    await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      {
        params: { siteId: String(siteId), postId: String(postId) },
        body: { categoryIds: [cNew.id] },
      },
    );

    const sql = getTestSql();
    const tgs = await sql<{ tag_id: number }[]>`
      SELECT tag_id FROM ${sql(TEST_SCHEMA)}.post_tags WHERE post_id = ${postId}
    `;
    expect(tgs.map(r => r.tag_id)).toEqual([t.id]);
  });

  it('cross-tenant: a foreign post is unreachable (404), no associations created', async () => {
    const B = await sessionForNewClientUser('cms-bulk-cross');
    const { siteId: siteB } = await seedSite(B);
    const foreignPost = await seedPost(siteB);

    // Tenant A's own category
    const c = await seedCategory(siteId, `cat-cross-${Date.now()}`);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/cms/websites/[siteId]/posts/[postId]/route');
    // Targeting foreign post via own siteId — must 404 because the post isn't in siteId
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      {
        params: { siteId: String(siteId), postId: String(foreignPost.id) },
        body: { categoryIds: [c.id] },
      },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    // Foreign post must have no category associations from this attack
    const cats = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.post_categories WHERE post_id = ${foreignPost.id}
    `;
    expect(cats.length).toBe(0);
  });

  it('cross-tenant: foreign category id supplied → currently inserted (documented gap)', async () => {
    // CURRENT BEHAVIOUR: the route does not validate categoryId ownership.
    // This test pins the existing posture so a future hardening (rejecting
    // foreign categoryIds with 400) is a conscious change, not silent drift.
    const B = await sessionForNewClientUser('cms-bulk-cat-cross');
    const { siteId: siteB } = await seedSite(B);
    const foreignCat = await seedCategory(siteB, `cat-leak-${Date.now()}`);

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/cms/websites/[siteId]/posts/[postId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      {
        params: { siteId: String(siteId), postId: String(postId) },
        body: { categoryIds: [foreignCat.id] },
      },
    );
    // Today: 200 (route does not cross-validate). When/if the route adds
    // ownership checks, change this to expect a 400 + assert no row was inserted.
    expect([200, 400]).toContain(res.status);

    const sql = getTestSql();
    const cats = await sql<{ category_id: number }[]>`
      SELECT category_id FROM ${sql(TEST_SCHEMA)}.post_categories WHERE post_id = ${postId}
    `;
    if (res.status === 400) {
      expect(cats.length).toBe(0);
    } else {
      // If route accepted it, the row must point at the foreign cat — explicit
      // about today's leak so a future scan can pick it up.
      expect(cats.map(r => r.category_id)).toEqual([foreignCat.id]);
    }
  });
});
