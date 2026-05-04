/**
 * Portal websites — STORE mutation golden path (@critical).
 *
 * Walks the create → edit → delete cycle for each store entity:
 *   - product
 *   - product category (and assigning a product into it)
 *   - discount code
 *   - shipping zone (no DELETE for shipping zones via the existing cleanups
 *     contract — see runCleanups; DELETE is exercised via the API explicitly).
 *
 * All resources use a `STORE-` prefix and are wired into `runCleanups` so a
 * partial failure won't leak data into the shared E2E DB.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestWebsite } from './setup/helpers';

test.describe.configure({ mode: 'serial' });

test.describe('Portal websites — store mutations @websites @store @critical', () => {
  let siteId: number;
  const cleanups: Array<() => Promise<void>> = [];

  test.beforeAll(async ({ browser }) => {
    void browser;
  });

  test.afterAll(async () => {
    await runCleanups(cleanups);
  });

  test('setup: create test website', async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    siteId = website.id;
  });

  test('product create → edit → delete', async ({ clientApi }) => {
    const slug = `STORE-prod-${Date.now()}`;

    // Create
    const created = await clientApi.post(`/api/portal/websites/${siteId}/store/products`, {
      name: `STORE-Product ${Date.now()}`,
      slug,
      price: 2500,
      status: 'draft',
    });
    expect(created.status).toBe(201);
    expect(created.data.success).toBe(true);
    const productId: number = created.data.data.id;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/websites/${siteId}/store/products/${productId}`).catch(() => {});
    });

    // Edit
    const edited = await clientApi.put(`/api/portal/websites/${siteId}/store/products/${productId}`, {
      name: 'STORE-Product (edited)',
      price: 3500,
      status: 'active',
    });
    expect(edited.status).toBe(200);
    expect(edited.data.data.name).toBe('STORE-Product (edited)');
    expect(edited.data.data.price).toBe(3500);

    // Delete
    const deleted = await clientApi.delete(`/api/portal/websites/${siteId}/store/products/${productId}`);
    expect(deleted.status).toBe(200);
    expect(deleted.data.success).toBe(true);
  });

  test('category create → assign product → delete', async ({ clientApi }) => {
    const catSlug = `STORE-cat-${Date.now()}`;
    const prodSlug = `STORE-prod-cat-${Date.now()}`;

    // Create category
    const cat = await clientApi.post(`/api/portal/websites/${siteId}/store/categories`, {
      name: `STORE-Category ${Date.now()}`,
      slug: catSlug,
    });
    expect(cat.status).toBe(201);
    const categoryId: number = cat.data.data.id;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/websites/${siteId}/store/categories/${categoryId}`).catch(() => {});
    });

    // Create product, immediately assigned to the category
    const prod = await clientApi.post(`/api/portal/websites/${siteId}/store/products`, {
      name: `STORE-CatProduct ${Date.now()}`,
      slug: prodSlug,
      price: 1000,
      categoryId,
    });
    expect(prod.status).toBe(201);
    const productId: number = prod.data.data.id;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/websites/${siteId}/store/products/${productId}`).catch(() => {});
    });

    // Confirm category linkage on the persisted product
    const fetched = await clientApi.get(`/api/portal/websites/${siteId}/store/products/${productId}`);
    expect(fetched.status).toBe(200);
    expect(fetched.data.data.categoryId).toBe(categoryId);

    // Delete (cleanup)
    const deletedProd = await clientApi.delete(`/api/portal/websites/${siteId}/store/products/${productId}`);
    expect(deletedProd.status).toBe(200);
    const deletedCat = await clientApi.delete(`/api/portal/websites/${siteId}/store/categories/${categoryId}`);
    expect(deletedCat.status).toBe(200);
  });

  test('discount create → edit → delete', async ({ clientApi }) => {
    const code = `STORE-DISC-${Date.now()}`;
    const created = await clientApi.post(`/api/portal/websites/${siteId}/store/discounts`, {
      code,
      discountType: 'percent',
      amount: 15,
      description: 'STORE golden-path discount',
    });
    expect(created.status).toBe(201);
    expect(created.data.data.code).toBe(code.toUpperCase());
    const discountId: number = created.data.data.id;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/websites/${siteId}/store/discounts/${discountId}`).catch(() => {});
    });

    const edited = await clientApi.put(`/api/portal/websites/${siteId}/store/discounts/${discountId}`, {
      amount: 20,
      description: 'STORE golden-path discount (edited)',
    });
    expect(edited.status).toBe(200);
    expect(edited.data.data.amount).toBe(20);

    const deleted = await clientApi.delete(`/api/portal/websites/${siteId}/store/discounts/${discountId}`);
    expect(deleted.status).toBe(200);
  });

  test('shipping zone create → delete', async ({ clientApi }) => {
    const created = await clientApi.post(`/api/portal/websites/${siteId}/store/shipping`, {
      name: `STORE-Zone ${Date.now()}`,
      countries: ['US'],
      states: [],
    });
    expect(created.status).toBe(201);
    const zoneId: number = created.data.data.id;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/websites/${siteId}/store/shipping/${zoneId}`).catch(() => {});
    });

    const deleted = await clientApi.delete(`/api/portal/websites/${siteId}/store/shipping/${zoneId}`);
    expect(deleted.status).toBe(200);
  });
});
