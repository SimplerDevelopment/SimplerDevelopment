/**
 * cov-u17.spec.ts — Pitch Decks Product Designer audit slice
 *
 * Cards (0-based indices 12–13 from the "## To Test" backlog):
 *   12. Product designer: design-assets CRUD — add icon asset, list by category,
 *       delete from library
 *   13. Product designer: design saved with explicit styleId retains styleId on GET
 *
 * Route reference:
 *   - Portal design-assets: GET/POST /api/portal/websites/[siteId]/store/design-assets
 *   - Portal design-assets [assetId]: PUT/DELETE /api/portal/websites/[siteId]/store/design-assets/[assetId]
 *   - Storefront designs: POST /api/storefront/[siteId]/designs
 *   - Storefront designs [designId]: GET/PUT /api/storefront/[siteId]/designs/[designId]
 */
import { request as pwRequest } from '@playwright/test';
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestWebsite } from './setup/helpers';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// ── Card 12: design-assets CRUD ─────────────────────────────────────────────

test.describe('Product designer — design-assets CRUD @product-designer', () => {
  let siteId: number;
  const cleanups: Array<() => Promise<void>> = [];

  test.beforeAll(async ({ clientApi }) => {
    const { website, cleanup } = await createTestWebsite(clientApi);
    siteId = website.id;
    cleanups.push(cleanup);
  });

  test.afterAll(async () => {
    await runCleanups(cleanups);
  });

  test('POST creates icon asset — lists by category — DELETE removes it', async ({ clientApi }) => {
    const ts = Date.now();
    const category = `Sports-${ts}`;

    // 1. Add an icon asset
    const postRes = await clientApi.post(
      `/api/portal/websites/${siteId}/store/design-assets`,
      {
        type: 'icon',
        name: `Star Icon ${ts}`,
        iconName: 'FaStar',
        iconPack: 'fa6',
        category,
        tags: ['star', 'favorite'],
        order: 1,
        active: true,
      },
    );
    expect(postRes.status).toBe(201);
    expect(postRes.data.success).toBe(true);
    expect(postRes.data.data).toHaveProperty('id');
    expect(postRes.data.data.type).toBe('icon');
    expect(postRes.data.data.iconName).toBe('FaStar');
    expect(postRes.data.data.iconPack).toBe('fa6');
    expect(postRes.data.data.category).toBe(category);
    const assetId: number = postRes.data.data.id;

    // 2. List by category — the created asset must appear
    const listRes = await clientApi.get(
      `/api/portal/websites/${siteId}/store/design-assets?type=icon&category=${encodeURIComponent(category)}`,
    );
    expect(listRes.status).toBe(200);
    expect(listRes.data.success).toBe(true);
    expect(Array.isArray(listRes.data.data)).toBe(true);
    const found = (listRes.data.data as Array<{ id: number }>).find(a => a.id === assetId);
    expect(found).toBeTruthy();

    // 3. DELETE removes the asset
    const delRes = await clientApi.delete(
      `/api/portal/websites/${siteId}/store/design-assets/${assetId}`,
    );
    expect(delRes.status).toBe(200);
    expect(delRes.data.success).toBe(true);

    // 4. List again — asset must be gone
    const listAfterRes = await clientApi.get(
      `/api/portal/websites/${siteId}/store/design-assets?category=${encodeURIComponent(category)}`,
    );
    expect(listAfterRes.status).toBe(200);
    const foundAfter = (listAfterRes.data.data as Array<{ id: number }>).find(a => a.id === assetId);
    expect(foundAfter).toBeUndefined();
  });

  test('POST rejects icon asset missing iconName', async ({ clientApi }) => {
    const ts = Date.now();
    const res = await clientApi.post(
      `/api/portal/websites/${siteId}/store/design-assets`,
      {
        type: 'icon',
        name: `Broken Icon ${ts}`,
        // Missing iconName and iconPack
      },
    );
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('POST rejects unknown type', async ({ clientApi }) => {
    const ts = Date.now();
    const res = await clientApi.post(
      `/api/portal/websites/${siteId}/store/design-assets`,
      {
        type: 'video',
        name: `Bad Type ${ts}`,
      },
    );
    expect(res.status).toBe(400);
  });

  test('GET rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get(
      `/api/portal/websites/${siteId}/store/design-assets`,
    );
    expect(res.status).toBe(401);
  });
});

// ── Card 13: design saved with explicit styleId retains it on GET ─────────────

test.describe('Product designer — styleId retention on GET @product-designer', () => {
  test.describe.configure({ mode: 'serial' });

  let siteId: number;
  let productId: number;
  let styleId: number;
  const cleanups: Array<() => Promise<void>> = [];

  test.beforeAll(async ({ clientApi }) => {
    // 1. Create a website
    const { website, cleanup } = await createTestWebsite(clientApi);
    siteId = website.id;
    cleanups.push(cleanup);

    // 2. Enable the store
    await clientApi.put(`/api/portal/websites/${siteId}/store/settings`, {
      enabled: true,
      storeName: `E2E StyleId Store ${Date.now()}`,
    });

    // 3. Create a designable product
    const ts = Date.now();
    const prodRes = await clientApi.post(
      `/api/portal/websites/${siteId}/store/products`,
      {
        name: `E2E StyleId Product ${ts}`,
        slug: `e2e-styleid-${ts}`,
        price: 1000,
        status: 'active',
        designable: true,
      },
    );
    if (prodRes.status !== 201) {
      throw new Error(
        `Failed to seed designable product: ${prodRes.status} ${JSON.stringify(prodRes.data)}`,
      );
    }
    productId = prodRes.data.data.id;
    cleanups.push(async () => {
      await clientApi
        .delete(`/api/portal/websites/${siteId}/store/products/${productId}`)
        .catch(() => {});
    });

    // 4. Create a product style
    const styleRes = await clientApi.post(
      `/api/portal/websites/${siteId}/store/products/${productId}/styles`,
      {
        name: `Black ${ts}`,
        colorHex: '#000000',
        order: 1,
        active: true,
      },
    );
    if (styleRes.status !== 201) {
      throw new Error(
        `Failed to seed product style: ${styleRes.status} ${JSON.stringify(styleRes.data)}`,
      );
    }
    styleId = styleRes.data.data.id;
  });

  test.afterAll(async () => {
    await runCleanups(cleanups);
  });

  test('PUT design with explicit styleId — GET returns the same styleId', async () => {
    // Use a standalone Playwright APIRequestContext so the sd_design_session
    // cookie persists from POST to PUT/GET within this single test.
    const api = await pwRequest.newContext({ baseURL: BASE_URL });
    try {
      // 1. Create design (anonymous)
      const createRes = await api.post(`/api/storefront/${siteId}/designs`, {
        data: {
          productId,
          name: 'StyleId Test Design',
          layers: [],
        },
      });
      expect(createRes.status()).toBe(201);
      const createBody = await createRes.json();
      expect(createBody.success).toBe(true);
      const designId: number = createBody.data.id;
      expect(typeof designId).toBe('number');

      // 2. PUT with an explicit styleId
      const putRes = await api.put(`/api/storefront/${siteId}/designs/${designId}`, {
        data: { styleId },
      });
      expect(putRes.status()).toBe(200);
      const putBody = await putRes.json();
      expect(putBody.success).toBe(true);
      expect(putBody.data.styleId).toBe(styleId);

      // 3. GET — styleId must be retained
      const getRes = await api.get(`/api/storefront/${siteId}/designs/${designId}`);
      expect(getRes.status()).toBe(200);
      const getBody = await getRes.json();
      expect(getBody.success).toBe(true);
      expect(getBody.data.styleId).toBe(styleId);
    } finally {
      await api.dispose();
    }
  });
});
