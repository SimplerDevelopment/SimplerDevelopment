/**
 * Storefront integration tests.
 *
 * Storefront endpoints (/api/storefront/[siteId]/*) are PUBLIC — no session,
 * no API key. Tenancy is enforced via the siteId path parameter. Each store
 * must be explicitly enabled (`store_settings.enabled = true`) for requests
 * to succeed.
 *
 * Covered in this spec:
 *   - Store gate: 404 when storeSettings missing or disabled
 *   - Products listing: pagination, filtering, site isolation
 *   - Cart lifecycle: add → update → remove → clear
 *   - Cross-site cart isolation (cart from site A invisible to site B)
 *   - Product cross-site rejection (can't add site B's product to site A's cart)
 *   - Stock validation (over-order rejected)
 */
import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';

import { callHandler } from '../../helpers/call-handler';
import { sessionForNewClientUser } from '../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../helpers/test-db';

async function createStoreSite(label = 'store'): Promise<{ siteId: number; clientId: number }> {
  const ctx = await sessionForNewClientUser(label);
  const sql = getTestSql();
  const [site] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_websites (client_id, name, domain)
    VALUES (${ctx.client.id}, ${`${label}-site`}, ${`${label}-${Date.now()}.test`})
    RETURNING id
  `;
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.store_settings (website_id, enabled, currency)
    VALUES (${site.id}, true, 'USD')
  `;
  return { siteId: site.id, clientId: ctx.client.id };
}

async function createProduct(
  siteId: number,
  overrides: { name?: string; price?: number; quantity?: number; trackInventory?: boolean; status?: string } = {},
): Promise<{ id: number; slug: string }> {
  const sql = getTestSql();
  const name = overrides.name ?? `Product ${Date.now()}`;
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Math.floor(Math.random() * 9999)}`;
  const [p] = await sql<{ id: number; slug: string }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.products (
      website_id, name, slug, price,
      track_inventory, quantity, status
    ) VALUES (
      ${siteId}, ${name}, ${slug}, ${overrides.price ?? 1000},
      ${overrides.trackInventory ?? true}, ${overrides.quantity ?? 10},
      ${overrides.status ?? 'active'}
    ) RETURNING id, slug
  `;
  return p;
}

// ────────────────────────────────────────────────────────────────────────
describe('Storefront store gate @storefront', () => {
  it('returns 404 when no storeSettings row exists for the site', async () => {
    const ctx = await sessionForNewClientUser('no-store');
    const sql = getTestSql();
    const [site] = await sql<{ id: number }[]>`
      INSERT INTO ${sql(TEST_SCHEMA)}.client_websites (client_id, name, domain)
      VALUES (${ctx.client.id}, 'bare', 'bare.test') RETURNING id
    `;
    const route = await import('@/app/api/storefront/[siteId]/products/route');
    const res = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { siteId: String(site.id) } },
    );
    expect(res.status).toBe(404);
    expect(res.data?.success).toBe(false);
  });

  it('returns 404 when store exists but is disabled', async () => {
    const ctx = await sessionForNewClientUser('disabled-store');
    const sql = getTestSql();
    const [site] = await sql<{ id: number }[]>`
      INSERT INTO ${sql(TEST_SCHEMA)}.client_websites (client_id, name, domain)
      VALUES (${ctx.client.id}, 'off', 'off.test') RETURNING id
    `;
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.store_settings (website_id, enabled)
      VALUES (${site.id}, false)
    `;
    const route = await import('@/app/api/storefront/[siteId]/products/route');
    const res = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { siteId: String(site.id) } },
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 for non-numeric siteId', async () => {
    const route = await import('@/app/api/storefront/[siteId]/products/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { siteId: 'abc' } },
    );
    expect(res.status).toBe(400);
  });
});

// ────────────────────────────────────────────────────────────────────────
describe('Storefront products list @storefront', () => {
  it('returns active products for this site only', async () => {
    const A = await createStoreSite('list-a');
    const B = await createStoreSite('list-b');
    const pA = await createProduct(A.siteId, { name: 'A-product' });
    const pB = await createProduct(B.siteId, { name: 'B-product' });

    const route = await import('@/app/api/storefront/[siteId]/products/route');
    const res = await callHandler<{ success: boolean; data: { id: number; name: string }[] }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { siteId: String(A.siteId) } },
    );
    expect(res.status).toBe(200);
    const ids = new Set(res.data!.data.map(p => p.id));
    expect(ids.has(pA.id)).toBe(true);
    expect(ids.has(pB.id)).toBe(false);
  });

  it('excludes draft / archived products', async () => {
    const { siteId } = await createStoreSite('draft-filter');
    const active = await createProduct(siteId, { name: 'Active' });
    await createProduct(siteId, { name: 'Draft', status: 'draft' });
    await createProduct(siteId, { name: 'Archived', status: 'archived' });

    const route = await import('@/app/api/storefront/[siteId]/products/route');
    const res = await callHandler<{ success: boolean; data: { id: number; name: string }[] }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { siteId: String(siteId) } },
    );
    expect(res.status).toBe(200);
    const names = res.data!.data.map(p => p.name);
    expect(names).toEqual(['Active']);
    expect(res.data!.data[0].id).toBe(active.id);
  });

  it('paginates correctly — limit + page produce distinct rows', async () => {
    const { siteId } = await createStoreSite('paginate');
    for (let i = 0; i < 5; i++) await createProduct(siteId, { name: `Item ${i}` });

    const route = await import('@/app/api/storefront/[siteId]/products/route');
    const page1 = await callHandler<{ success: boolean; data: { id: number }[]; pagination: { total: number; totalPages: number } }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { siteId: String(siteId) }, query: { limit: 2, page: 1 } },
    );
    const page2 = await callHandler<{ success: boolean; data: { id: number }[] }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { siteId: String(siteId) }, query: { limit: 2, page: 2 } },
    );

    expect(page1.data!.data.length).toBe(2);
    expect(page2.data!.data.length).toBe(2);
    expect(page1.data!.pagination.total).toBe(5);
    expect(page1.data!.pagination.totalPages).toBe(3);

    const ids1 = new Set(page1.data!.data.map(p => p.id));
    const ids2 = new Set(page2.data!.data.map(p => p.id));
    for (const id of ids2) expect(ids1.has(id)).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────
describe('Storefront cart lifecycle @storefront', () => {
  it('GET returns an empty cart when none exists for the sessionId', async () => {
    const { siteId } = await createStoreSite('empty-cart');
    const sessionId = crypto.randomUUID();
    const route = await import('@/app/api/storefront/[siteId]/cart/route');
    const res = await callHandler<{ success: boolean; data: { items: unknown[]; subtotal: number } }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { siteId: String(siteId) }, query: { sessionId } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.items).toEqual([]);
    expect(res.data?.data.subtotal).toBe(0);
  });

  it('POST adds an item, GET returns it with computed subtotal', async () => {
    const { siteId } = await createStoreSite('add-to-cart');
    const product = await createProduct(siteId, { name: 'Widget', price: 500, quantity: 10 });
    const sessionId = crypto.randomUUID();

    const route = await import('@/app/api/storefront/[siteId]/cart/route');
    const added = await callHandler<{ success: boolean; data: { id: number; quantity: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId) }, body: { sessionId, productId: product.id, quantity: 2 } },
    );
    expect(added.status).toBe(200);
    expect(added.data?.data.quantity).toBe(2);

    const got = await callHandler<{ success: boolean; data: { items: { quantity: number; lineTotal: number }[]; subtotal: number; itemCount: number } }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { siteId: String(siteId) }, query: { sessionId } },
    );
    expect(got.status).toBe(200);
    expect(got.data?.data.items.length).toBe(1);
    expect(got.data?.data.items[0].lineTotal).toBe(1000);   // 500 × 2
    expect(got.data?.data.subtotal).toBe(1000);
    expect(got.data?.data.itemCount).toBe(2);
  });

  it('POST a second time with the same productId increments quantity (merges)', async () => {
    const { siteId } = await createStoreSite('merge-cart');
    const product = await createProduct(siteId, { name: 'Widget', quantity: 100 });
    const sessionId = crypto.randomUUID();

    const route = await import('@/app/api/storefront/[siteId]/cart/route');
    await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId) }, body: { sessionId, productId: product.id, quantity: 2 } },
    );
    const second = await callHandler<{ success: boolean; data: { quantity: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId) }, body: { sessionId, productId: product.id, quantity: 3 } },
    );
    expect(second.data?.data.quantity).toBe(5);
  });

  it('PUT updates quantity; DELETE clears the cart', async () => {
    const { siteId } = await createStoreSite('update-cart');
    const product = await createProduct(siteId, { name: 'Widget', quantity: 100 });
    const sessionId = crypto.randomUUID();

    const route = await import('@/app/api/storefront/[siteId]/cart/route');
    const addRes = await callHandler<{ success: boolean; data: { id: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId) }, body: { sessionId, productId: product.id, quantity: 1 } },
    );
    const cartItemId = addRes.data!.data.id;

    const updated = await callHandler<{ success: boolean; data: { quantity: number } }>(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { siteId: String(siteId) }, body: { cartItemId, quantity: 4 } },
    );
    expect(updated.data?.data.quantity).toBe(4);

    const cleared = await callHandler<{ success: boolean; data: { cleared: boolean } }>(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { siteId: String(siteId) }, query: { sessionId } },
    );
    expect(cleared.data?.data.cleared).toBe(true);

    const got = await callHandler<{ success: boolean; data: { items: unknown[] } }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { siteId: String(siteId) }, query: { sessionId } },
    );
    expect(got.data?.data.items).toEqual([]);
  });

  it('PUT with quantity=0 removes the item', async () => {
    const { siteId } = await createStoreSite('zero-qty');
    const product = await createProduct(siteId, { name: 'Widget', quantity: 100 });
    const sessionId = crypto.randomUUID();

    const route = await import('@/app/api/storefront/[siteId]/cart/route');
    const addRes = await callHandler<{ success: boolean; data: { id: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId) }, body: { sessionId, productId: product.id, quantity: 2 } },
    );
    const res = await callHandler<{ success: boolean; data: { removed: boolean } }>(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { siteId: String(siteId) }, body: { cartItemId: addRes.data!.data.id, quantity: 0 } },
    );
    expect(res.data?.data.removed).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────
describe('Storefront cross-site isolation @storefront @tenancy', () => {
  it('cart sessions are scoped per-site (same sessionId in two sites = two carts)', async () => {
    const A = await createStoreSite('iso-a');
    const B = await createStoreSite('iso-b');
    const pA = await createProduct(A.siteId);
    const pB = await createProduct(B.siteId);
    const sharedSession = crypto.randomUUID();

    const route = await import('@/app/api/storefront/[siteId]/cart/route');
    await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(A.siteId) }, body: { sessionId: sharedSession, productId: pA.id, quantity: 1 } },
    );

    const gotB = await callHandler<{ success: boolean; data: { items: unknown[] } }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { siteId: String(B.siteId) }, query: { sessionId: sharedSession } },
    );
    expect(gotB.data?.data.items).toEqual([]);     // B's cart must be empty

    await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(B.siteId) }, body: { sessionId: sharedSession, productId: pB.id, quantity: 1 } },
    );

    const gotA = await callHandler<{ success: boolean; data: { items: { productId: number }[] } }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { siteId: String(A.siteId) }, query: { sessionId: sharedSession } },
    );
    expect(gotA.data?.data.items.length).toBe(1);
    expect(gotA.data?.data.items[0].productId).toBe(pA.id);
  });

  it('refuses to add site B\'s product to site A\'s cart', async () => {
    const A = await createStoreSite('fence-a');
    const B = await createStoreSite('fence-b');
    const pB = await createProduct(B.siteId);
    const sessionId = crypto.randomUUID();

    const route = await import('@/app/api/storefront/[siteId]/cart/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(A.siteId) }, body: { sessionId, productId: pB.id, quantity: 1 } },
    );
    expect(res.status).toBe(404);
  });
});

// ────────────────────────────────────────────────────────────────────────
describe('Storefront stock validation @storefront', () => {
  it('refuses to add more than available stock', async () => {
    const { siteId } = await createStoreSite('stock');
    const product = await createProduct(siteId, { quantity: 3, trackInventory: true });
    const sessionId = crypto.randomUUID();

    const route = await import('@/app/api/storefront/[siteId]/cart/route');
    const res = await callHandler<{ success: boolean; message?: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId) }, body: { sessionId, productId: product.id, quantity: 5 } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/only 3 available/i);
  });

  it('refuses to increase quantity past available stock when merging', async () => {
    const { siteId } = await createStoreSite('stock-merge');
    const product = await createProduct(siteId, { quantity: 3, trackInventory: true });
    const sessionId = crypto.randomUUID();

    const route = await import('@/app/api/storefront/[siteId]/cart/route');
    await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId) }, body: { sessionId, productId: product.id, quantity: 2 } },
    );
    const second = await callHandler<{ success: boolean; message?: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId) }, body: { sessionId, productId: product.id, quantity: 2 } },
    );
    expect(second.status).toBe(400);
    expect(second.data?.message).toMatch(/only 3 available/i);
  });

  it('allows unlimited add when trackInventory=false', async () => {
    const { siteId } = await createStoreSite('no-track');
    const product = await createProduct(siteId, { trackInventory: false, quantity: 0 });
    const sessionId = crypto.randomUUID();

    const route = await import('@/app/api/storefront/[siteId]/cart/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId) }, body: { sessionId, productId: product.id, quantity: 9999 } },
    );
    expect(res.status).toBe(200);
  });
});
