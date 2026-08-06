/**
 * Print-on-demand — a DESIGNED order end to end (@ecommerce @pod @critical)
 *
 * `storefront-checkout-golden-path.spec.ts` covers checkout for an *undesigned*
 * product, and asserts the order item carries no print files. This is the
 * inverse, and it is the actual POD money path:
 *
 *   design → print files → cart (by design uuid) → checkout → order item
 *
 * The contract under test is the **freeze**. At checkout, the route copies
 * `productDesigns.printFiles` onto `orderItems.printFiles`, with the front side
 * duplicated into `printReadyUrl`. `submitPODOrder` accepts nothing else — it
 * throws rather than fall back to a mockup (see ADR
 * print-file-is-artwork-not-mockup) — so if the freeze regresses, every POD
 * order fails at fulfilment, after the customer has paid.
 *
 * It also exercises the `productDesigns` cart join added 2026-08-04. That join
 * casts (`productDesigns.uuid = cartItems.designId::text`) because the columns
 * are uuid vs text; a regression there is a Postgres type error, not a silent
 * miss, and only a cart containing a real design will hit it.
 *
 * WHAT THIS SPEC DELIBERATELY DOES NOT DO — and why:
 *
 * The print files are seeded straight into the database rather than produced by
 * POST /designs/[id]/print-file. That route renders server-side with sharp and
 * uploads to S3, and S3_ENDPOINT points at `http://minio:9000` — a
 * docker-compose service. On a machine without Docker running there is no
 * object store to upload to, so driving the real render would make this spec
 * fail for an environmental reason on the most revenue-critical path in the
 * product. The renderer itself is covered by unit tests
 * (`lib-printing-render-print-file.test.ts`,
 * `api-storefront-print-file-validation.test.ts`); what those cannot cover is
 * whether the resulting URLs survive the trip onto an order. That is this file.
 *
 * If minio is running, the render hop is worth adding here — see the skipped
 * test at the bottom, which documents exactly what it should assert.
 */
import { request as pwRequest } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { test, expect } from './setup/fixtures';
import type { ApiClient } from './setup/api-client';
import { runCleanups, createTestWebsite } from './setup/helpers';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY ?? '';
const HAS_STRIPE_TEST_KEY = STRIPE_KEY.startsWith('sk_test_');

// scripts/test.sh pins DATABASE_URL to a vetted local target before any child
// can re-resolve .env (which holds a REMOTE url). Falling back to the local
// default keeps a direct `npx playwright test` honest rather than silently
// reaching for whatever .env has.
const DB_URL = process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/simplerdev';

/** Run one statement without a shell, so `$` in a URL can't be expanded. */
function psql(sql: string): string {
  return execFileSync('psql', [DB_URL, '-At', '-c', sql], { encoding: 'utf8' }).trim();
}

/** Stand up a throwaway site whose store can actually charge. */
async function provisionStoreSite(
  clientApi: ApiClient,
  adminApi: ApiClient,
  cleanups: Array<() => Promise<void>>,
): Promise<number> {
  const { website, cleanup } = await createTestWebsite(clientApi);
  cleanups.push(cleanup);
  const siteId = (website as { id: number }).id;

  const gate = await adminApi.patch(`/api/admin/portal/websites/${siteId}`, {
    stripeByokAllowed: true,
  });
  expect(gate.status, 'admin must be able to grant BYOK').toBe(200);

  const settings = await clientApi.put(`/api/portal/websites/${siteId}/store/settings`, {
    enabled: true,
    storeName: 'E2E POD Store',
    stripeMode: 'byok',
    stripeSecretKeyPlaintext: STRIPE_KEY,
    taxRate: 0,
    taxInclusive: false,
  });
  expect(settings.status, 'store must accept BYOK config').toBe(200);
  return siteId;
}

/** A product the designer will actually open for. */
async function createDesignableProduct(
  clientApi: ApiClient,
  siteId: number,
  cleanups: Array<() => Promise<void>>,
): Promise<number> {
  const ts = Date.now();
  const res = await clientApi.post(`/api/portal/websites/${siteId}/store/products`, {
    name: `E2E POD Product ${ts}`,
    slug: `e2e-pod-${ts}`,
    price: 3200,
    status: 'active',
    trackInventory: false,
    designable: true,
  });
  expect(res.status, 'designable product fixture must be created').toBe(201);
  const id = (res.data.data as { id: number }).id;
  cleanups.push(async () => {
    await clientApi.delete(`/api/portal/websites/${siteId}/store/products/${id}`);
  });
  return id;
}

/**
 * Create an anonymous design and return its uuid plus the session id the route
 * minted. The cart authorizes a designId by comparing the design's `sessionId`
 * to the cart's own `sessionId`, so the caller needs the minted value — and it
 * is only ever returned as the `sd_design_session` cookie, never in the body.
 */
async function createAnonymousDesign(
  ctx: APIRequestContext,
  siteId: number,
  productId: number,
): Promise<{ uuid: string; sessionId: string }> {
  const res = await ctx.post(`/api/storefront/${siteId}/designs`, {
    data: {
      productId,
      name: 'E2E POD Design',
      layers: [
        { id: 'l1', type: 'text', side: 'front', text: 'E2E', size: 48, color: '#111111',
          position: { x: 120, y: -420 } },
        { id: 'l2', type: 'text', side: 'back', text: 'BACK', size: 32, color: '#222222',
          position: { x: 140, y: -400 } },
      ],
    },
  });
  expect(res.status(), 'design must be created').toBe(201);
  const uuid = (await res.json()).data.uuid as string;

  const state = await ctx.storageState();
  const cookie = state.cookies.find((c) => c.name === 'sd_design_session');
  expect(cookie?.value, 'POST /designs must mint an anonymous design session').toBeTruthy();

  return { uuid, sessionId: cookie!.value };
}

// Every test here provisions its own site (create website → admin BYOK grant →
// store settings) before it does anything domain-specific, and the golden path
// then makes a REAL Stripe call. That fixed cost alone can exceed Playwright's
// 60s default on a loaded machine — observed as timeouts on the first run and
// passes on retry, which is the signature of a budget that is too tight rather
// than a hang. Raised deliberately instead of left to flake.
test.describe.configure({ timeout: 180_000 });

test.describe('POD — designed order end to end @ecommerce @pod @critical', () => {
  test.skip(
    !HAS_STRIPE_TEST_KEY,
    'checkout creates a real PaymentIntent — needs STRIPE_SECRET_KEY=sk_test_…',
  );

  test('design → print files → cart → checkout freezes print files onto the order', async ({
    clientApi,
    adminApi,
    unauthApi,
  }) => {
    const cleanups: Array<() => Promise<void>> = [];
    const anon = await pwRequest.newContext({ baseURL: BASE_URL });
    try {
      const siteId = await provisionStoreSite(clientApi, adminApi, cleanups);
      const productId = await createDesignableProduct(clientApi, siteId, cleanups);

      // ── Design ─────────────────────────────────────────────────────────────
      const { uuid, sessionId } = await createAnonymousDesign(anon, siteId, productId);

      // ── Print files (seeded — see the header for why not rendered) ─────────
      const front = `https://example-cdn.test/print/${uuid}-front.png`;
      const back = `https://example-cdn.test/print/${uuid}-back.png`;
      psql(
        `UPDATE product_designs
            SET print_files = '${JSON.stringify({ front, back })}'::jsonb
          WHERE uuid = '${uuid}';`,
      );
      expect(
        psql(`SELECT print_files->>'front' FROM product_designs WHERE uuid = '${uuid}';`),
        'print files must be recorded on the design before checkout',
      ).toBe(front);

      // ── Cart, by design uuid ───────────────────────────────────────────────
      const add = await unauthApi.post(`/api/storefront/${siteId}/cart`, {
        sessionId,
        productId,
        quantity: 1,
        designId: uuid,
      });
      expect(add.status, `add designed item to cart failed: ${JSON.stringify(add.data)}`).toBe(200);

      // Reading it back is what exercises the uuid = designId::text join.
      const cart = await unauthApi.get(`/api/storefront/${siteId}/cart?sessionId=${sessionId}`);
      expect(cart.status).toBe(200);
      const items = cart.data.data.items as Array<{ productId: number; designId: string | null }>;
      expect(items).toHaveLength(1);
      expect(items[0].designId).toBe(uuid);

      // ── Checkout ───────────────────────────────────────────────────────────
      const customerEmail = `e2e-pod-${Date.now()}@example.com`;
      const checkout = await unauthApi.post(`/api/storefront/${siteId}/checkout`, {
        sessionId,
        customerEmail,
        customerName: 'E2E POD Buyer',
      });
      expect(checkout.status, `checkout failed: ${JSON.stringify(checkout.data)}`).toBe(200);
      const orderNumber = (checkout.data.data as { orderNumber: string }).orderNumber;

      // ── The freeze ─────────────────────────────────────────────────────────
      const order = await unauthApi.get(
        `/api/storefront/${siteId}/orders/${orderNumber}?email=${encodeURIComponent(customerEmail)}`,
      );
      expect(order.status).toBe(200);
      const item = (order.data.data.items as Array<{
        designId: string | null;
        printReadyUrl: string | null;
        printFiles: Record<string, string> | null;
      }>)[0];

      expect(item.designId, 'the order item must keep the design FK').toBe(uuid);

      // printReadyUrl is the front-side shorthand submitPODOrder reads first.
      expect(item.printReadyUrl).toBe(front);

      // Every designed side must survive, not just the front — a multi-side
      // design that loses its back is a garment printed half-blank.
      expect(item.printFiles).toEqual({ front, back });

      // ── And it must be frozen, not a live lookup ───────────────────────────
      // Deleting the design after purchase must not change the order. This is
      // the whole reason the columns are copied rather than joined.
      psql(`UPDATE product_designs SET deleted_at = now() WHERE uuid = '${uuid}';`);
      const after = await unauthApi.get(
        `/api/storefront/${siteId}/orders/${orderNumber}?email=${encodeURIComponent(customerEmail)}`,
      );
      expect(after.status).toBe(200);
      const afterItem = (after.data.data.items as Array<{ printFiles: Record<string, string> | null }>)[0];
      expect(afterItem.printFiles, 'print files must survive deletion of the design').toEqual({
        front,
        back,
      });
    } finally {
      await anon.dispose();
      await runCleanups(cleanups);
    }
  });

  test('cart refuses a design belonging to another session', async ({
    clientApi,
    adminApi,
    unauthApi,
  }) => {
    const cleanups: Array<() => Promise<void>> = [];
    const anon = await pwRequest.newContext({ baseURL: BASE_URL });
    try {
      const siteId = await provisionStoreSite(clientApi, adminApi, cleanups);
      const productId = await createDesignableProduct(clientApi, siteId, cleanups);
      const { uuid } = await createAnonymousDesign(anon, siteId, productId);

      // Someone else's cart session, quoting a design uuid they don't own.
      const res = await unauthApi.post(`/api/storefront/${siteId}/cart`, {
        sessionId: `e2e-not-the-owner-${Date.now()}`,
        productId,
        quantity: 1,
        designId: uuid,
      });

      expect(res.status).toBe(403);
    } finally {
      await anon.dispose();
      await runCleanups(cleanups);
    }
  });

  test('print-file route rejects an unknown design', async ({ clientApi, adminApi, unauthApi }) => {
    const cleanups: Array<() => Promise<void>> = [];
    try {
      const siteId = await provisionStoreSite(clientApi, adminApi, cleanups);

      // NOTE: `[designId]` here is the INTEGER primary key, not the share-link
      // uuid the cart uses. The two identifiers are easy to confuse — the cart
      // takes productDesigns.uuid, these routes take productDesigns.id — so a
      // uuid lands as NaN and gets a 400 from the id guard, never reaching the
      // lookup. Using a non-existent integer is what actually exercises the
      // "design not found" path. No S3 needed either way: the route resolves
      // the design before it renders anything.
      const res = await unauthApi.post(
        `/api/storefront/${siteId}/designs/999999999/print-file`,
        { side: 'front' },
      );
      expect([403, 404]).toContain(res.status);
    } finally {
      await runCleanups(cleanups);
    }
  });

  // Needs `docker compose up -d minio` (S3_ENDPOINT is http://minio:9000).
  // Unskip when object storage is available in the test environment.
  test.skip('print-file route renders and records a real print file', async () => {
    // Should: create a design with layers on a product that has a style + side
    // (mockup image + printable bounds), POST {side:'front'}, then assert
    //   - 200 and a URL in the response
    //   - productDesigns.printFiles.front is set to that URL
    //   - the rendered PNG has a real alpha channel (artwork, never a mockup)
    //   - its long edge is >= MIN_PRINT_EDGE_PX (1500)
    // The last two are the guarantees validatePrintFile enforces and the
    // reason a mockup can never reach Printful.
  });
});
