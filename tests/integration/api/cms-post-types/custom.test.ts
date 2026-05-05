/**
 * CMS post types ("content types") — register, custom fields per type, query
 * @cms @post-types @content-types @custom
 *
 * Routes:
 *   POST   /api/portal/cms/websites/[siteId]/content-types
 *   GET    /api/portal/cms/websites/[siteId]/content-types
 *   PUT/DELETE /api/portal/cms/websites/[siteId]/content-types/[typeId]
 *   POST/GET   /api/portal/cms/websites/[siteId]/content-types/[typeId]/fields
 *   PUT/DELETE /api/portal/cms/websites/[siteId]/content-types/[typeId]/fields/[fieldId]
 *   GET    /api/portal/cms/websites/[siteId]/posts?postType=<slug>     (query by type)
 *
 * Contract:
 *   - 401 unauthenticated
 *   - 401 on cross-tenant siteId
 *   - 400 missing name/slug on register
 *   - 409 duplicate slug within site (or against a global)
 *   - GET returns site-scoped + globals
 *   - Fields are scoped to a type; foreign type 401
 *   - Posts can be queried by post type slug (filters listing)
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

async function seedGlobalPostType(slug: string): Promise<{ id: number }> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.post_types (name, slug, website_id, active)
    VALUES (${slug}, ${slug}, NULL, true)
    RETURNING id
  `;
  return row;
}

describe('Content types — register custom @cms @post-types @custom', () => {
  let A: TenantCtx;
  let siteId: number;

  beforeEach(async () => {
    A = await sessionForNewClientUser('cms-pt-custom');
    ({ siteId } = await seedSite(A));
  });

  it('401 unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/cms/websites/[siteId]/content-types/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId) }, body: { name: 'X', slug: 'x' } },
    );
    expect(res.status).toBe(401);
  });

  it('401 cross-tenant', async () => {
    const B = await sessionForNewClientUser('cms-pt-cross');
    const { siteId: foreign } = await seedSite(B);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/cms/websites/[siteId]/content-types/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(foreign) }, body: { name: 'Hijack', slug: 'hijack' } },
    );
    expect(res.status).toBe(401);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.post_types WHERE slug = 'hijack' AND website_id = ${foreign}
    `;
    expect(rows.length).toBe(0);
  });

  it('400 when name or slug missing', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/cms/websites/[siteId]/content-types/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId) }, body: { name: 'No Slug' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/name and slug/i);
  });

  it('registers a custom type, scoped to siteId', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/cms/websites/[siteId]/content-types/route');
    const ts = Date.now();
    const res = await callHandler<{ success: boolean; data: { id: number; slug: string } }>(
      route as unknown as Record<string, unknown>, 'POST',
      {
        params: { siteId: String(siteId) },
        body: { name: 'Case Study', slug: `case-study-${ts}`, icon: 'work', description: 'Long-form work' },
      },
    );
    expect(res.status).toBe(201);
    expect(res.data!.data.slug).toBe(`case-study-${ts}`);

    const sql = getTestSql();
    const [row] = await sql<{ website_id: number; active: boolean }[]>`
      SELECT website_id, active FROM ${sql(TEST_SCHEMA)}.post_types WHERE id = ${res.data!.data.id}
    `;
    expect(row.website_id).toBe(siteId);
    expect(row.active).toBe(true);
  });

  it('409 on duplicate slug against a global built-in', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const ts = Date.now();
    await seedGlobalPostType(`blog-${ts}`);

    const route = await import('@/app/api/portal/cms/websites/[siteId]/content-types/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      {
        params: { siteId: String(siteId) },
        body: { name: 'Local Blog', slug: `blog-${ts}` },
      },
    );
    expect(res.status).toBe(409);
  });
});

describe('Content types — list (site + globals) @cms @post-types', () => {
  let A: TenantCtx;
  let siteId: number;

  beforeEach(async () => {
    A = await sessionForNewClientUser('cms-pt-list');
    ({ siteId } = await seedSite(A));
    mockedAuth.mockResolvedValue(A.session);
  });

  it('returns site-specific + global types, excludes other tenants', async () => {
    const sql = getTestSql();
    const ts = Date.now();
    // Mine
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.post_types (name, slug, website_id, active)
      VALUES (${'Mine'}, ${`mine-${ts}`}, ${siteId}, true)
    `;
    // Theirs
    const B = await sessionForNewClientUser('cms-pt-list-b');
    const { siteId: foreign } = await seedSite(B);
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.post_types (name, slug, website_id, active)
      VALUES (${'Theirs'}, ${`theirs-${ts}`}, ${foreign}, true)
    `;
    // Global
    await seedGlobalPostType(`global-${ts}`);

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/cms/websites/[siteId]/content-types/route');
    const res = await callHandler<{ success: boolean; data: Array<{ slug: string }> }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { siteId: String(siteId) } },
    );
    expect(res.status).toBe(200);
    const slugs = res.data!.data.map(d => d.slug);
    expect(slugs).toContain(`mine-${ts}`);
    expect(slugs).toContain(`global-${ts}`);
    expect(slugs).not.toContain(`theirs-${ts}`);
  });
});

describe('Content types — custom fields per type @cms @post-types @fields', () => {
  let A: TenantCtx;
  let siteId: number;
  let typeId: number;

  beforeEach(async () => {
    A = await sessionForNewClientUser('cms-pt-fields');
    ({ siteId } = await seedSite(A));
    const sql = getTestSql();
    const [t] = await sql<{ id: number }[]>`
      INSERT INTO ${sql(TEST_SCHEMA)}.post_types (name, slug, website_id, active)
      VALUES ('Project', ${`project-${Date.now()}`}, ${siteId}, true)
      RETURNING id
    `;
    typeId = t.id;
    mockedAuth.mockResolvedValue(A.session);
  });

  it('creates a text field, then a select field with options', async () => {
    const route = await import('@/app/api/portal/cms/websites/[siteId]/content-types/[typeId]/fields/route');
    const text = await callHandler<{ success: boolean; data: { id: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      {
        params: { siteId: String(siteId), typeId: String(typeId) },
        body: { name: 'Client Name', slug: 'client_name', fieldType: 'text', order: 0 },
      },
    );
    expect(text.status).toBe(201);

    const sel = await callHandler<{ success: boolean; data: { id: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      {
        params: { siteId: String(siteId), typeId: String(typeId) },
        body: { name: 'Status', slug: 'status', fieldType: 'select', options: ['Draft', 'Live'], order: 1 },
      },
    );
    expect(sel.status).toBe(201);

    const list = await callHandler<{ success: boolean; data: Array<{ slug: string; field_type?: string; fieldType: string }> }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { siteId: String(siteId), typeId: String(typeId) } },
    );
    expect(list.status).toBe(200);
    const slugs = list.data!.data.map(f => f.slug);
    expect(slugs).toEqual(['client_name', 'status']);
  });

  it('rejects parentId pointing at a field on a different type (400)', async () => {
    const sql = getTestSql();
    // Create a second type + a field on it
    const [t2] = await sql<{ id: number }[]>`
      INSERT INTO ${sql(TEST_SCHEMA)}.post_types (name, slug, website_id, active)
      VALUES ('Other', ${`other-${Date.now()}`}, ${siteId}, true) RETURNING id
    `;
    const [foreignField] = await sql<{ id: number }[]>`
      INSERT INTO ${sql(TEST_SCHEMA)}.custom_fields (post_type_id, name, slug, field_type, "order")
      VALUES (${t2.id}, 'Foreign', 'foreign', 'group', 0) RETURNING id
    `;

    const route = await import('@/app/api/portal/cms/websites/[siteId]/content-types/[typeId]/fields/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      {
        params: { siteId: String(siteId), typeId: String(typeId) },
        body: { name: 'Child', slug: 'child', fieldType: 'text', parentId: foreignField.id, order: 0 },
      },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/not a field on this content type/i);
  });

  it('cross-tenant: foreign typeId → 401, no field is created', async () => {
    const B = await sessionForNewClientUser('cms-pt-fields-cross');
    const { siteId: siteB } = await seedSite(B);
    const sql = getTestSql();
    const [foreignType] = await sql<{ id: number }[]>`
      INSERT INTO ${sql(TEST_SCHEMA)}.post_types (name, slug, website_id, active)
      VALUES ('Foreign', ${`foreign-${Date.now()}`}, ${siteB}, true) RETURNING id
    `;
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/cms/websites/[siteId]/content-types/[typeId]/fields/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      {
        params: { siteId: String(siteId), typeId: String(foreignType.id) },
        body: { name: 'Hijack', slug: 'hijack', fieldType: 'text', order: 0 },
      },
    );
    expect(res.status).toBe(401);

    const fields = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.custom_fields WHERE post_type_id = ${foreignType.id}
    `;
    expect(fields.length).toBe(0);
  });

  it('PUT updates a field; DELETE removes it', async () => {
    const create = await import('@/app/api/portal/cms/websites/[siteId]/content-types/[typeId]/fields/route');
    const cr = await callHandler<{ success: boolean; data: { id: number } }>(
      create as unknown as Record<string, unknown>, 'POST',
      {
        params: { siteId: String(siteId), typeId: String(typeId) },
        body: { name: 'Tmp', slug: 'tmp', fieldType: 'text', order: 0 },
      },
    );
    const fieldId = cr.data!.data.id;

    const upd = await import('@/app/api/portal/cms/websites/[siteId]/content-types/[typeId]/fields/[fieldId]/route');
    const r = await callHandler<{ success: boolean; data: { name: string } }>(
      upd as unknown as Record<string, unknown>, 'PUT',
      {
        params: { siteId: String(siteId), typeId: String(typeId), fieldId: String(fieldId) },
        body: { name: 'Renamed' },
      },
    );
    expect(r.status).toBe(200);
    expect(r.data!.data.name).toBe('Renamed');

    const del = await callHandler(
      upd as unknown as Record<string, unknown>, 'DELETE',
      { params: { siteId: String(siteId), typeId: String(typeId), fieldId: String(fieldId) } },
    );
    expect(del.status).toBe(200);
  });
});

describe('Posts — query by post type @cms @post-types @posts', () => {
  let A: TenantCtx;
  let siteId: number;

  beforeEach(async () => {
    A = await sessionForNewClientUser('cms-pt-query');
    ({ siteId } = await seedSite(A));
    mockedAuth.mockResolvedValue(A.session);
  });

  /**
   * The /posts route returns ALL posts on a site — filtering by post type
   * is performed client-side from the data. We verify that both types of
   * posts are returned and their post_type column is preserved verbatim,
   * which is what the UI relies on to filter.
   */
  it('list posts surfaces post_type for each row so the UI can filter', async () => {
    const sql = getTestSql();
    const ts = Date.now();
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.posts (website_id, title, slug, post_type, content, published)
      VALUES
        (${siteId}, 'A blog post', ${`blog-${ts}`}, 'blog', ${JSON.stringify({ blocks: [] })}, false),
        (${siteId}, 'A page',      ${`page-${ts}`}, 'page', ${JSON.stringify({ blocks: [] })}, false),
        (${siteId}, 'A case study',${`cs-${ts}`},   'case-study', ${JSON.stringify({ blocks: [] })}, false)
    `;
    const route = await import('@/app/api/portal/cms/websites/[siteId]/posts/route');
    const res = await callHandler<{ success: boolean; data: Array<{ slug: string; postType: string }> }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { siteId: String(siteId) } },
    );
    expect(res.status).toBe(200);
    const types = new Set(res.data!.data.map(p => p.postType));
    expect(types.has('blog')).toBe(true);
    expect(types.has('page')).toBe(true);
    expect(types.has('case-study')).toBe(true);
  });
});
