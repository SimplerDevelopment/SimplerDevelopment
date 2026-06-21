/**
 * cov-u16.spec.ts — Pitch Decks Product Designer E2E Coverage
 *
 * Cards (indices 8..11 from board "Pitch Decks Product Designer E2E Audit"):
 *  [8] Deck listing enforces clientId tenancy — client A cannot retrieve client B decks
 *  [9] Product designer: POST /designs/[id]/finalize locks design for order placement (returns 200)
 * [10] Product designer: POST /designs/[id]/clone creates independent copy under same session
 * [11] Product designer: POST /designs/[id]/save-as-template marks isTemplate=true and lists in templates
 */
import { request as pwRequest } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { test, expect } from './setup/fixtures';
import { ApiClient } from './setup/api-client';
import { runCleanups, createTestWebsite } from './setup/helpers';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// ─── Shared storefront helpers ────────────────────────────────────────────────

/** Create an anonymous Playwright request context that auto-carries cookies */
async function makeAnonCtx(): Promise<APIRequestContext> {
  return pwRequest.newContext({ baseURL: BASE_URL });
}

/** Enable the store for a site via the portal API */
async function enableStore(
  api: { put: (url: string, body?: Record<string, unknown>) => Promise<unknown> },
  siteId: number,
) {
  await api.put(`/api/portal/websites/${siteId}/store/settings`, {
    enabled: true,
    storeName: `E2E Store ${Date.now()}`,
  });
}

/** Create a designable product on a site.
 *  Pass isDesignable=true for the legacy `designs` table path (finalize / save-as-template).
 *  Pass designable=true for the new `productDesigns` table path (clone). */
async function createDesignableProduct(
  api: {
    post: (
      url: string,
      body?: Record<string, unknown>,
    ) => Promise<{ status: number; data: { success: boolean; data: { id: number; slug: string } } }>;
    delete: (url: string) => Promise<unknown>;
  },
  siteId: number,
  flags: { isDesignable?: boolean; designable?: boolean } = { designable: true },
): Promise<{ productId: number; cleanup: () => Promise<void> }> {
  const ts = Date.now();
  const slug = `e2e-u16-${ts}`;
  const res = await api.post(`/api/portal/websites/${siteId}/store/products`, {
    name: `E2E U16 Product ${ts}`,
    slug,
    price: 999,
    status: 'active',
    ...flags,
  });
  if (res.status !== 201) {
    throw new Error(`Failed to create product: ${res.status} ${JSON.stringify(res.data)}`);
  }
  const productId = res.data.data.id;
  const cleanup = async () => {
    await api.delete(`/api/portal/websites/${siteId}/store/products/${productId}`).catch(() => {});
  };
  return { productId, cleanup };
}

// ─── Card 8: Deck listing enforces clientId tenancy ───────────────────────────

test.describe('Pitch Decks — tenancy: client A cannot retrieve client B decks @pitch-decks @tenancy', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('client B session cannot see or retrieve a deck created by client A', async ({ clientApi, adminApi }) => {
    // 1) Create a deck as the seeded client tenant (client A, clientId=1).
    const ts = Date.now();
    const createRes = await clientApi.post('/api/portal/tools/pitch-decks', {
      title: `Tenancy Test Deck ${ts}`,
      description: 'E2E tenancy check',
    });
    expect(createRes.status).toBe(200);
    expect(createRes.data.success).toBe(true);
    const deckId: number = createRes.data.data.id;
    const deck = createRes.data.data;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/tools/pitch-decks/${deckId}`).catch(() => {});
    });

    // 2) Create a second client (client B) via the admin API so we have a genuine
    //    cross-tenant caller.
    const rand = Math.random().toString(36).slice(2, 8);
    const clientBEmail = `client-b-${ts}-${rand}@example.com`;
    const clientBPassword = 'password123';
    const createClientBRes = await adminApi.post('/api/admin/portal/clients', {
      name: `Client B ${ts}`,
      email: clientBEmail,
      password: clientBPassword,
      company: `Client B Corp ${ts}`,
    });
    expect(createClientBRes.status).toBe(200);
    const clientBId: number = createClientBRes.data.data.client.id;
    // Note: there is no admin DELETE /clients endpoint, so client B is a data leak
    // in the test DB. Acceptable for a test-only client with a timestamped email.
    void clientBId; // suppress unused-var lint

    // 3) Log in as client B.
    const clientBApi = new ApiClient(clientBEmail, clientBPassword);
    await clientBApi.ensure();
    cleanups.push(async () => {
      await clientBApi.dispose();
    });

    // 4) Client B must NOT be able to retrieve client A's deck by ID.
    const crossRead = await clientBApi.get(`/api/portal/tools/pitch-decks/${deckId}`);
    expect(crossRead.status).toBe(404);

    // 5) Client B's deck list must NOT contain client A's deck.
    const clientBList = await clientBApi.get('/api/portal/tools/pitch-decks');
    // Client B has no pitch-decks service entitlement → 402, OR empty list → 200
    if (clientBList.status === 200) {
      const listedIds = (clientBList.data?.data ?? []).map((d: { id: number }) => d.id);
      expect(listedIds).not.toContain(deckId);
    } else {
      // 402 (no service entitlement), 403, or 404 are all acceptable cross-tenant outcomes.
      expect([402, 403, 404]).toContain(clientBList.status);
    }

    // 6) Verify the deck IS retrievable by the original client A (correctness check).
    const ownRead = await clientApi.get(`/api/portal/tools/pitch-decks/${deckId}`);
    expect(ownRead.status).toBe(200);
    expect(ownRead.data.data.id).toBe(deckId);
    expect(ownRead.data.data.clientId).toBe(deck.clientId);
  });
});

// ─── Card 9: POST /designs/[id]/finalize locks design for order placement ─────
//
// NOTE: The new product-designer flow creates rows in the `productDesigns` table
// (integer IDs). The `finalize` route is built for the LEGACY `designs` table
// (UUID IDs). Since there is no longer a public API that creates `designs` rows
// in the new flow, the happy-path finalize test cannot be exercised without
// direct DB seeding. The tests below cover the route's existence + error guards.

test.describe('Product designer — POST /designs/[id]/finalize @product-designer', () => {
  let siteId: number;
  const fileCleanups: Array<() => Promise<void>> = [];

  test.beforeAll(async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    siteId = website.id;
    fileCleanups.push(async () => {
      await clientApi.delete(`/api/portal/cms/websites/${siteId}`).catch(() => {});
    });
    await enableStore(clientApi, siteId);
  });

  test.afterAll(async () => {
    await runCleanups(fileCleanups);
  });

  test('POST /designs/[id]/finalize rejects non-UUID id with 400', async () => {
    // Integer IDs (from productDesigns) are not valid for the legacy finalize route.
    const ctx = await makeAnonCtx();
    try {
      const res = await ctx.post(
        `/api/storefront/${siteId}/designs/123/finalize`,
        { data: {} },
      );
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
    } finally {
      await ctx.dispose();
    }
  });

  test('POST /designs/[id]/finalize returns 404 for unknown UUID', async () => {
    // A well-formed UUID that doesn't exist in the designs table → 404.
    const unknownUUID = '00000000-0000-4000-8000-000000000001';
    const ctx = await makeAnonCtx();
    try {
      const res = await ctx.post(
        `/api/storefront/${siteId}/designs/${unknownUUID}/finalize`,
        { data: { sessionId: 'any-session' } },
      );
      // The route will either 404 (design not found) or 403 (forbidden).
      // Both indicate the route exists and the auth/ownership guard runs.
      expect([403, 404]).toContain(res.status());
    } finally {
      await ctx.dispose();
    }
  });
});

// ─── Card 10: POST /designs/[id]/clone creates independent copy ───────────────

test.describe('Product designer — POST /designs/[id]/clone @product-designer', () => {
  let siteId: number;
  let productId: number;
  const fileCleanups: Array<() => Promise<void>> = [];

  test.beforeAll(async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    siteId = website.id;
    fileCleanups.push(async () => {
      await clientApi.delete(`/api/portal/cms/websites/${siteId}`).catch(() => {});
    });

    await enableStore(clientApi, siteId);

    const { productId: pid, cleanup } = await createDesignableProduct(clientApi, siteId, {
      designable: true,
    });
    productId = pid;
    fileCleanups.push(cleanup);
  });

  test.afterAll(async () => {
    await runCleanups(fileCleanups);
  });

  test('clone creates an independent copy with same productId under caller session', async () => {
    // Use anonymous cookie-based context (matches product-designer-api.spec.ts pattern).
    const ownerCtx = await makeAnonCtx();
    let sourceId: number | null = null;
    let cloneId: number | null = null;
    try {
      // Create a source productDesign via the anonymous-cookie flow.
      const createRes = await ownerCtx.post(`/api/storefront/${siteId}/designs`, {
        data: { productId, name: 'Clone Source' },
      });
      expect(createRes.status()).toBe(201);
      const createBody = await createRes.json();
      expect(createBody.success).toBe(true);
      sourceId = createBody.data.id as number;

      // Clone it.
      const cloneRes = await ownerCtx.post(
        `/api/storefront/${siteId}/designs/${sourceId}/clone`,
        { data: { name: 'Clone Copy' } },
      );
      expect(cloneRes.status()).toBe(201);
      const cloneBody = await cloneRes.json();
      expect(cloneBody.success).toBe(true);
      cloneId = cloneBody.data.id as number;

      // Clone must be a different row.
      expect(cloneId).not.toBe(sourceId);

      // Clone must have the same productId.
      expect(cloneBody.data.productId).toBe(productId);

      // Clone must not be a template.
      expect(cloneBody.data.isTemplate).toBe(false);

      // Source must still exist and be unchanged.
      const sourceRead = await ownerCtx.get(`/api/storefront/${siteId}/designs/${sourceId}`);
      expect(sourceRead.status()).toBe(200);
      const sourceBody = await sourceRead.json();
      expect(sourceBody.data.name).toBe('Clone Source');

      // Soft-delete both to clean up.
      await ownerCtx.delete(`/api/storefront/${siteId}/designs/${sourceId}`).catch(() => {});
      await ownerCtx.delete(`/api/storefront/${siteId}/designs/${cloneId}`).catch(() => {});
    } finally {
      await ownerCtx.dispose();
    }
  });

  test('clone of a non-existent design returns 404', async () => {
    const ctx = await makeAnonCtx();
    try {
      const res = await ctx.post(
        `/api/storefront/${siteId}/designs/99999999/clone`,
        { data: {} },
      );
      expect(res.status()).toBe(404);
    } finally {
      await ctx.dispose();
    }
  });
});

// ─── Card 11: POST /designs/[id]/save-as-template ────────────────────────────
//
// NOTE: Like `finalize`, the save-as-template route operates on the LEGACY
// `designs` table (UUID IDs). The current product-designer flow creates
// `productDesigns` (integer IDs) via cookie-based sessions. There is no public
// API to create a `designs` row in the new flow — so the happy-path cannot be
// exercised without direct DB seeding.
// The tests below cover route existence + input-validation guards.

test.describe('Product designer — POST /designs/[id]/save-as-template @product-designer', () => {
  let siteId: number;
  const fileCleanups: Array<() => Promise<void>> = [];

  test.beforeAll(async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    siteId = website.id;
    fileCleanups.push(async () => {
      await clientApi.delete(`/api/portal/cms/websites/${siteId}`).catch(() => {});
    });
    await enableStore(clientApi, siteId);
  });

  test.afterAll(async () => {
    await runCleanups(fileCleanups);
  });

  test('POST /designs/[id]/save-as-template rejects non-UUID id with 400', async () => {
    // Integer IDs (productDesigns) are invalid for this legacy route.
    const ctx = await makeAnonCtx();
    try {
      const res = await ctx.post(
        `/api/storefront/${siteId}/designs/456/save-as-template`,
        { data: {} },
      );
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
    } finally {
      await ctx.dispose();
    }
  });

  test('POST /designs/[id]/save-as-template returns 403/404 for unknown UUID', async () => {
    // A well-formed UUID not in the designs table → 403 or 404.
    const unknownUUID = '00000000-0000-4000-8000-000000000002';
    const ctx = await makeAnonCtx();
    try {
      const res = await ctx.post(
        `/api/storefront/${siteId}/designs/${unknownUUID}/save-as-template`,
        { data: { sessionId: 'any-session' } },
      );
      expect([403, 404]).toContain(res.status());
    } finally {
      await ctx.dispose();
    }
  });

  test('GET ?templates=1 returns template list for a site', async () => {
    // The templates list endpoint (used by the designer to seed the sidebar)
    // must return an array even when no templates exist for the site yet.
    const ctx = await makeAnonCtx();
    try {
      const res = await ctx.get(`/api/storefront/${siteId}/designs?templates=1`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      // Every returned item must be a template.
      for (const t of body.data as Array<{ isTemplate: boolean }>) {
        expect(t.isTemplate).toBe(true);
      }
    } finally {
      await ctx.dispose();
    }
  });
});
