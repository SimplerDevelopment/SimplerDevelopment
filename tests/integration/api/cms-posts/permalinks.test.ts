/**
 * CMS posts — permalinks (slug uniqueness across post types) @cms @posts @permalinks
 *
 * Contract:
 *   - Slug uniqueness is enforced PER WEBSITE — not per (website, postType).
 *     i.e. you cannot have a 'blog' post and a 'page' post sharing one slug
 *     on the same site, because the public permalink would collide.
 *   - Same slug IS allowed on a different site (multi-tenant).
 *   - Custom postType is accepted on create (validated at the type registry
 *     elsewhere; the posts route itself accepts any non-empty string).
 *   - Updating slug to one already used by another post on the same site → 400.
 *   - Updating slug to its own current value (idempotent save) → 200.
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

describe('CMS posts — permalink/slug uniqueness @cms @posts @permalinks', () => {
  let A: TenantCtx;
  let siteId: number;

  beforeEach(async () => {
    A = await sessionForNewClientUser('cms-perma');
    ({ siteId } = await seedSite(A));
    mockedAuth.mockResolvedValue(A.session);
  });

  it('accepts a custom slug on create + persists it verbatim', async () => {
    const route = await import('@/app/api/portal/cms/websites/[siteId]/posts/route');
    const res = await callHandler<{ success: boolean; data: { slug: string } }>(
      route as unknown as Record<string, unknown>, 'POST',
      {
        params: { siteId: String(siteId) },
        body: {
          title: 'About Us',
          slug: 'about-our-team',
          content: JSON.stringify({ blocks: [] }),
          postType: 'page',
        },
      },
    );
    expect(res.status).toBe(200);
    expect(res.data!.data.slug).toBe('about-our-team');
  });

  it('rejects a duplicate slug on the same site even when post types differ', async () => {
    const route = await import('@/app/api/portal/cms/websites/[siteId]/posts/route');
    // First as a 'page'
    const create1 = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      {
        params: { siteId: String(siteId) },
        body: {
          title: 'About', slug: 'about',
          content: JSON.stringify({ blocks: [] }), postType: 'page',
        },
      },
    );
    expect(create1.status).toBe(200);

    // Second as a 'blog' — must collide because permalinks share the slug namespace
    const create2 = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      {
        params: { siteId: String(siteId) },
        body: {
          title: 'About post', slug: 'about',
          content: JSON.stringify({ blocks: [] }), postType: 'blog',
        },
      },
    );
    expect(create2.status).toBe(400);
    expect(create2.data?.message).toMatch(/slug/i);
  });

  it('allows the same slug on a separate site (multi-tenant permalink namespace)', async () => {
    const { siteId: site2 } = await seedSite(A, 'second');
    const route = await import('@/app/api/portal/cms/websites/[siteId]/posts/route');

    const r1 = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      {
        params: { siteId: String(siteId) },
        body: { title: 'A', slug: 'shared', content: JSON.stringify({ blocks: [] }) },
      },
    );
    expect(r1.status).toBe(200);

    const r2 = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      {
        params: { siteId: String(site2) },
        body: { title: 'B', slug: 'shared', content: JSON.stringify({ blocks: [] }) },
      },
    );
    expect(r2.status).toBe(200);
  });

  it('accepts a custom (non-built-in) postType on create', async () => {
    const route = await import('@/app/api/portal/cms/websites/[siteId]/posts/route');
    const res = await callHandler<{ success: boolean; data: { id: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      {
        params: { siteId: String(siteId) },
        body: {
          title: 'Case Study One',
          slug: 'case-study-one',
          content: JSON.stringify({ blocks: [] }),
          postType: 'case-study',
        },
      },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const [row] = await sql<{ post_type: string }[]>`
      SELECT post_type FROM ${sql(TEST_SCHEMA)}.posts WHERE id = ${res.data!.data.id}
    `;
    expect(row.post_type).toBe('case-study');
  });

  it('updating a slug to one used by another post on the same site → 400', async () => {
    const create = await import('@/app/api/portal/cms/websites/[siteId]/posts/route');
    const update = await import('@/app/api/portal/cms/websites/[siteId]/posts/[postId]/route');

    const a = await callHandler<{ success: boolean; data: { id: number } }>(
      create as unknown as Record<string, unknown>, 'POST',
      {
        params: { siteId: String(siteId) },
        body: { title: 'A', slug: 'first', content: JSON.stringify({ blocks: [] }) },
      },
    );
    const b = await callHandler<{ success: boolean; data: { id: number } }>(
      create as unknown as Record<string, unknown>, 'POST',
      {
        params: { siteId: String(siteId) },
        body: { title: 'B', slug: 'second', content: JSON.stringify({ blocks: [] }) },
      },
    );

    const collide = await callHandler<{ success: boolean; message: string }>(
      update as unknown as Record<string, unknown>, 'PUT',
      {
        params: { siteId: String(siteId), postId: String(b.data!.data.id) },
        body: { slug: 'first' },
      },
    );
    expect(collide.status).toBe(400);
    expect(collide.data?.message).toMatch(/slug/i);

    // 'a' must still own 'first'
    const sql = getTestSql();
    const [aRow] = await sql<{ slug: string }[]>`
      SELECT slug FROM ${sql(TEST_SCHEMA)}.posts WHERE id = ${a.data!.data.id}
    `;
    expect(aRow.slug).toBe('first');
  });

  it('updating a slug to its own current value → 200 (idempotent)', async () => {
    const create = await import('@/app/api/portal/cms/websites/[siteId]/posts/route');
    const update = await import('@/app/api/portal/cms/websites/[siteId]/posts/[postId]/route');

    const r = await callHandler<{ success: boolean; data: { id: number } }>(
      create as unknown as Record<string, unknown>, 'POST',
      {
        params: { siteId: String(siteId) },
        body: { title: 'X', slug: 'idempotent', content: JSON.stringify({ blocks: [] }) },
      },
    );
    const idem = await callHandler(
      update as unknown as Record<string, unknown>, 'PUT',
      {
        params: { siteId: String(siteId), postId: String(r.data!.data.id) },
        body: { slug: 'idempotent', title: 'X (saved again)' },
      },
    );
    expect(idem.status).toBe(200);
  });
});
