/**
 * CMS posts — list, create, read, update, delete + revision snapshot on edit.
 *
 * Contract:
 *   - 401 unauth, 404 wrong tenant
 *   - POST: title+slug+content required (400 otherwise), slug unique per website (400)
 *   - PUT: creates a postRevisions row when content is included
 *   - PUT: changing slug rejects on collision, allows on unique
 *   - publish=true stamps publishedAt
 *   - DELETE removes the row (tenant-scoped)
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/revalidate-client-site', () => ({
  revalidateClientSite: vi.fn().mockResolvedValue(undefined),
  clientSiteUrl: () => null,
}));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../helpers/test-db';

async function seedSite(ctx: TenantCtx, label = 'site'): Promise<{ siteId: number }> {
  const sql = getTestSql();
  const [s] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_websites (client_id, name, domain)
    VALUES (${ctx.client.id}, ${`${label}-${Date.now()}`}, ${`${label}-${Date.now()}.test`})
    RETURNING id
  `;
  return { siteId: s.id };
}

async function seedPost(
  siteId: number,
  overrides: { slug?: string; title?: string; published?: boolean } = {},
): Promise<{ id: number; slug: string }> {
  const sql = getTestSql();
  const slug = overrides.slug ?? `post-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  const [row] = await sql<{ id: number; slug: string }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.posts (
      website_id, title, slug, post_type, content, published
    ) VALUES (
      ${siteId}, ${overrides.title ?? 'Test Post'}, ${slug}, 'blog',
      ${JSON.stringify({ blocks: [] })}, ${overrides.published ?? false}
    ) RETURNING id, slug
  `;
  return row;
}

describe('CMS posts — list @cms', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('cms-list'); });

  it('401 unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const { siteId } = await seedSite(A);
    const route = await import('@/app/api/portal/cms/websites/[siteId]/posts/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { siteId: String(siteId) } },
    );
    expect(res.status).toBe(401);
  });

  it('404 when siteId is not in the caller\'s tenant', async () => {
    const B = await sessionForNewClientUser('cms-list-b');
    const { siteId: foreignSite } = await seedSite(B);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/cms/websites/[siteId]/posts/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { siteId: String(foreignSite) } },
    );
    expect(res.status).toBe(404);
  });

  it('returns posts scoped to the site', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    await seedPost(siteId, { slug: 'hello' });
    await seedPost(siteId, { slug: 'world' });

    const route = await import('@/app/api/portal/cms/websites/[siteId]/posts/route');
    const res = await callHandler<{ success: boolean; data: { slug: string }[] }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { siteId: String(siteId) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.map(p => p.slug).sort()).toEqual(['hello', 'world']);
  });
});

describe('CMS posts — create @cms', () => {
  let A: TenantCtx;
  let siteId: number;
  beforeEach(async () => {
    A = await sessionForNewClientUser('cms-create');
    ({ siteId } = await seedSite(A));
    mockedAuth.mockResolvedValue(A.session);
  });

  it('400 when required fields are missing', async () => {
    const route = await import('@/app/api/portal/cms/websites/[siteId]/posts/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId) }, body: { title: 'only title' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/title, slug, and content/i);
  });

  it('creates the row + 200 on a valid create', async () => {
    const route = await import('@/app/api/portal/cms/websites/[siteId]/posts/route');
    const res = await callHandler<{ success: boolean; data: { id: number; slug: string } }>(
      route as unknown as Record<string, unknown>, 'POST',
      {
        params: { siteId: String(siteId) },
        body: {
          title: 'Fresh', slug: 'fresh-post',
          content: JSON.stringify({ blocks: [] }),
          postType: 'blog',
        },
      },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.slug).toBe('fresh-post');

    const sql = getTestSql();
    const [row] = await sql<{ website_id: number }[]>`
      SELECT website_id FROM ${sql(TEST_SCHEMA)}.posts WHERE id = ${res.data!.data.id}
    `;
    expect(row.website_id).toBe(siteId);
  });

  it('rejects a duplicate slug within the same site', async () => {
    await seedPost(siteId, { slug: 'dup' });
    const route = await import('@/app/api/portal/cms/websites/[siteId]/posts/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      {
        params: { siteId: String(siteId) },
        body: { title: 'Another', slug: 'dup', content: JSON.stringify({ blocks: [] }) },
      },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/slug/i);
  });

  it('allows the same slug on a different site', async () => {
    const { siteId: secondSite } = await seedSite(A, 'site2');
    await seedPost(siteId, { slug: 'same' });

    const route = await import('@/app/api/portal/cms/websites/[siteId]/posts/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      {
        params: { siteId: String(secondSite) },
        body: { title: 'Same slug', slug: 'same', content: JSON.stringify({ blocks: [] }) },
      },
    );
    expect(res.status).toBe(200);
  });
});

describe('CMS posts — update + revisions @cms', () => {
  let A: TenantCtx;
  let siteId: number;
  let postId: number;
  beforeEach(async () => {
    A = await sessionForNewClientUser('cms-update');
    ({ siteId } = await seedSite(A));
    const p = await seedPost(siteId, { slug: 'original' });
    postId = p.id;
    mockedAuth.mockResolvedValue(A.session);
  });

  it('creates a post_revisions row when content is included in PUT', async () => {
    const route = await import('@/app/api/portal/cms/websites/[siteId]/posts/[postId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      {
        params: { siteId: String(siteId), postId: String(postId) },
        body: { content: JSON.stringify({ blocks: [{ type: 'text' }] }), revisionTrigger: 'manual' },
      },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const rows = await sql<{ trigger: string; post_id: number }[]>`
      SELECT trigger, post_id FROM ${sql(TEST_SCHEMA)}.post_revisions WHERE post_id = ${postId}
    `;
    expect(rows.length).toBe(1);
    expect(rows[0].trigger).toBe('manual');
  });

  it('stamps publishedAt when publishing + records a publish revision', async () => {
    const route = await import('@/app/api/portal/cms/websites/[siteId]/posts/[postId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      {
        params: { siteId: String(siteId), postId: String(postId) },
        body: { published: true, content: JSON.stringify({ blocks: [] }) },
      },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const [row] = await sql<{ published: boolean; published_at: Date | null }[]>`
      SELECT published, published_at FROM ${sql(TEST_SCHEMA)}.posts WHERE id = ${postId}
    `;
    expect(row.published).toBe(true);
    expect(row.published_at).not.toBeNull();

    const [rev] = await sql<{ trigger: string }[]>`
      SELECT trigger FROM ${sql(TEST_SCHEMA)}.post_revisions WHERE post_id = ${postId}
    `;
    expect(rev.trigger).toBe('publish');
  });

  it('rejects a slug collision with another post on the same site', async () => {
    await seedPost(siteId, { slug: 'taken' });
    const route = await import('@/app/api/portal/cms/websites/[siteId]/posts/[postId]/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'PUT',
      {
        params: { siteId: String(siteId), postId: String(postId) },
        body: { slug: 'taken' },
      },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/slug already exists/i);
  });

  it('allows re-saving with the same slug (idempotent)', async () => {
    const route = await import('@/app/api/portal/cms/websites/[siteId]/posts/[postId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      {
        params: { siteId: String(siteId), postId: String(postId) },
        body: { slug: 'original', title: 'new title' },
      },
    );
    expect(res.status).toBe(200);
  });

  it('404 when postId is in a different site (cross-tenant)', async () => {
    const B = await sessionForNewClientUser('cms-cross');
    const { siteId: foreignSite } = await seedSite(B);
    const foreign = await seedPost(foreignSite, { slug: 'foreign' });
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/cms/websites/[siteId]/posts/[postId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      {
        params: { siteId: String(siteId), postId: String(foreign.id) },
        body: { title: 'hijack' },
      },
    );
    expect(res.status).toBe(404);
  });
});

describe('CMS posts — delete @cms', () => {
  it('deletes a post owned by the caller', async () => {
    const A = await sessionForNewClientUser('cms-delete');
    const { siteId } = await seedSite(A);
    const p = await seedPost(siteId);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/cms/websites/[siteId]/posts/[postId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { siteId: String(siteId), postId: String(p.id) } },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.posts WHERE id = ${p.id}
    `;
    expect(rows.length).toBe(0);
  });

  it('does NOT delete a post from a different tenant (silent no-op, 200)', async () => {
    const A = await sessionForNewClientUser('cms-del-a');
    const B = await sessionForNewClientUser('cms-del-b');
    const { siteId: siteA } = await seedSite(A);
    const { siteId: siteB } = await seedSite(B);
    const p = await seedPost(siteB);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/cms/websites/[siteId]/posts/[postId]/route');
    await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { siteId: String(siteA), postId: String(p.id) } },
    );

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.posts WHERE id = ${p.id}
    `;
    expect(rows.length).toBe(1);   // B's post still exists
  });
});
