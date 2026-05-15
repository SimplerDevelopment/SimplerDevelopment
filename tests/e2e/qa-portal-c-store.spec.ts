/**
 * PORTAL-C QA — Store slice: products, categories, discounts, orders, settings
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestWebsite } from './setup/helpers';

test.describe.configure({ mode: 'serial' });

test.describe('PORTAL-C Store — products @portal-c @store', () => {
  let siteId: number;
  const cleanups: Array<() => Promise<void>> = [];

  test('setup: create test website', async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    siteId = website.id;
  });

  test.afterAll(async () => { await runCleanups(cleanups); });

  test('product create → edit → delete golden path', async ({ clientApi }) => {
    const slug = `qa-c-prod-${Date.now()}`;
    const created = await clientApi.post(`/api/portal/websites/${siteId}/store/products`, {
      name: `QA-C Product ${Date.now()}`,
      slug,
      price: 2999,
      status: 'draft',
    });
    expect(created.status).toBe(201);
    expect(created.data.success).toBe(true);
    const productId: number = created.data.data.id;
    cleanups.push(async () => { await clientApi.delete(`/api/portal/websites/${siteId}/store/products/${productId}`).catch(() => {}); });

    const edited = await clientApi.put(`/api/portal/websites/${siteId}/store/products/${productId}`, {
      name: 'QA-C Product (edited)',
      price: 3999,
      status: 'active',
    });
    expect(edited.status).toBe(200);
    expect(edited.data.data.name).toBe('QA-C Product (edited)');
    expect(edited.data.data.price).toBe(3999);
  });

  test('product create with negative price should fail or store as-is', async ({ clientApi }) => {
    const slug = `qa-c-neg-${Date.now()}`;
    const res = await clientApi.post(`/api/portal/websites/${siteId}/store/products`, {
      name: 'Negative Price Test',
      slug,
      price: -100,
      status: 'draft',
    });
    // Should either reject with 400 or accept — document the behavior
    if (res.status === 201) {
      console.log('WARNING: Negative price accepted by API — no server-side validation');
      const productId = res.data.data.id;
      cleanups.push(async () => { await clientApi.delete(`/api/portal/websites/${siteId}/store/products/${productId}`).catch(() => {}); });
    } else {
      expect([400, 422]).toContain(res.status);
    }
  });

  test('product create with 0 inventory accepted', async ({ clientApi }) => {
    const slug = `qa-c-zero-inv-${Date.now()}`;
    const res = await clientApi.post(`/api/portal/websites/${siteId}/store/products`, {
      name: 'Zero Inventory Test',
      slug,
      price: 1000,
      inventory: 0,
      status: 'draft',
    });
    expect([200, 201]).toContain(res.status);
    if (res.status === 201 || res.status === 200) {
      const productId = res.data.data.id;
      cleanups.push(async () => { await clientApi.delete(`/api/portal/websites/${siteId}/store/products/${productId}`).catch(() => {}); });
    }
  });

  test('product list returns paginated response', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/websites/${siteId}/store/products?limit=10&offset=0`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('product empty states — list on new site', async ({ clientApi }) => {
    const { website: freshSite } = await createTestWebsite(clientApi);
    const freshSiteId = freshSite.id;
    cleanups.push(async () => { await clientApi.delete(`/api/portal/websites/${freshSiteId}`).catch(() => {}); });

    const res = await clientApi.get(`/api/portal/websites/${freshSiteId}/store/products`);
    expect(res.status).toBe(200);
    expect(res.data.data).toHaveLength(0);
  });
});

test.describe('PORTAL-C Store — categories @portal-c @store', () => {
  let siteId: number;
  const cleanups: Array<() => Promise<void>> = [];

  test('setup: create test website', async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    siteId = website.id;
  });

  test.afterAll(async () => { await runCleanups(cleanups); });

  test('store category create → list', async ({ clientApi }) => {
    const res = await clientApi.post(`/api/portal/websites/${siteId}/store/categories`, {
      name: `QA-C StoreCategory ${Date.now()}`,
      slug: `qa-c-sc-${Date.now()}`,
    });
    expect([200, 201]).toContain(res.status);
    expect(res.data.success).toBe(true);
    const catId = res.data.data.id;
    cleanups.push(async () => { await clientApi.delete(`/api/portal/websites/${siteId}/store/categories/${catId}`).catch(() => {}); });

    const listRes = await clientApi.get(`/api/portal/websites/${siteId}/store/categories`);
    expect(listRes.status).toBe(200);
    expect(listRes.data.data.some((c: { id: number }) => c.id === catId)).toBe(true);
  });
});

test.describe('PORTAL-C Store — discounts @portal-c @store', () => {
  let siteId: number;
  const cleanups: Array<() => Promise<void>> = [];

  test('setup: create test website', async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    siteId = website.id;
  });

  test.afterAll(async () => { await runCleanups(cleanups); });

  test('discount create → list → toggle', async ({ clientApi }) => {
    const code = `QA${Date.now()}`;
    const res = await clientApi.post(`/api/portal/websites/${siteId}/store/discounts`, {
      code,
      discountType: 'percent',
      amount: 10,
      active: true,
    });
    expect([200, 201]).toContain(res.status);
    expect(res.data.success).toBe(true);
    const discountId = res.data.data.id;
    cleanups.push(async () => { await clientApi.delete(`/api/portal/websites/${siteId}/store/discounts/${discountId}`).catch(() => {}); });

    const listRes = await clientApi.get(`/api/portal/websites/${siteId}/store/discounts`);
    expect(listRes.status).toBe(200);
    expect(listRes.data.data.some((d: { id: number }) => d.id === discountId)).toBe(true);

    // Toggle discount — done via PUT with active:false (no /toggle sub-route exists)
    const toggleRes = await clientApi.put(`/api/portal/websites/${siteId}/store/discounts/${discountId}`, { active: false });
    expect([200, 204]).toContain(toggleRes.status);
  });
});

test.describe('PORTAL-C Store — orders @portal-c @store', () => {
  let siteId: number;
  const cleanups: Array<() => Promise<void>> = [];

  test('setup: create test website', async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    siteId = website.id;
  });

  test.afterAll(async () => { await runCleanups(cleanups); });

  test('orders list returns array (empty state OK)', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/websites/${siteId}/store/orders`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('orders settings get', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/websites/${siteId}/store/settings`);
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(res.data.success).toBe(true);
    }
  });
});
