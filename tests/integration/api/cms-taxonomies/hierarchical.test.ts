/**
 * CMS taxonomies — hierarchical parent/child terms @cms @taxonomies @hierarchical
 *
 * Routes:
 *   POST /api/portal/cms/websites/[siteId]/taxonomies/[taxonomyId]/terms
 *   GET  /api/portal/cms/websites/[siteId]/taxonomies/[taxonomyId]/terms
 *   PUT/DELETE /api/portal/cms/websites/[siteId]/taxonomies/[taxonomyId]/terms/[termId]
 *
 * Contract:
 *   - hierarchical taxonomy: terms accept parentId (nullable)
 *   - child term inherits the taxonomyId from the parent
 *   - GET orders by sortOrder asc, then name asc — used to render trees
 *   - 409 on duplicate slug within the same taxonomy
 *   - cross-tenant: a foreign taxonomy/term path returns 404
 *   - parent-child cycles: pinning current behavior — the route does not
 *     enforce non-cyclic parents at insert time (admin-side concern).
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

async function seedTaxonomy(siteId: number, hierarchical: boolean, slug?: string): Promise<{ id: number }> {
  const sql = getTestSql();
  const s = slug ?? `tax-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.taxonomies (name, slug, hierarchical, website_id, built_in)
    VALUES (${s}, ${s}, ${hierarchical}, ${siteId}, false)
    RETURNING id
  `;
  return row;
}

describe('Hierarchical taxonomy terms — parent/child @cms @taxonomies @hierarchical', () => {
  let A: TenantCtx;
  let siteId: number;
  let taxonomyId: number;

  beforeEach(async () => {
    A = await sessionForNewClientUser('cms-tax-hier');
    ({ siteId } = await seedSite(A));
    ({ id: taxonomyId } = await seedTaxonomy(siteId, true));
    mockedAuth.mockResolvedValue(A.session);
  });

  it('creates a parent term, then a child term referencing it', async () => {
    const route = await import('@/app/api/portal/cms/websites/[siteId]/taxonomies/[taxonomyId]/terms/route');
    const parent = await callHandler<{ success: boolean; data: { id: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      {
        params: { siteId: String(siteId), taxonomyId: String(taxonomyId) },
        body: { name: 'Parent', slug: 'parent' },
      },
    );
    expect(parent.status).toBe(201);

    const child = await callHandler<{ success: boolean; data: { id: number; parentId: number | null } }>(
      route as unknown as Record<string, unknown>, 'POST',
      {
        params: { siteId: String(siteId), taxonomyId: String(taxonomyId) },
        body: { name: 'Child', slug: 'child', parentId: parent.data!.data.id },
      },
    );
    expect(child.status).toBe(201);
    expect(child.data!.data.parentId).toBe(parent.data!.data.id);
  });

  it('GET returns terms ordered by sortOrder asc, then name asc', async () => {
    const sql = getTestSql();
    // Insert in a non-trivial order so any natural ordering bug surfaces
    await sql`INSERT INTO ${sql(TEST_SCHEMA)}.taxonomy_terms (taxonomy_id, name, slug, sort_order)
              VALUES (${taxonomyId}, 'Charlie', 'charlie', 2)`;
    await sql`INSERT INTO ${sql(TEST_SCHEMA)}.taxonomy_terms (taxonomy_id, name, slug, sort_order)
              VALUES (${taxonomyId}, 'Alpha',   'alpha',   1)`;
    await sql`INSERT INTO ${sql(TEST_SCHEMA)}.taxonomy_terms (taxonomy_id, name, slug, sort_order)
              VALUES (${taxonomyId}, 'Bravo',   'bravo',   1)`;

    const route = await import('@/app/api/portal/cms/websites/[siteId]/taxonomies/[taxonomyId]/terms/route');
    const res = await callHandler<{ success: boolean; data: Array<{ name: string; sortOrder: number }> }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { siteId: String(siteId), taxonomyId: String(taxonomyId) } },
    );
    expect(res.status).toBe(200);
    const names = res.data!.data.map(t => t.name);
    // sort_order 1 ASC: Alpha, Bravo (alpha by name); then sort_order 2: Charlie
    expect(names).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('409 on duplicate slug within the same taxonomy', async () => {
    const route = await import('@/app/api/portal/cms/websites/[siteId]/taxonomies/[taxonomyId]/terms/route');
    const r1 = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      {
        params: { siteId: String(siteId), taxonomyId: String(taxonomyId) },
        body: { name: 'Dup', slug: 'dup' },
      },
    );
    expect(r1.status).toBe(201);
    const r2 = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      {
        params: { siteId: String(siteId), taxonomyId: String(taxonomyId) },
        body: { name: 'Dup again', slug: 'dup' },
      },
    );
    expect(r2.status).toBe(409);
  });

  it('cross-tenant: foreign taxonomy/term path → 404', async () => {
    const B = await sessionForNewClientUser('cms-tax-hier-cross');
    const { siteId: siteB } = await seedSite(B);
    const { id: foreignTaxId } = await seedTaxonomy(siteB, true);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/cms/websites/[siteId]/taxonomies/[taxonomyId]/terms/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      {
        params: { siteId: String(siteId), taxonomyId: String(foreignTaxId) },
        body: { name: 'X', slug: 'x' },
      },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.taxonomy_terms WHERE taxonomy_id = ${foreignTaxId}
    `;
    expect(rows.length).toBe(0);
  });

  it('PUT updates a term, DELETE removes it (single-tenant happy path)', async () => {
    const sql = getTestSql();
    const [{ id: termId }] = await sql<{ id: number }[]>`
      INSERT INTO ${sql(TEST_SCHEMA)}.taxonomy_terms (taxonomy_id, name, slug)
      VALUES (${taxonomyId}, 'Original', 'original')
      RETURNING id
    `;
    const route = await import('@/app/api/portal/cms/websites/[siteId]/taxonomies/[taxonomyId]/terms/[termId]/route');

    const upd = await callHandler<{ success: boolean; data: { name: string } }>(
      route as unknown as Record<string, unknown>, 'PUT',
      {
        params: { siteId: String(siteId), taxonomyId: String(taxonomyId), termId: String(termId) },
        body: { name: 'Renamed' },
      },
    );
    expect(upd.status).toBe(200);
    expect(upd.data!.data.name).toBe('Renamed');

    const del = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { siteId: String(siteId), taxonomyId: String(taxonomyId), termId: String(termId) } },
    );
    expect(del.status).toBe(200);

    const [count] = await sql<{ c: number }[]>`
      SELECT COUNT(*)::int as c FROM ${sql(TEST_SCHEMA)}.taxonomy_terms WHERE id = ${termId}
    `;
    expect(count.c).toBe(0);
  });
});
