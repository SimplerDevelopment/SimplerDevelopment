/**
 * Product designer — admin setup (@product-designer @admin)
 *
 * Confirms the admin path that:
 *   1. Flips products.designable=true via the portal API,
 *   2. Adds a style + side via /styles + /styles/[id]/sides,
 *   3. Surfaces both back through the public storefront
 *      `/api/storefront/[siteId]/products/[productId]/styles` endpoint.
 *
 * The browser-driven half (clicking "Customer-designable product",
 * pressing "Open Designer Setup", driving the upload modal for thumbnail
 * + mockup) lands with Wave 2E — those tests are marked `test.skip` with
 * a TODO so this file is structurally ready the moment the admin UI ships.
 */
import { test, expect } from './setup/fixtures';
import { request as pwRequest } from '@playwright/test';
import { runCleanups, createTestWebsite } from './setup/helpers';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

let siteId: number;
let productId: number;

const fileCleanups: Array<() => Promise<void>> = [];

test.describe.configure({ mode: 'serial' });

test.describe('Product designer — admin setup @product-designer @admin', () => {
  test.beforeAll(async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    siteId = website.id;
    fileCleanups.push(async () => {
      await clientApi.delete(`/api/portal/cms/websites/${siteId}`).catch(() => {});
    });

    await clientApi.put(`/api/portal/websites/${siteId}/store/settings`, {
      enabled: true,
      storeName: 'E2E Admin Designer Store',
    });

    // Start with designable=false so the toggle test below has work to do.
    const prodRes = await clientApi.post(`/api/portal/websites/${siteId}/store/products`, {
      name: `Admin Designer Product ${Date.now()}`,
      slug: `admin-designer-${Date.now()}`,
      price: 3500,
      status: 'active',
      designable: false,
    });
    if (prodRes.status !== 201) {
      throw new Error(`Failed to seed product: ${prodRes.status} ${JSON.stringify(prodRes.data)}`);
    }
    productId = prodRes.data.data.id;
    fileCleanups.push(async () => {
      await clientApi.delete(`/api/portal/websites/${siteId}/store/products/${productId}`).catch(() => {});
    });
  });

  test.afterAll(async () => {
    await runCleanups(fileCleanups);
  });

  test('PUT product → designable=true persists the flag', async ({ clientApi }) => {
    const updated = await clientApi.put(
      `/api/portal/websites/${siteId}/store/products/${productId}`,
      { designable: true },
    );
    expect(updated.status).toBe(200);
    expect(updated.data.success).toBe(true);
    expect(updated.data.data.designable).toBe(true);

    // And re-reads confirm.
    const fetched = await clientApi.get(
      `/api/portal/websites/${siteId}/store/products/${productId}`,
    );
    expect(fetched.data.data.designable).toBe(true);
  });

  test('POST /styles + POST /styles/[id]/sides seeds a designable variant', async ({ clientApi }) => {
    const styleRes = await clientApi.post(
      `/api/portal/websites/${siteId}/store/products/${productId}/styles`,
      {
        name: 'Black',
        colorHex: '#000000',
        thumbnailUrl: 'https://placehold.co/64x64.png',
        active: true,
        order: 0,
      },
    );
    expect(styleRes.status).toBe(201);
    expect(styleRes.data.data.name).toBe('Black');
    expect(styleRes.data.data.colorHex).toBe('#000000');
    const styleId: number = styleRes.data.data.id;

    const sideRes = await clientApi.post(
      `/api/portal/websites/${siteId}/store/products/${productId}/styles/${styleId}/sides`,
      {
        side: 'front',
        label: 'Front',
        imageUrl: 'https://placehold.co/600x600.png',
        printableX: 100,
        printableY: 100,
        printableWidth: 400,
        printableHeight: 400,
      },
    );
    expect(sideRes.status).toBe(201);
    expect(sideRes.data.data.side).toBe('front');
    expect(sideRes.data.data.imageUrl).toContain('placehold.co');

    // The admin GET /styles list now reflects what we just created.
    const listRes = await clientApi.get(
      `/api/portal/websites/${siteId}/store/products/${productId}/styles`,
    );
    expect(listRes.status).toBe(200);
    const styleIds = listRes.data.data.map((s: { id: number }) => s.id);
    expect(styleIds).toContain(styleId);
  });

  test('public storefront /products/[id]/styles reflects the admin seed', async () => {
    // No auth needed — the public storefront endpoint is anonymous.
    const ctx = await pwRequest.newContext({ baseURL: BASE_URL });
    try {
      const res = await ctx.get(`/api/storefront/${siteId}/products/${productId}/styles`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);

      const style = body.data[0];
      expect(style.name).toBe('Black');
      expect(Array.isArray(style.sides)).toBe(true);
      expect(style.sides.length).toBeGreaterThan(0);
      expect(style.sides[0].side).toBe('front');
    } finally {
      await ctx.dispose();
    }
  });

  // ── Skipped until Wave 2E browser flow lands ───────────────────────────────
  test.skip('admin UI: navigate to product → toggle "Customer-designable" → save (Wave 2E)', async () => {
    // TODO(wave-2E): drive the portal page directly:
    //   /portal/websites/<siteId>/store/products/<productId>
    // Then click the "Customer-designable product" switch and the global
    // Save Product button. The admin page lives in
    // `app/portal/websites/[siteId]/store/products/[productId]/page.tsx`.
  });

  test.skip('admin UI: "Open Designer Setup" routes to /designer subpage (Wave 2E)', async () => {
    // TODO(wave-2E): assert the page renders the styles list, the
    // "Add Style" CTA, and the asset library tabs. Wave 2E owns the
    // page at `…/store/products/[productId]/designer`.
  });

  test.skip('admin UI: upload a style thumbnail + side mockup via the upload modal (Wave 2E)', async () => {
    // TODO(wave-2E): exercise MediaUploadModal end-to-end against a local
    // PNG fixture. Verify the upload returns a URL that round-trips back
    // into the productStyles.thumbnailUrl / productSides.imageUrl columns.
  });
});
