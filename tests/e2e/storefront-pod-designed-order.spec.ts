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
 * WHY THE FREEZE TEST SEEDS ITS PRINT FILES:
 *
 * The golden path writes print files straight to the database rather than
 * rendering them, so that the FREEZE stays testable on any machine. The render
 * hop needs object storage (S3_ENDPOINT → minio), and making the most
 * revenue-critical assertion in the suite depend on Docker being up would mean
 * it fails for environmental reasons rather than real ones.
 *
 * The render itself is covered separately, at the bottom of this file, against
 * real object storage — it skips (loudly) when minio is unreachable. Run it
 * with:
 *
 *   docker compose up -d minio minio-init
 *   S3_ENDPOINT=http://localhost:9000 S3_PUBLIC_ENDPOINT=http://localhost:9000 \
 *   S3_BUCKET_NAME=simplerdev-media S3_ACCESS_KEY_ID=minioadmin \
 *   S3_SECRET_ACCESS_KEY=minioadmin \
 *   scripts/test.sh --layer=e2e --tag="POD — designed order" --no-coverage
 *
 * Those overrides matter: .env.local points S3 at REAL remote storage, and a
 * test run must not write artifacts there.
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

// A mockup the render hop can actually read. `readMockupSize` accepts an
// absolute http URL, so this is served straight out of minio's public bucket
// rather than through /api/media/proxy — which would otherwise resolve against
// whatever S3 the app is pointed at, i.e. real remote storage.
//
// Seed it with:
//   docker compose up -d minio minio-init
//   docker run --rm --network container:simplerdev-minio -v /tmp:/fixtures \
//     --entrypoint sh minio/mc -c "mc alias set l http://localhost:9000 \
//     minioadmin minioadmin && mc cp /fixtures/e2e-mockup.png \
//     l/simplerdev-media/e2e/mockup.png && mc anonymous set download l/simplerdev-media"
const MOCKUP_URL =
  process.env.E2E_MOCKUP_URL || 'http://localhost:9000/simplerdev-media/e2e/mockup.png';

/**
 * Run one statement without a shell, so `$` in a URL can't be expanded.
 *
 * Strips psql's trailing DML command tag. With `-At`, `INSERT … RETURNING id`
 * prints the id AND a tag line ("INSERT 0 1"), so a naive `.trim()` returns
 * "123\nINSERT 0 1" and `Number()` on it is NaN — which then flows into the
 * next statement as a syntax error rather than anything that names the cause.
 * `auth-qa-sweep-79.spec.ts` carries the same guard.
 */
function psql(sql: string): string {
  return execFileSync('psql', [DB_URL, '-At', '-c', sql], { encoding: 'utf8' })
    .split('\n')
    .filter((l) => l.trim() && !/^(INSERT|UPDATE|DELETE|SELECT)\s+\d/.test(l.trim()))
    .join('\n')
    .trim();
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
): Promise<{ id: number; uuid: string; sessionId: string }> {
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
  const data = (await res.json()).data as { id: number; uuid: string };

  const state = await ctx.storageState();
  const cookie = state.cookies.find((c) => c.name === 'sd_design_session');
  expect(cookie?.value, 'POST /designs must mint an anonymous design session').toBeTruthy();

  return { id: data.id, uuid: data.uuid, sessionId: cookie!.value };
}

/** Is object storage actually reachable? The render hop needs it; nothing else does. */
async function minioReachable(): Promise<boolean> {
  try {
    const res = await fetch(MOCKUP_URL, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
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

  test('print-file route renders a real print file and records it on the design', async ({
    clientApi,
    adminApi,
  }) => {
    // The only test here that needs object storage: it renders server-side and
    // uploads. Skips rather than fails when minio is down, because an
    // infrastructure gap should not read as a broken money path.
    if (!(await minioReachable())) {
      test.skip(true, `object storage unreachable at ${MOCKUP_URL} — run: docker compose up -d minio minio-init`);
      return;
    }

    const cleanups: Array<() => Promise<void>> = [];
    const anon = await pwRequest.newContext({ baseURL: BASE_URL });
    try {
      const siteId = await provisionStoreSite(clientApi, adminApi, cleanups);
      const productId = await createDesignableProduct(clientApi, siteId, cleanups);
      const { id: designId } = await createAnonymousDesign(anon, siteId, productId);

      // A style + side is what defines the printable region and the coordinate
      // space to render in. Bounds are in the MOCKUP's pixel grid (333x500
      // here), not rendered CSS pixels — the values mirror a real catalog row.
      const styleId = Number(
        psql(`INSERT INTO product_styles (product_id, name, "order")
              VALUES (${productId}, 'E2E Style', 0) RETURNING id;`),
      );
      psql(
        `INSERT INTO product_sides (style_id, side, image_url, printable_x, printable_y,
                                    printable_width, printable_height)
         VALUES (${styleId}, 'front', '${MOCKUP_URL}', 80, 80, 173, 310);`,
      );

      // ── Render ─────────────────────────────────────────────────────────────
      const res = await anon.post(
        `/api/storefront/${siteId}/designs/${designId}/print-file`,
        { data: { side: 'front' } },
      );
      const body = await res.json();
      expect(res.status(), `render failed: ${JSON.stringify(body)}`).toBe(200);

      const url = body.data?.url as string;
      expect(url, 'the route must return the uploaded print-file URL').toBeTruthy();

      // Recorded on the design, keyed by side — this is what checkout freezes.
      expect(
        psql(`SELECT print_files->>'front' FROM product_designs WHERE id = ${designId};`),
      ).toBe(url);

      // ── The two guarantees that keep a mockup off a garment ────────────────
      // The route records a RELATIVE media-proxy path (/api/media/proxy/…),
      // not an absolute URL — the proxy is what reads the object back out of
      // S3. Resolve it against the app before fetching.
      const abs = url.startsWith('http') ? url : `${BASE_URL}${url}`;
      const dl = await fetch(abs);
      expect(dl.ok, `rendered file must be fetchable at ${abs}`).toBe(true);
      const buf = Buffer.from(await dl.arrayBuffer());
      const sharp = (await import('sharp')).default;
      const meta = await sharp(buf).metadata();

      // Artwork only. A mockup render would be opaque; the print file must
      // carry transparency or Printful prints a picture of a shirt on a shirt.
      expect(meta.hasAlpha, 'print file must have an alpha channel').toBe(true);

      // MIN_PRINT_EDGE_PX — below this the garment prints visibly soft.
      const longEdge = Math.max(meta.width ?? 0, meta.height ?? 0);
      expect(longEdge, `long edge ${longEdge}px is below the 1500px print floor`)
        .toBeGreaterThanOrEqual(1500);

      // And it must be artwork, not a copy of the mockup we fed in.
      expect(meta.width).not.toBe(333);
      expect(meta.height).not.toBe(500);
    } finally {
      await anon.dispose();
      await runCleanups(cleanups);
    }
  });
});
