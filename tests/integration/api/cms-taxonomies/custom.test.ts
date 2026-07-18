/**
 * CMS taxonomies — custom registration, query, delete @cms @taxonomies @custom
 *
 * Routes:
 *   GET  /api/portal/cms/websites/[siteId]/taxonomies                  → list
 *   POST /api/portal/cms/websites/[siteId]/taxonomies                  → register
 *
 * Contract:
 *   - 401 unauthenticated
 *   - 401/404 cross-tenant (siteId not owned)
 *   - 400 missing name/slug
 *   - 409 duplicate slug within the same site
 *   - Same slug allowed on a different site
 *   - GET returns site-specific custom taxonomies + global built-ins
 *   - DELETE on a sibling [taxonomyId] route ([..]/terms is the only verb
 *     surface for terms; taxonomy itself has no DELETE today — query only)
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

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

async function seedBuiltInTaxonomy(slug: string): Promise<{ id: number }> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.taxonomies (name, slug, hierarchical, website_id, built_in)
    VALUES (${slug}, ${slug}, false, NULL, true)
    RETURNING id
  `;
  return row;
}

describe('Taxonomies — custom register @cms @taxonomies @custom', () => {
  let A: TenantCtx;
  let siteId: number;

  beforeEach(async () => {
    A = await sessionForNewClientUser('cms-tax-custom');
    ({ siteId } = await seedSite(A));
  });

  it('401 unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/cms/websites/[siteId]/taxonomies/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      {
        params: { siteId: String(siteId) },
        body: { name: 'Genre', slug: 'genre' },
      },
    );
    expect(res.status).toBe(401);
  });

  it('401 when siteId is not owned by the caller (cross-tenant)', async () => {
    const B = await sessionForNewClientUser('cms-tax-cross');
    const { siteId: foreign } = await seedSite(B);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/cms/websites/[siteId]/taxonomies/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      {
        params: { siteId: String(foreign) },
        body: { name: 'Hijack', slug: 'hijack' },
      },
    );
    expect(res.status).toBe(401);
  });

  it('400 when name or slug missing', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/cms/websites/[siteId]/taxonomies/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId) }, body: { name: 'No Slug' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/name and slug/i);
  });

  it('registers a custom taxonomy + persists builtIn=false, hierarchical=false default', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/cms/websites/[siteId]/taxonomies/route');
    const ts = Date.now();
    const res = await callHandler<{ success: boolean; data: { id: number; slug: string } }>(
      route as unknown as Record<string, unknown>, 'POST',
      {
        params: { siteId: String(siteId) },
        body: { name: 'Genre', slug: `genre-${ts}`, description: 'Music genre' },
      },
    );
    expect(res.status).toBe(201);
    expect(res.data!.data.slug).toBe(`genre-${ts}`);

    const sql = getTestSql();
    const [row] = await sql<{ website_id: number; built_in: boolean; hierarchical: boolean; description: string | null }[]>`
      SELECT website_id, built_in, hierarchical, description FROM ${sql(TEST_SCHEMA)}.taxonomies
      WHERE id = ${res.data!.data.id}
    `;
    expect(row.website_id).toBe(siteId);
    expect(row.built_in).toBe(false);
    expect(row.hierarchical).toBe(false);
    expect(row.description).toBe('Music genre');
  });

  it('409 on duplicate slug within the same site', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/cms/websites/[siteId]/taxonomies/route');
    const ts = Date.now();
    const r1 = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId) }, body: { name: 'X', slug: `dup-${ts}` } },
    );
    expect(r1.status).toBe(201);

    const r2 = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId) }, body: { name: 'X', slug: `dup-${ts}` } },
    );
    expect(r2.status).toBe(409);
  });

  it('allows the same slug on a different site', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId: site2 } = await seedSite(A, 'site-two');
    const route = await import('@/app/api/portal/cms/websites/[siteId]/taxonomies/route');
    const ts = Date.now();

    const r1 = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId) }, body: { name: 'A', slug: `same-${ts}` } },
    );
    const r2 = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(site2) }, body: { name: 'A', slug: `same-${ts}` } },
    );
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
  });
});

describe('Taxonomies — query (list) @cms @taxonomies @custom', () => {
  let A: TenantCtx;
  let siteId: number;

  beforeEach(async () => {
    A = await sessionForNewClientUser('cms-tax-list');
    ({ siteId } = await seedSite(A));
    mockedAuth.mockResolvedValue(A.session);
  });

  it('returns only this site\'s custom taxonomies + global built-ins', async () => {
    const sql = getTestSql();
    // Seed: one custom on this site, one custom on another tenant, one global built-in
    const ts = Date.now();
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.taxonomies (name, slug, hierarchical, website_id, built_in)
      VALUES (${'Mine'}, ${`mine-${ts}`}, false, ${siteId}, false)
    `;
    const B = await sessionForNewClientUser('cms-tax-list-b');
    const { siteId: foreign } = await seedSite(B);
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.taxonomies (name, slug, hierarchical, website_id, built_in)
      VALUES (${'Theirs'}, ${`theirs-${ts}`}, false, ${foreign}, false)
    `;
    const builtIn = await seedBuiltInTaxonomy(`category-${ts}`);

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/cms/websites/[siteId]/taxonomies/route');
    const res = await callHandler<{ success: boolean; data: Array<{ name: string; id: number }> }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { siteId: String(siteId) } },
    );
    expect(res.status).toBe(200);
    const names = res.data!.data.map(d => d.name);
    expect(names).toContain('Mine');
    expect(names).not.toContain('Theirs');
    // Global built-in is included
    const ids = res.data!.data.map(d => d.id);
    expect(ids).toContain(builtIn.id);
  });
});

describe('Taxonomies — delete (via terms cleanup) @cms @taxonomies @custom', () => {
  // Taxonomy delete itself is not exposed (no DELETE on /taxonomies/[taxonomyId])
  // — terms can be deleted, and removing a taxonomy is admin-only/migration-only.
  // We pin that surface: there is no DELETE handler on the taxonomies route file.

  it('the taxonomies module exposes only GET + POST, no DELETE', async () => {
    const route = await import('@/app/api/portal/cms/websites/[siteId]/taxonomies/route') as Record<string, unknown>;
    expect(typeof route.GET).toBe('function');
    expect(typeof route.POST).toBe('function');
    expect(route.DELETE).toBeUndefined();
  });

  it('terms route exposes DELETE for the per-term cleanup path', async () => {
    const route = await import('@/app/api/portal/cms/websites/[siteId]/taxonomies/[taxonomyId]/terms/[termId]/route') as Record<string, unknown>;
    expect(typeof route.DELETE).toBe('function');
  });
});
