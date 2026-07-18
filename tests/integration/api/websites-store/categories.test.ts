/**
 * Portal websites — STORE product categories (POST/PUT/DELETE).
 *
 * Cross-site rejection: A cannot read/write/delete B's categories even when
 * routing through their own siteId path with B's categoryId.
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
    VALUES (${ctx.client.id}, ${`${label}-${Date.now()}-${Math.random()}`}, ${`${label}-${Date.now()}-${Math.floor(Math.random() * 9999)}.test`})
    RETURNING id
  `;
  return { siteId: s.id };
}

async function seedCategory(siteId: number, slug?: string): Promise<{ id: number; slug: string }> {
  const sql = getTestSql();
  const s = slug ?? `cat-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  const [row] = await sql<{ id: number; slug: string }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.product_categories (website_id, name, slug)
    VALUES (${siteId}, 'Cat', ${s})
    RETURNING id, slug
  `;
  return row;
}

describe('POST /api/portal/websites/[siteId]/store/categories @websites @store', () => {
  let A: TenantCtx;

  beforeEach(async () => { A = await sessionForNewClientUser('store-cat-create'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const { siteId } = await seedSite(A);
    const route = await import('@/app/api/portal/websites/[siteId]/store/categories/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId) }, body: { name: 'X', slug: 'x' } },
    );
    expect(res.status).toBe(401);
  });

  it('400 when name or slug is missing', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const route = await import('@/app/api/portal/websites/[siteId]/store/categories/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId) }, body: { name: 'Only name' } },
    );
    expect(res.status).toBe(400);
  });

  it('201 happy path — created and scoped to the caller\'s site', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const slug = `accessories-${Date.now()}`;
    const route = await import('@/app/api/portal/websites/[siteId]/store/categories/route');
    const res = await callHandler<{ success: boolean; data: { id: number; websiteId: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId) }, body: { name: 'Accessories', slug } },
    );
    expect(res.status).toBe(201);
    expect(res.data?.data.websiteId).toBe(siteId);
  });

  it('409 on duplicate slug', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const slug = `dup-${Date.now()}`;
    await seedCategory(siteId, slug);
    const route = await import('@/app/api/portal/websites/[siteId]/store/categories/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId) }, body: { name: 'Dup', slug } },
    );
    expect(res.status).toBe(409);
  });

  it('cross-site rejection — A cannot create category under B\'s site', async () => {
    const B = await sessionForNewClientUser('store-cat-create-b');
    const { siteId: bSite } = await seedSite(B);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/websites/[siteId]/store/categories/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(bSite) }, body: { name: 'Sneak', slug: 'sneak' } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.product_categories WHERE website_id = ${bSite}
    `;
    expect(rows.length).toBe(0);
  });
});

describe('PUT /api/portal/websites/[siteId]/store/categories/[categoryId] @websites @store', () => {
  let A: TenantCtx;

  beforeEach(async () => { A = await sessionForNewClientUser('store-cat-update'); });

  it('happy path — updates name', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const cat = await seedCategory(siteId);
    const route = await import('@/app/api/portal/websites/[siteId]/store/categories/[categoryId]/route');
    const res = await callHandler<{ success: boolean; data: { name: string } }>(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { siteId: String(siteId), categoryId: String(cat.id) }, body: { name: 'Renamed' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.name).toBe('Renamed');
  });

  it('404 on missing categoryId', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const route = await import('@/app/api/portal/websites/[siteId]/store/categories/[categoryId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { siteId: String(siteId), categoryId: '999999' }, body: { name: 'X' } },
    );
    expect(res.status).toBe(404);
  });

  it('cross-site rejection — A cannot rename B\'s category', async () => {
    const B = await sessionForNewClientUser('store-cat-update-b');
    const { siteId: aSite } = await seedSite(A);
    const { siteId: bSite } = await seedSite(B);
    const bCat = await seedCategory(bSite);

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/websites/[siteId]/store/categories/[categoryId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { siteId: String(aSite), categoryId: String(bCat.id) }, body: { name: 'Hijack' } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const [check] = await sql<{ name: string }[]>`
      SELECT name FROM ${sql(TEST_SCHEMA)}.product_categories WHERE id = ${bCat.id}
    `;
    expect(check.name).toBe('Cat');
  });
});

describe('DELETE /api/portal/websites/[siteId]/store/categories/[categoryId] @websites @store', () => {
  let A: TenantCtx;

  beforeEach(async () => { A = await sessionForNewClientUser('store-cat-delete'); });

  it('happy path — deletes', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const cat = await seedCategory(siteId);
    const route = await import('@/app/api/portal/websites/[siteId]/store/categories/[categoryId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { siteId: String(siteId), categoryId: String(cat.id) } },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.product_categories WHERE id = ${cat.id}
    `;
    expect(rows.length).toBe(0);
  });

  it('404 on missing categoryId', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const route = await import('@/app/api/portal/websites/[siteId]/store/categories/[categoryId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { siteId: String(siteId), categoryId: '999999' } },
    );
    expect(res.status).toBe(404);
  });

  it('cross-site rejection — A cannot delete B\'s category', async () => {
    const B = await sessionForNewClientUser('store-cat-delete-b');
    const { siteId: aSite } = await seedSite(A);
    const { siteId: bSite } = await seedSite(B);
    const bCat = await seedCategory(bSite);

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/websites/[siteId]/store/categories/[categoryId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { siteId: String(aSite), categoryId: String(bCat.id) } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.product_categories WHERE id = ${bCat.id}
    `;
    expect(rows.length).toBe(1);
  });
});
