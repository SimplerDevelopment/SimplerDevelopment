/**
 * Storefront checkout — golden path (@ecommerce @critical)
 *
 * The most revenue-critical flow in the product, and until now the only major
 * one with no E2E at all: add to cart → checkout → order created.
 * `portal-ecommerce.spec.ts` covers store CRUD from the merchant side; nothing
 * covered the customer side (flagged in the Storefront domain map since
 * 2026-06-24, PODR-007).
 *
 * This drives the REAL checkout route against Stripe **test mode** — no mock. A
 * PaymentIntent is genuinely created, so a broken Stripe wiring fails here
 * instead of in production.
 *
 * Deliberately out of scope:
 *   - Confirming the PaymentIntent (needs Stripe.js in a browser).
 *   - The `payment_intent.succeeded` webhook (needs a signed payload; see
 *     gap-billing-coverage.spec.ts). The order row is created *before* either
 *     happens, which is exactly what this spec pins down.
 *
 * Requires `STRIPE_SECRET_KEY=sk_test_…` (scripts/test.sh lifts it out of .env
 * when it is a test key). Without it the suite skips rather than fails — but
 * when the key IS present a checkout error is a hard failure. A money path that
 * silently skips is how it stays broken.
 */
import { test, expect } from './setup/fixtures';
import type { ApiClient } from './setup/api-client';
import { runCleanups, createTestWebsite } from './setup/helpers';

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY ?? '';
const HAS_STRIPE_TEST_KEY = STRIPE_KEY.startsWith('sk_test_');

/**
 * Create a throwaway site whose store is enabled and chargeable, and return its id.
 *
 * Each test gets its OWN site on purpose. An earlier version configured the
 * client's existing site and restored the settings afterwards — which raced
 * itself (four parallel workers toggling one store row: a sibling's restore
 * disabled the store mid-test and the storefront answered 404) and would have
 * disturbed every other spec sharing that site. A disposable site needs no
 * restore at all, so the whole snapshot/restore dance disappears.
 *
 * BYOK rather than Connect: Connect needs a real onboarded connected account
 * (`transfer_data.destination`), which a test cannot conjure. BYOK only needs a
 * secret key, and the platform's own sk_test works because in test mode the
 * tenant "is" the account. `stripeByokAllowed` is an admin-only gate, hence the
 * adminApi hop — the portal PUT refuses `stripeMode: 'byok'` without it.
 *
 * Tax is forced to 0 so totals are arithmetic, not configuration-dependent.
 */
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
    storeName: 'E2E Checkout Store',
    stripeMode: 'byok',
    stripeSecretKeyPlaintext: STRIPE_KEY,
    taxRate: 0,
    taxInclusive: false,
  });
  expect(settings.status, 'store must accept BYOK config').toBe(200);

  return siteId;
}

/** Create an active, purchasable product and register its cleanup. */
async function createPurchasableProduct(
  clientApi: ApiClient,
  siteId: number,
  cleanups: Array<() => Promise<void>>,
  overrides: Record<string, unknown> = {},
) {
  const ts = Date.now();
  const res = await clientApi.post(`/api/portal/websites/${siteId}/store/products`, {
    name: `E2E Checkout Product ${ts}`,
    slug: `e2e-checkout-${ts}`,
    price: 2500,
    status: 'active',
    trackInventory: false,
    ...overrides,
  });
  expect(res.status, 'product fixture must be created').toBe(201);

  const product = res.data.data as { id: number };
  cleanups.push(async () => {
    await clientApi.delete(`/api/portal/websites/${siteId}/store/products/${product.id}`);
  });
  return product;
}

test.describe('Storefront checkout — golden path @ecommerce @critical', () => {
  test.skip(
    !HAS_STRIPE_TEST_KEY,
    'checkout creates a real PaymentIntent — needs STRIPE_SECRET_KEY=sk_test_…',
  );

  test('add to cart → checkout → order created with correct totals', async ({
    clientApi,
    adminApi,
    unauthApi,
  }) => {
    const cleanups: Array<() => Promise<void>> = [];
    try {
      const siteId = await provisionStoreSite(clientApi, adminApi, cleanups);
      const product = await createPurchasableProduct(clientApi, siteId, cleanups);

      const sessionId = `e2e-cart-${Date.now()}`;

      // ── Add to cart ────────────────────────────────────────────────────────
      const add = await unauthApi.post(`/api/storefront/${siteId}/cart`, {
        sessionId,
        productId: product.id,
        quantity: 2,
      });
      expect(add.status, `add to cart failed: ${JSON.stringify(add.data)}`).toBe(200);

      // Reading the cart back exercises the productDesigns leftJoin added this
      // session — the `uuid = designId::text` cast throws a Postgres type error
      // if that join regresses, so this GET is load-bearing, not decorative.
      const cart = await unauthApi.get(`/api/storefront/${siteId}/cart?sessionId=${sessionId}`);
      expect(cart.status).toBe(200);
      const cartItems = cart.data.data.items as Array<{ productId: number; quantity: number }>;
      expect(cartItems).toHaveLength(1);
      expect(cartItems[0]).toMatchObject({ productId: product.id, quantity: 2 });

      // ── Checkout ───────────────────────────────────────────────────────────
      const customerEmail = `e2e-buyer-${Date.now()}@example.com`;
      const checkout = await unauthApi.post(`/api/storefront/${siteId}/checkout`, {
        sessionId,
        customerEmail,
        customerName: 'E2E Buyer',
        shippingAddress: {
          line1: '1 Test Street',
          city: 'Testville',
          state: 'NY',
          postalCode: '10001',
          country: 'US',
        },
      });

      expect(
        checkout.status,
        `checkout failed: ${JSON.stringify(checkout.data)}`,
      ).toBe(200);

      const {
        clientSecret,
        orderNumber,
        orderId,
        total: quotedTotal,
      } = checkout.data.data as {
        clientSecret: string;
        orderNumber: string;
        orderId: number;
        total: number;
      };

      // A real Stripe test-mode PaymentIntent, not a stub.
      expect(clientSecret).toMatch(/^pi_.+_secret_/);
      expect(orderId).toBeGreaterThan(0);
      expect(orderNumber).toMatch(/^[A-Z]+-\d{4,}$/);
      expect(quotedTotal).toBe(5000); // 2 × 2500, tax forced to 0

      // ── Order is real and readable by the customer ─────────────────────────
      const order = await unauthApi.get(
        `/api/storefront/${siteId}/orders/${orderNumber}?email=${encodeURIComponent(customerEmail)}`,
      );
      expect(order.status).toBe(200);

      const o = order.data.data as {
        subtotal: number; total: number; taxTotal: number;
        discountTotal: number; shippingTotal: number;
        status: string; paymentStatus: string;
        items: Array<{
          quantity: number; unitPrice: number; total: number;
          printReadyUrl: string | null; printFiles: Record<string, string> | null;
        }>;
      };

      expect(o.subtotal).toBe(5000);
      expect(o.total).toBe(quotedTotal);
      // Totals must be internally consistent, whatever the tax/shipping config.
      expect(o.total).toBe(o.subtotal - o.discountTotal + o.shippingTotal + o.taxTotal);

      // Order exists but is unpaid — payment confirmation is a later, separate step.
      expect(o.status).toBe('pending');
      expect(o.paymentStatus).toBe('pending');

      expect(o.items).toHaveLength(1);
      expect(o.items[0]).toMatchObject({ quantity: 2, unitPrice: 2500, total: 5000 });

      // No design on this item, so the print-file freeze must record nothing —
      // never a mockup URL. A non-empty value here means the artwork/mockup
      // confusion of PODR-011 has come back.
      expect(o.items[0].printReadyUrl).toBeNull();
      expect(o.items[0].printFiles ?? {}).toEqual({});

      // ── Merchant sees the order ────────────────────────────────────────────
      const portalOrders = await clientApi.get(
        `/api/portal/websites/${siteId}/store/orders?limit=20`,
      );
      expect(portalOrders.status).toBe(200);
      const found = (portalOrders.data.data as Array<{ orderNumber: string }>).some(
        (row) => row.orderNumber === orderNumber,
      );
      expect(found, 'new order must appear in the portal order list').toBe(true);
    } finally {
      await runCleanups(cleanups);
    }
  });

  test('checkout refuses a cart that does not exist', async ({ clientApi, adminApi, unauthApi }) => {
    const cleanups: Array<() => Promise<void>> = [];
    try {
      const siteId = await provisionStoreSite(clientApi, adminApi, cleanups);

      const res = await unauthApi.post(`/api/storefront/${siteId}/checkout`, {
        sessionId: `e2e-no-such-cart-${Date.now()}`,
        customerEmail: 'nobody@example.com',
        customerName: 'Nobody',
      });

      expect(res.status).toBe(404);
      expect(res.data.message).toMatch(/cart not found/i);
    } finally {
      await runCleanups(cleanups);
    }
  });

  test('checkout requires customer identity before charging', async ({
    clientApi,
    adminApi,
    unauthApi,
  }) => {
    const cleanups: Array<() => Promise<void>> = [];
    try {
      const siteId = await provisionStoreSite(clientApi, adminApi, cleanups);
      const product = await createPurchasableProduct(clientApi, siteId, cleanups);

      const sessionId = `e2e-anon-${Date.now()}`;
      const add = await unauthApi.post(`/api/storefront/${siteId}/cart`, {
        sessionId,
        productId: product.id,
        quantity: 1,
      });
      expect(add.status, `add to cart failed: ${JSON.stringify(add.data)}`).toBe(200);

      // No customerName — an order with no one attached to it must never charge.
      const res = await unauthApi.post(`/api/storefront/${siteId}/checkout`, {
        sessionId,
        customerEmail: 'buyer@example.com',
      });

      expect(res.status).toBe(400);
      expect(res.data.message).toMatch(/required/i);
    } finally {
      await runCleanups(cleanups);
    }
  });

  test('cart refuses to oversell a tracked product', async ({ clientApi, adminApi, unauthApi }) => {
    const cleanups: Array<() => Promise<void>> = [];
    try {
      const siteId = await provisionStoreSite(clientApi, adminApi, cleanups);
      const product = await createPurchasableProduct(clientApi, siteId, cleanups, {
        trackInventory: true,
        quantity: 1,
      });

      const res = await unauthApi.post(`/api/storefront/${siteId}/cart`, {
        sessionId: `e2e-oversell-${Date.now()}`,
        productId: product.id,
        quantity: 5,
      });

      expect(res.status).toBe(400);
      expect(res.data.message).toMatch(/stock/i);
    } finally {
      await runCleanups(cleanups);
    }
  });
});
