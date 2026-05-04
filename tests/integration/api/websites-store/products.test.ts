/**
 * Portal websites — STORE products (POST/PUT/DELETE).
 *
 * Cross-site isolation is the load-bearing class here. Tenant A must never be
 * able to read, mutate, or delete a product that belongs to tenant B's site,
 * even if A guesses the productId or routes through their own siteId path.
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

async function seedProduct(siteId: number, slug?: string): Promise<{ id: number; slug: string }> {
  const sql = getTestSql();
  const s = slug ?? `prod-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  const [row] = await sql<{ id: number; slug: string }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.products (website_id, name, slug, price, status)
    VALUES (${siteId}, 'P', ${s}, 1000, 'active')
    RETURNING id, slug
  `;
  return row;
}

describe('POST /api/portal/websites/[siteId]/store/products @websites @store', () => {
  let A: TenantCtx;

  beforeEach(async () => { A = await sessionForNewClientUser('store-prod-create'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const { siteId } = await seedSite(A);
    const route = await import('@/app/api/portal/websites/[siteId]/store/products/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId) }, body: { name: 'X', slug: 'x', price: 100 } },
    );
    expect(res.status).toBe(401);
  });

  it('400 when required fields are missing', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const route = await import('@/app/api/portal/websites/[siteId]/store/products/route');
    const res = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId) }, body: { name: 'No slug' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.success).toBe(false);
  });

  it('201 happy path — product is created and scoped to the caller\'s site', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const slug = `widget-${Date.now()}`;
    const route = await import('@/app/api/portal/websites/[siteId]/store/products/route');
    const res = await callHandler<{ success: boolean; data: { id: number; websiteId: number; slug: string } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId) }, body: { name: 'Widget', slug, price: 1500 } },
    );
    expect(res.status).toBe(201);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data.websiteId).toBe(siteId);
    expect(res.data?.data.slug).toBe(slug);
  });

  it('409 on duplicate slug within the same site', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const slug = `dup-${Date.now()}`;
    await seedProduct(siteId, slug);
    const route = await import('@/app/api/portal/websites/[siteId]/store/products/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId) }, body: { name: 'Dup', slug, price: 999 } },
    );
    expect(res.status).toBe(409);
  });

  it('cross-site rejection — tenant A cannot create products under B\'s siteId', async () => {
    const B = await sessionForNewClientUser('store-prod-cross-b');
    const { siteId: foreignSite } = await seedSite(B);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/websites/[siteId]/store/products/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(foreignSite) }, body: { name: 'Sneak', slug: 'sneak', price: 100 } },
    );
    expect(res.status).toBe(404);

    // Verify nothing was inserted under B's site
    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.products WHERE website_id = ${foreignSite}
    `;
    expect(rows.length).toBe(0);
  });
});

describe('PUT /api/portal/websites/[siteId]/store/products/[productId] @websites @store', () => {
  let A: TenantCtx;

  beforeEach(async () => { A = await sessionForNewClientUser('store-prod-update'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const { siteId } = await seedSite(A);
    const product = await seedProduct(siteId);
    const route = await import('@/app/api/portal/websites/[siteId]/store/products/[productId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { siteId: String(siteId), productId: String(product.id) }, body: { name: 'New' } },
    );
    expect(res.status).toBe(401);
  });

  it('happy path — updates a product within the caller\'s site', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const product = await seedProduct(siteId);
    const route = await import('@/app/api/portal/websites/[siteId]/store/products/[productId]/route');
    const res = await callHandler<{ success: boolean; data: { name: string; price: number } }>(
      route as unknown as Record<string, unknown>, 'PUT',
      {
        params: { siteId: String(siteId), productId: String(product.id) },
        body: { name: 'Renamed', price: 2222 },
      },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.name).toBe('Renamed');
    expect(res.data?.data.price).toBe(2222);
  });

  it('404 on missing productId', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const route = await import('@/app/api/portal/websites/[siteId]/store/products/[productId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { siteId: String(siteId), productId: '999999' }, body: { name: 'X' } },
    );
    expect(res.status).toBe(404);
  });

  it('cross-site rejection — A cannot update B\'s product even via A\'s siteId', async () => {
    const B = await sessionForNewClientUser('store-prod-update-b');
    const { siteId: aSite } = await seedSite(A);
    const { siteId: bSite } = await seedSite(B);
    const bProduct = await seedProduct(bSite);

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/websites/[siteId]/store/products/[productId]/route');

    // Try to mutate B's product through A's siteId path
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { siteId: String(aSite), productId: String(bProduct.id) }, body: { name: 'Hijack' } },
    );
    expect(res.status).toBe(404);

    // Verify B's product untouched
    const sql = getTestSql();
    const [check] = await sql<{ name: string }[]>`
      SELECT name FROM ${sql(TEST_SCHEMA)}.products WHERE id = ${bProduct.id}
    `;
    expect(check.name).toBe('P');
  });

  it('409 when renaming slug to one already used in the same site', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const a = await seedProduct(siteId, 'first');
    const b = await seedProduct(siteId, 'second');
    void a;
    const route = await import('@/app/api/portal/websites/[siteId]/store/products/[productId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { siteId: String(siteId), productId: String(b.id) }, body: { slug: 'first' } },
    );
    expect(res.status).toBe(409);
  });
});

describe('DELETE /api/portal/websites/[siteId]/store/products/[productId] @websites @store', () => {
  let A: TenantCtx;

  beforeEach(async () => { A = await sessionForNewClientUser('store-prod-delete'); });

  it('happy path — deletes the product', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const product = await seedProduct(siteId);
    const route = await import('@/app/api/portal/websites/[siteId]/store/products/[productId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { siteId: String(siteId), productId: String(product.id) } },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.products WHERE id = ${product.id}
    `;
    expect(rows.length).toBe(0);
  });

  it('404 when product does not exist', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const route = await import('@/app/api/portal/websites/[siteId]/store/products/[productId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { siteId: String(siteId), productId: '999999' } },
    );
    expect(res.status).toBe(404);
  });

  it('cross-site rejection — A cannot delete B\'s product', async () => {
    const B = await sessionForNewClientUser('store-prod-delete-b');
    const { siteId: aSite } = await seedSite(A);
    const { siteId: bSite } = await seedSite(B);
    const bProduct = await seedProduct(bSite);

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/websites/[siteId]/store/products/[productId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { siteId: String(aSite), productId: String(bProduct.id) } },
    );
    expect(res.status).toBe(404);

    // Verify still exists
    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.products WHERE id = ${bProduct.id}
    `;
    expect(rows.length).toBe(1);
  });
});
