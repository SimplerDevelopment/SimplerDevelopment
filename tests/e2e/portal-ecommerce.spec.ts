/**
 * Portal Ecommerce / Store API E2E Tests
 *
 * Tests for /api/portal/websites/[siteId]/store/*
 * Covers: products, categories, orders, discounts, shipping, settings, analytics
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestWebsite } from './setup/helpers';

// Serial: tests share a website created in setup
test.describe.configure({ mode: 'serial' });

test.describe('Portal Ecommerce @ecommerce @critical', () => {
  let cleanups: Array<() => Promise<void>> = [];
  let siteId: number;

  test('setup: create test website', async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    siteId = website.id;
  });

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  // --- Store Settings ---

  test('GET /store/settings returns store settings', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/websites/${siteId}/store/settings`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toBeTruthy();
  });

  test('PUT /store/settings updates store configuration', async ({ clientApi }) => {
    const res = await clientApi.put(`/api/portal/websites/${siteId}/store/settings`, {
      storeName: `Test Store ${Date.now()}`,
      currency: 'USD',
      taxRate: 8.5,
      orderPrefix: 'TST',
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.currency).toBe('USD');
  });

  // --- Products ---

  test('GET /store/products lists products', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/websites/${siteId}/store/products`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
    expect(res.data).toHaveProperty('pagination');
  });

  test('POST /store/products creates a product', async ({ clientApi }) => {
    const slug = `test-product-${Date.now()}`;
    const res = await clientApi.post(`/api/portal/websites/${siteId}/store/products`, {
      name: 'Test Product',
      slug,
      price: 2999,
      description: 'E2E test product',
      status: 'draft',
    });
    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data.name).toBe('Test Product');
    expect(res.data.data.price).toBe(2999);

    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/websites/${siteId}/store/products/${res.data.data.id}`).catch(() => {});
    });
  });

  test('POST /store/products rejects duplicate slug', async ({ clientApi }) => {
    const slug = `dup-product-${Date.now()}`;
    const first = await clientApi.post(`/api/portal/websites/${siteId}/store/products`, {
      name: 'First Product',
      slug,
      price: 1000,
    });
    expect(first.status).toBe(201);
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/websites/${siteId}/store/products/${first.data.data.id}`).catch(() => {});
    });

    const second = await clientApi.post(`/api/portal/websites/${siteId}/store/products`, {
      name: 'Second Product',
      slug,
      price: 2000,
    });
    expect(second.status).toBe(409);
  });

  test('GET /store/products/:id returns product with details', async ({ clientApi }) => {
    const { productId, cleanup } = await createTestProduct(clientApi, siteId);
    cleanups.push(cleanup);

    const res = await clientApi.get(`/api/portal/websites/${siteId}/store/products/${productId}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toHaveProperty('images');
    expect(res.data.data).toHaveProperty('options');
    expect(res.data.data).toHaveProperty('variants');
  });

  test('PUT /store/products/:id updates a product', async ({ clientApi }) => {
    const { productId, cleanup } = await createTestProduct(clientApi, siteId);
    cleanups.push(cleanup);

    const res = await clientApi.put(`/api/portal/websites/${siteId}/store/products/${productId}`, {
      name: 'Updated Product',
      price: 4999,
      status: 'active',
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.name).toBe('Updated Product');
  });

  test('DELETE /store/products/:id removes a product', async ({ clientApi }) => {
    const { productId } = await createTestProduct(clientApi, siteId);

    const res = await clientApi.delete(`/api/portal/websites/${siteId}/store/products/${productId}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });

  // --- Store Categories ---

  test('GET /store/categories lists store categories', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/websites/${siteId}/store/categories`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('POST /store/categories creates a store category', async ({ clientApi }) => {
    const slug = `test-store-cat-${Date.now()}`;
    const res = await clientApi.post(`/api/portal/websites/${siteId}/store/categories`, {
      name: 'Test Store Category',
      slug,
      description: 'E2E test store category',
    });
    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data.name).toBe('Test Store Category');

    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/websites/${siteId}/store/categories/${res.data.data.id}`).catch(() => {});
    });
  });

  test('POST /store/categories rejects duplicate slug', async ({ clientApi }) => {
    const slug = `dup-store-cat-${Date.now()}`;
    const first = await clientApi.post(`/api/portal/websites/${siteId}/store/categories`, {
      name: 'First',
      slug,
    });
    expect(first.status).toBe(201);
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/websites/${siteId}/store/categories/${first.data.data.id}`).catch(() => {});
    });

    const second = await clientApi.post(`/api/portal/websites/${siteId}/store/categories`, {
      name: 'Second',
      slug,
    });
    expect(second.status).toBe(409);
  });

  test('PUT /store/categories/:id updates a store category', async ({ clientApi }) => {
    const { categoryId, cleanup } = await createTestStoreCategory(clientApi, siteId);
    cleanups.push(cleanup);

    const res = await clientApi.put(`/api/portal/websites/${siteId}/store/categories/${categoryId}`, {
      name: 'Updated Store Category',
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.name).toBe('Updated Store Category');
  });

  test('DELETE /store/categories/:id removes a store category', async ({ clientApi }) => {
    const { categoryId } = await createTestStoreCategory(clientApi, siteId);

    const res = await clientApi.delete(`/api/portal/websites/${siteId}/store/categories/${categoryId}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });

  // --- Discounts ---

  test('GET /store/discounts lists discount codes', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/websites/${siteId}/store/discounts`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('POST /store/discounts creates a discount code', async ({ clientApi }) => {
    const code = `TEST${Date.now()}`;
    const res = await clientApi.post(`/api/portal/websites/${siteId}/store/discounts`, {
      code,
      discountType: 'percentage',
      amount: 15,
      description: 'E2E test discount',
    });
    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data.code).toBe(code.toUpperCase());
    expect(res.data.data.discountType).toBe('percentage');

    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/websites/${siteId}/store/discounts/${res.data.data.id}`).catch(() => {});
    });
  });

  test('POST /store/discounts rejects duplicate code', async ({ clientApi }) => {
    const code = `DUP${Date.now()}`;
    const first = await clientApi.post(`/api/portal/websites/${siteId}/store/discounts`, {
      code,
      discountType: 'fixed',
      amount: 500,
    });
    expect(first.status).toBe(201);
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/websites/${siteId}/store/discounts/${first.data.data.id}`).catch(() => {});
    });

    const second = await clientApi.post(`/api/portal/websites/${siteId}/store/discounts`, {
      code,
      discountType: 'fixed',
      amount: 1000,
    });
    expect(second.status).toBe(409);
  });

  test('PUT /store/discounts/:id updates a discount', async ({ clientApi }) => {
    const { discountId, cleanup } = await createTestDiscount(clientApi, siteId);
    cleanups.push(cleanup);

    const res = await clientApi.put(`/api/portal/websites/${siteId}/store/discounts/${discountId}`, {
      description: 'Updated discount',
      amount: 25,
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });

  test('DELETE /store/discounts/:id removes a discount', async ({ clientApi }) => {
    const { discountId } = await createTestDiscount(clientApi, siteId);

    const res = await clientApi.delete(`/api/portal/websites/${siteId}/store/discounts/${discountId}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });

  // --- Shipping ---

  test('GET /store/shipping lists shipping zones with rates', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/websites/${siteId}/store/shipping`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('POST /store/shipping creates a shipping zone', async ({ clientApi }) => {
    const res = await clientApi.post(`/api/portal/websites/${siteId}/store/shipping`, {
      name: `Zone ${Date.now()}`,
      countries: ['US', 'CA'],
      states: [],
    });
    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data.name).toContain('Zone');
    expect(res.data.data.rates).toEqual([]);

    // No delete for shipping zones — acceptable leak
  });

  // --- Orders ---

  test('GET /store/orders lists orders', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/websites/${siteId}/store/orders`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
    expect(res.data).toHaveProperty('pagination');
  });

  test('GET /store/orders supports pagination', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/websites/${siteId}/store/orders?page=1&limit=5`);
    expect(res.status).toBe(200);
    expect(res.data.pagination.page).toBe(1);
    expect(res.data.pagination.limit).toBe(5);
  });

  // --- Analytics ---

  test('GET /store/analytics returns store analytics', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/websites/${siteId}/store/analytics`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toHaveProperty('totalRevenue');
    expect(res.data.data).toHaveProperty('totalOrders');
    expect(res.data.data).toHaveProperty('averageOrderValue');
    expect(res.data.data).toHaveProperty('topProducts');
    expect(res.data.data).toHaveProperty('revenueByDay');
    expect(res.data.data).toHaveProperty('ordersByStatus');
  });

  test('GET /store/analytics supports period parameter', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/websites/${siteId}/store/analytics?period=7d`);
    expect(res.status).toBe(200);
    expect(res.data.data.period).toBe('7d');
  });

  // --- Stripe Connect ---

  test('GET /store/stripe-connect returns connection status', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/websites/${siteId}/store/stripe-connect`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toHaveProperty('connected');
    expect(res.data.data).toHaveProperty('onboardingComplete');
  });

  // --- Product Variants ---

  test('GET /store/products/:id/variants lists variants', async ({ clientApi }) => {
    const { productId, cleanup } = await createTestProduct(clientApi, siteId);
    cleanups.push(cleanup);

    const res = await clientApi.get(`/api/portal/websites/${siteId}/store/products/${productId}/variants`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('POST /store/products/:id/variants creates a variant', async ({ clientApi }) => {
    const { productId, cleanup } = await createTestProduct(clientApi, siteId);
    cleanups.push(cleanup);

    const res = await clientApi.post(`/api/portal/websites/${siteId}/store/products/${productId}/variants`, {
      name: 'Large / Blue',
      price: 3499,
      sku: `TST-VAR-${Date.now()}`,
      quantity: 50,
    });
    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data.name).toBe('Large / Blue');
    expect(res.data.data.price).toBe(3499);
  });

  test('POST /store/products/:id/variants rejects missing fields', async ({ clientApi }) => {
    const { productId, cleanup } = await createTestProduct(clientApi, siteId);
    cleanups.push(cleanup);

    const res = await clientApi.post(`/api/portal/websites/${siteId}/store/products/${productId}/variants`, {
      sku: 'NO-NAME',
    });
    expect(res.status).toBe(400);
  });

  test('PUT /store/products/:id/variants/:vid updates a variant', async ({ clientApi }) => {
    const { productId, cleanup } = await createTestProduct(clientApi, siteId);
    cleanups.push(cleanup);

    const create = await clientApi.post(`/api/portal/websites/${siteId}/store/products/${productId}/variants`, {
      name: 'Original',
      price: 1000,
    });
    const variantId = create.data.data.id;

    const res = await clientApi.put(`/api/portal/websites/${siteId}/store/products/${productId}/variants/${variantId}`, {
      name: 'Updated Variant',
      price: 2500,
      active: false,
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.name).toBe('Updated Variant');
    expect(res.data.data.price).toBe(2500);
  });

  test('DELETE /store/products/:id/variants/:vid removes a variant', async ({ clientApi }) => {
    const { productId, cleanup } = await createTestProduct(clientApi, siteId);
    cleanups.push(cleanup);

    const create = await clientApi.post(`/api/portal/websites/${siteId}/store/products/${productId}/variants`, {
      name: 'Delete Me',
      price: 500,
    });
    const variantId = create.data.data.id;

    const res = await clientApi.delete(`/api/portal/websites/${siteId}/store/products/${productId}/variants/${variantId}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });

  // --- Product Options ---

  test('GET /store/products/:id/options lists options with values', async ({ clientApi }) => {
    const { productId, cleanup } = await createTestProduct(clientApi, siteId);
    cleanups.push(cleanup);

    const res = await clientApi.get(`/api/portal/websites/${siteId}/store/products/${productId}/options`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('POST /store/products/:id/options creates an option with values', async ({ clientApi }) => {
    const { productId, cleanup } = await createTestProduct(clientApi, siteId);
    cleanups.push(cleanup);

    const res = await clientApi.post(`/api/portal/websites/${siteId}/store/products/${productId}/options`, {
      name: 'Size',
      values: [
        { value: 'S', label: 'Small' },
        { value: 'M', label: 'Medium' },
        { value: 'L', label: 'Large' },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data.name).toBe('Size');
    expect(res.data.data.values).toHaveLength(3);
    expect(res.data.data.values[0].value).toBe('S');
  });

  test('POST /store/products/:id/options rejects missing name', async ({ clientApi }) => {
    const { productId, cleanup } = await createTestProduct(clientApi, siteId);
    cleanups.push(cleanup);

    const res = await clientApi.post(`/api/portal/websites/${siteId}/store/products/${productId}/options`, {
      values: [{ value: 'X' }],
    });
    expect(res.status).toBe(400);
  });

  test('PUT /store/products/:id/options/:oid replaces option values', async ({ clientApi }) => {
    const { productId, cleanup } = await createTestProduct(clientApi, siteId);
    cleanups.push(cleanup);

    const create = await clientApi.post(`/api/portal/websites/${siteId}/store/products/${productId}/options`, {
      name: 'Color',
      values: [{ value: 'Red' }, { value: 'Blue' }],
    });
    const optionId = create.data.data.id;

    const res = await clientApi.put(`/api/portal/websites/${siteId}/store/products/${productId}/options/${optionId}`, {
      name: 'Colour',
      values: [{ value: 'Green' }, { value: 'Yellow' }, { value: 'Purple' }],
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.name).toBe('Colour');
    expect(res.data.data.values).toHaveLength(3);
  });

  test('DELETE /store/products/:id/options/:oid removes option and values', async ({ clientApi }) => {
    const { productId, cleanup } = await createTestProduct(clientApi, siteId);
    cleanups.push(cleanup);

    const create = await clientApi.post(`/api/portal/websites/${siteId}/store/products/${productId}/options`, {
      name: 'Material',
      values: [{ value: 'Cotton' }],
    });
    const optionId = create.data.data.id;

    const res = await clientApi.delete(`/api/portal/websites/${siteId}/store/products/${productId}/options/${optionId}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });

  // --- Bulk Pricing ---

  test('GET /store/products/:id/bulk-pricing lists pricing rules', async ({ clientApi }) => {
    const { productId, cleanup } = await createTestProduct(clientApi, siteId);
    cleanups.push(cleanup);

    const res = await clientApi.get(`/api/portal/websites/${siteId}/store/products/${productId}/bulk-pricing`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('POST /store/products/:id/bulk-pricing creates a pricing rule', async ({ clientApi }) => {
    const { productId, cleanup } = await createTestProduct(clientApi, siteId);
    cleanups.push(cleanup);

    const res = await clientApi.post(`/api/portal/websites/${siteId}/store/products/${productId}/bulk-pricing`, {
      minQuantity: 10,
      maxQuantity: 49,
      amount: 1799,
      priceType: 'fixed',
    });
    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data.minQuantity).toBe(10);
    expect(res.data.data.amount).toBe(1799);
  });

  test('POST /store/products/:id/bulk-pricing rejects missing fields', async ({ clientApi }) => {
    const { productId, cleanup } = await createTestProduct(clientApi, siteId);
    cleanups.push(cleanup);

    const res = await clientApi.post(`/api/portal/websites/${siteId}/store/products/${productId}/bulk-pricing`, {
      priceType: 'fixed',
    });
    expect(res.status).toBe(400);
  });

  test('PUT /store/products/:id/bulk-pricing updates a rule', async ({ clientApi }) => {
    const { productId, cleanup } = await createTestProduct(clientApi, siteId);
    cleanups.push(cleanup);

    const create = await clientApi.post(`/api/portal/websites/${siteId}/store/products/${productId}/bulk-pricing`, {
      minQuantity: 5,
      amount: 1500,
    });
    const ruleId = create.data.data.id;

    const res = await clientApi.put(`/api/portal/websites/${siteId}/store/products/${productId}/bulk-pricing?id=${ruleId}`, {
      minQuantity: 10,
      maxQuantity: 99,
      amount: 1299,
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });

  test('DELETE /store/products/:id/bulk-pricing removes a rule', async ({ clientApi }) => {
    const { productId, cleanup } = await createTestProduct(clientApi, siteId);
    cleanups.push(cleanup);

    const create = await clientApi.post(`/api/portal/websites/${siteId}/store/products/${productId}/bulk-pricing`, {
      minQuantity: 100,
      amount: 999,
    });
    const ruleId = create.data.data.id;

    const res = await clientApi.delete(`/api/portal/websites/${siteId}/store/products/${productId}/bulk-pricing?id=${ruleId}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });

  // --- Shipping Zones (update/delete) ---

  test('PUT /store/shipping/:zoneId updates a zone', async ({ clientApi }) => {
    // Create a zone first
    const zone = await clientApi.post(`/api/portal/websites/${siteId}/store/shipping`, {
      name: `Update Zone ${Date.now()}`,
      countries: ['US'],
    });
    expect(zone.status).toBe(201);
    const zoneId = zone.data.data.id;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/websites/${siteId}/store/shipping/${zoneId}`).catch(() => {});
    });

    const res = await clientApi.put(`/api/portal/websites/${siteId}/store/shipping/${zoneId}`, {
      name: 'Updated Zone Name',
      countries: ['US', 'CA', 'MX'],
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.name).toBe('Updated Zone Name');
  });

  test('DELETE /store/shipping/:zoneId removes a zone', async ({ clientApi }) => {
    const zone = await clientApi.post(`/api/portal/websites/${siteId}/store/shipping`, {
      name: `Delete Zone ${Date.now()}`,
    });
    const zoneId = zone.data.data.id;

    const res = await clientApi.delete(`/api/portal/websites/${siteId}/store/shipping/${zoneId}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });

  // --- Shipping Rates ---

  test('GET /store/shipping/:zoneId/rates lists rates for a zone', async ({ clientApi }) => {
    const { zoneId, cleanup } = await createTestShippingZone(clientApi, siteId);
    cleanups.push(cleanup);

    const res = await clientApi.get(`/api/portal/websites/${siteId}/store/shipping/${zoneId}/rates`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('POST /store/shipping/:zoneId/rates creates a shipping rate', async ({ clientApi }) => {
    const { zoneId, cleanup } = await createTestShippingZone(clientApi, siteId);
    cleanups.push(cleanup);

    const res = await clientApi.post(`/api/portal/websites/${siteId}/store/shipping/${zoneId}/rates`, {
      name: 'Standard Shipping',
      rateType: 'flat',
      price: 599,
      minDeliveryDays: 3,
      maxDeliveryDays: 7,
    });
    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data.name).toBe('Standard Shipping');
    expect(res.data.data.price).toBe(599);
  });

  test('POST /store/shipping/:zoneId/rates rejects missing name', async ({ clientApi }) => {
    const { zoneId, cleanup } = await createTestShippingZone(clientApi, siteId);
    cleanups.push(cleanup);

    const res = await clientApi.post(`/api/portal/websites/${siteId}/store/shipping/${zoneId}/rates`, {
      price: 999,
    });
    expect(res.status).toBe(400);
  });

  test('PUT /store/shipping/:zoneId/rates/:rateId updates a rate', async ({ clientApi }) => {
    const { zoneId, cleanup } = await createTestShippingZone(clientApi, siteId);
    cleanups.push(cleanup);

    const create = await clientApi.post(`/api/portal/websites/${siteId}/store/shipping/${zoneId}/rates`, {
      name: 'Express',
      price: 1299,
    });
    const rateId = create.data.data.id;

    const res = await clientApi.put(`/api/portal/websites/${siteId}/store/shipping/${zoneId}/rates/${rateId}`, {
      name: 'Express Shipping',
      price: 1499,
      minDeliveryDays: 1,
      maxDeliveryDays: 2,
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.name).toBe('Express Shipping');
  });

  test('DELETE /store/shipping/:zoneId/rates/:rateId removes a rate', async ({ clientApi }) => {
    const { zoneId, cleanup } = await createTestShippingZone(clientApi, siteId);
    cleanups.push(cleanup);

    const create = await clientApi.post(`/api/portal/websites/${siteId}/store/shipping/${zoneId}/rates`, {
      name: 'Remove Me',
      price: 0,
    });
    const rateId = create.data.data.id;

    const res = await clientApi.delete(`/api/portal/websites/${siteId}/store/shipping/${zoneId}/rates/${rateId}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });

  // --- Orders (detail + status update) ---

  test('GET /store/orders/:id returns 404 for non-existent order', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/websites/${siteId}/store/orders/999999`);
    expect(res.status).toBe(404);
  });

  // --- Auth ---

  test('rejects unauthenticated access to products', async ({ unauthApi }) => {
    const res = await unauthApi.get(`/api/portal/websites/${siteId}/store/products`);
    expect(res.status).toBe(401);
  });

  test('rejects unauthenticated access to orders', async ({ unauthApi }) => {
    const res = await unauthApi.get(`/api/portal/websites/${siteId}/store/orders`);
    expect(res.status).toBe(401);
  });

  test('returns 404 for non-existent site', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/websites/999999/store/products');
    expect(res.status).toBe(404);
  });
});

// --- Helpers ---

async function createTestProduct(api: import('./setup/api-client').ApiClient, siteId: number) {
  const slug = `test-product-${Date.now()}`;
  const res = await api.post(`/api/portal/websites/${siteId}/store/products`, {
    name: `Test Product ${Date.now()}`,
    slug,
    price: 1999,
    status: 'draft',
  });
  if (!res.data?.success) throw new Error(`Failed to create test product: ${res.data?.message}`);
  const productId = res.data.data.id;
  const cleanup = async () => {
    await api.delete(`/api/portal/websites/${siteId}/store/products/${productId}`).catch(() => {});
  };
  return { productId, cleanup };
}

async function createTestStoreCategory(api: import('./setup/api-client').ApiClient, siteId: number) {
  const slug = `test-store-cat-${Date.now()}`;
  const res = await api.post(`/api/portal/websites/${siteId}/store/categories`, {
    name: `Test Category ${Date.now()}`,
    slug,
  });
  if (!res.data?.success) throw new Error(`Failed to create test store category: ${res.data?.message}`);
  const categoryId = res.data.data.id;
  const cleanup = async () => {
    await api.delete(`/api/portal/websites/${siteId}/store/categories/${categoryId}`).catch(() => {});
  };
  return { categoryId, cleanup };
}

async function createTestDiscount(api: import('./setup/api-client').ApiClient, siteId: number) {
  const code = `TESTDISC${Date.now()}`;
  const res = await api.post(`/api/portal/websites/${siteId}/store/discounts`, {
    code,
    discountType: 'percentage',
    amount: 10,
  });
  if (!res.data?.success) throw new Error(`Failed to create test discount: ${res.data?.message}`);
  const discountId = res.data.data.id;
  const cleanup = async () => {
    await api.delete(`/api/portal/websites/${siteId}/store/discounts/${discountId}`).catch(() => {});
  };
  return { discountId, cleanup };
}

async function createTestShippingZone(api: import('./setup/api-client').ApiClient, siteId: number) {
  const res = await api.post(`/api/portal/websites/${siteId}/store/shipping`, {
    name: `Zone ${Date.now()}`,
    countries: ['US'],
  });
  if (!res.data?.success) throw new Error(`Failed to create test shipping zone: ${res.data?.message}`);
  const zoneId = res.data.data.id;
  const cleanup = async () => {
    await api.delete(`/api/portal/websites/${siteId}/store/shipping/${zoneId}`).catch(() => {});
  };
  return { zoneId, cleanup };
}
