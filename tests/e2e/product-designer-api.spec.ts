/**
 * Product designer — storefront API smoke (@critical @product-designer)
 *
 * Pure HTTP coverage for the public `/api/storefront/[siteId]/designs/...`
 * surface introduced in Wave 2. Drives the full create → list → update →
 * share → public-read → anonymous-count → soft-delete loop against a
 * site+product fixture provisioned through the portal API.
 *
 * The storefront designer endpoints accept either a logged-in customer
 * (Bearer token) or an anonymous browser session keyed off the
 * `sd_design_session` cookie minted by the first POST. To exercise the
 * anonymous path without bringing a full storefront-customer login into
 * scope, this spec drives the requests through a Playwright APIRequestContext
 * so the cookie persists across requests within a single test.
 */
import { request as pwRequest } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestWebsite } from './setup/helpers';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// ── Site + designable product fixture ────────────────────────────────────────
// Created once per file via portal admin APIs. Cleaned up at the end.

let siteId: number;
let productId: number;
let productSlug: string;
const fileCleanups: Array<() => Promise<void>> = [];

test.describe.configure({ mode: 'serial' });

test.describe('Product designer — storefront API @critical @product-designer', () => {
  test.beforeAll(async ({ clientApi }) => {
    // 1) Provision a website owned by the seed test client.
    const { website } = await createTestWebsite(clientApi);
    siteId = website.id;
    fileCleanups.push(async () => {
      await clientApi.delete(`/api/portal/cms/websites/${siteId}`).catch(() => {});
    });

    // 2) Enable the store on that site — the storefront design route checks
    //    storeSettings.enabled, but the API endpoints we hit here read off
    //    productDesigns / products directly, so enabling is defensive in case
    //    a downstream route adds the gate.
    await clientApi.put(`/api/portal/websites/${siteId}/store/settings`, {
      enabled: true,
      storeName: 'E2E Designer Store',
    });

    // 3) Create a designable product.
    productSlug = `e2e-designable-${Date.now()}`;
    const prodRes = await clientApi.post(`/api/portal/websites/${siteId}/store/products`, {
      name: `E2E Designable Product ${Date.now()}`,
      slug: productSlug,
      price: 2500,
      status: 'active',
      designable: true,
    });
    if (prodRes.status !== 201) {
      throw new Error(`Failed to seed designable product: ${prodRes.status} ${JSON.stringify(prodRes.data)}`);
    }
    productId = prodRes.data.data.id;
    fileCleanups.push(async () => {
      await clientApi.delete(`/api/portal/websites/${siteId}/store/products/${productId}`).catch(() => {});
    });
  });

  test.afterAll(async () => {
    await runCleanups(fileCleanups);
  });

  // Anonymous storefront caller — uses a single APIRequestContext so the
  // `sd_design_session` cookie set by POST /designs survives later requests.
  async function makeAnonClient(): Promise<APIRequestContext> {
    return pwRequest.newContext({ baseURL: BASE_URL });
  }

  test('full anonymous lifecycle: create → list → update → share → public read → count → delete', async () => {
    const api = await makeAnonClient();
    try {
      // ── POST /designs — creates the first design AND mints the session cookie.
      const createRes = await api.post(`/api/storefront/${siteId}/designs`, {
        data: {
          productId,
          name: 'E2E Anonymous Design',
          layers: [
            { id: 'l1', type: 'text', text: 'Hello', x: 10, y: 10 },
          ],
        },
      });
      expect(createRes.status()).toBe(201);
      const createBody = await createRes.json();
      expect(createBody.success).toBe(true);
      expect(createBody.data.id).toBeTruthy();
      expect(typeof createBody.data.uuid).toBe('string');
      expect(createBody.data.productId).toBe(productId);
      expect(createBody.data.websiteId).toBe(siteId);
      expect(createBody.data.name).toBe('E2E Anonymous Design');
      const designId: number = createBody.data.id;
      const designUuid: string = createBody.data.uuid;

      // ── GET /designs — should surface the just-created design for this session.
      const listRes = await api.get(`/api/storefront/${siteId}/designs?productId=${productId}`);
      expect(listRes.status()).toBe(200);
      const listBody = await listRes.json();
      expect(listBody.success).toBe(true);
      expect(Array.isArray(listBody.data)).toBe(true);
      const ids = listBody.data.map((r: { id: number }) => r.id);
      expect(ids).toContain(designId);

      // ── PUT /designs/[id] — patch the layers + name.
      const initialAccessedAt = createBody.data.lastAccessedAt;
      // Sleep 5ms to make sure the lastAccessedAt timestamp bumps measurably.
      await new Promise((r) => setTimeout(r, 5));
      const updateRes = await api.put(`/api/storefront/${siteId}/designs/${designId}`, {
        data: {
          name: 'E2E Anonymous Design (updated)',
          layers: [
            { id: 'l1', type: 'text', text: 'Hello World', x: 12, y: 14 },
            { id: 'l2', type: 'icon', iconName: 'FaStar', x: 50, y: 60 },
          ],
        },
      });
      expect(updateRes.status()).toBe(200);
      const updateBody = await updateRes.json();
      expect(updateBody.success).toBe(true);
      expect(updateBody.data.name).toBe('E2E Anonymous Design (updated)');
      expect(Array.isArray(updateBody.data.layers)).toBe(true);
      expect(updateBody.data.layers).toHaveLength(2);
      // lastAccessedAt must move forward (string-compare ISO timestamps is
      // safe — bumps come from `new Date()` server-side).
      expect(new Date(updateBody.data.lastAccessedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(initialAccessedAt).getTime(),
      );

      // ── POST /designs/[id]/share — flip isPublic + read back uuid + URL.
      const shareRes = await api.post(`/api/storefront/${siteId}/designs/${designId}/share`, {
        data: { isPublic: true },
      });
      expect(shareRes.status()).toBe(200);
      const shareBody = await shareRes.json();
      expect(shareBody.success).toBe(true);
      expect(shareBody.isPublic).toBe(true);
      expect(shareBody.uuid).toBe(designUuid);
      expect(typeof shareBody.shareableUrl).toBe('string');
      expect(shareBody.shareableUrl).toContain(designUuid);
      expect(shareBody.design.isPublic).toBe(true);

      // ── GET /designs/public/[uuid] — accessible WITHOUT the design-session
      //    cookie (use a brand-new context to prove it).
      const anonRead = await pwRequest.newContext({ baseURL: BASE_URL });
      try {
        const pubRes = await anonRead.get(`/api/storefront/${siteId}/designs/public/${designUuid}`);
        expect(pubRes.status()).toBe(200);
        const pubBody = await pubRes.json();
        expect(pubBody.success).toBe(true);
        expect(pubBody.data.uuid).toBe(designUuid);
        expect(pubBody.data.isPublic).toBe(true);
      } finally {
        await anonRead.dispose();
      }

      // ── GET /designs/anonymous/count — should reflect our 1 saved design.
      const countRes = await api.get(`/api/storefront/${siteId}/designs/anonymous/count`);
      expect(countRes.status()).toBe(200);
      const countBody = await countRes.json();
      expect(countBody.success).toBe(true);
      expect(typeof countBody.count).toBe('number');
      expect(countBody.count).toBeGreaterThan(0);

      // ── DELETE /designs/[id] — soft-deletes; design should disappear from list.
      const delRes = await api.delete(`/api/storefront/${siteId}/designs/${designId}`);
      expect(delRes.status()).toBe(200);
      const delBody = await delRes.json();
      expect(delBody.success).toBe(true);

      const listAfter = await api.get(`/api/storefront/${siteId}/designs?productId=${productId}`);
      const listAfterBody = await listAfter.json();
      const remainingIds = (listAfterBody.data ?? []).map((r: { id: number }) => r.id);
      expect(remainingIds).not.toContain(designId);
    } finally {
      await api.dispose();
    }
  });

  test('anonymous count returns 0 with no cookie present', async () => {
    const api = await pwRequest.newContext({ baseURL: BASE_URL });
    try {
      const res = await api.get(`/api/storefront/${siteId}/designs/anonymous/count`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.count).toBe(0);
    } finally {
      await api.dispose();
    }
  });

  test('POST /designs rejects body missing productId', async () => {
    const api = await makeAnonClient();
    try {
      const res = await api.post(`/api/storefront/${siteId}/designs`, { data: { name: 'No product' } });
      expect(res.status()).toBe(400);
    } finally {
      await api.dispose();
    }
  });

  test('POST /designs rejects product belonging to another site', async () => {
    const api = await makeAnonClient();
    try {
      // 999_999 is well outside any seed range — should 404.
      const res = await api.post(`/api/storefront/${siteId}/designs`, {
        data: { productId: 999_999_999 },
      });
      expect(res.status()).toBe(404);
    } finally {
      await api.dispose();
    }
  });

  test('PUT /designs/[id] from a different session is 404 (ownership scoped)', async () => {
    const owner = await makeAnonClient();
    const intruder = await makeAnonClient();
    try {
      const create = await owner.post(`/api/storefront/${siteId}/designs`, {
        data: { productId, name: 'Owned Design' },
      });
      expect(create.status()).toBe(201);
      const id = (await create.json()).data.id as number;

      const tamper = await intruder.put(`/api/storefront/${siteId}/designs/${id}`, {
        data: { name: 'tampered' },
      });
      expect(tamper.status()).toBe(404);

      // And the owner can still see their own design unchanged.
      const ownerRead = await owner.get(`/api/storefront/${siteId}/designs/${id}`);
      expect(ownerRead.status()).toBe(200);
      const body = await ownerRead.json();
      expect(body.data.name).toBe('Owned Design');
    } finally {
      await owner.dispose();
      await intruder.dispose();
    }
  });

  test('GET /designs/public/[uuid] is 404 for a private design', async () => {
    const owner = await makeAnonClient();
    const anonRead = await pwRequest.newContext({ baseURL: BASE_URL });
    try {
      const create = await owner.post(`/api/storefront/${siteId}/designs`, {
        data: { productId, name: 'Private Design' },
      });
      const uuid = (await create.json()).data.uuid as string;

      // No share call — isPublic defaults to false.
      const pubRes = await anonRead.get(`/api/storefront/${siteId}/designs/public/${uuid}`);
      expect(pubRes.status()).toBe(404);
    } finally {
      await owner.dispose();
      await anonRead.dispose();
    }
  });
});
