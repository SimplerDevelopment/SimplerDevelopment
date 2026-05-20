/**
 * Storefront — Stripe BYOK / Connect checkout (POST /api/storefront/[siteId]/checkout).
 *
 * The checkout route resolves a per-site Stripe context via
 * `resolveSiteStripe(websiteId)` and then issues a `paymentIntents.create`.
 * Connect mode adds `application_fee_amount` + `transfer_data.destination`;
 * BYOK mode omits both AND authenticates with the tenant's own secret key.
 *
 * We mock the `stripe` module (rather than MSW-intercepting api.stripe.com)
 * because:
 *   1) The Stripe SDK retries on network errors with exponential backoff —
 *      MSW's "unhandled-request: error" path triggers those retries and
 *      blows the per-test timeout.
 *   2) Module-level mocking gives us a stable capture surface across BOTH
 *      Connect-mode (which uses the singleton platform client) and BYOK-mode
 *      (which `new Stripe(secret)` on each call).
 *
 * Coverage:
 *   1) Connect happy path — fee + transfer_data present
 *   2) Connect mode without onboarding → 400, NO Stripe call
 *   3) BYOK happy path — neither fee nor transfer_data, constructor saw BYOK key
 *   4) BYOK with no secret key → 400 code:byok_no_key, NO Stripe call
 *   5) Connect mode with null platformFeePercent — fee falls back to 500 (5%)
 */
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { randomBytes } from 'node:crypto';

// resolveSiteStripe decrypts the tenant's secret-key ciphertext via the
// crypto helper, which reads ENCRYPTION_KEY at call time. Set it before
// any module that touches the crypto helper is imported.
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? randomBytes(32).toString('hex');
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_platform_for_integration_tests';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

/**
 * Stripe SDK mock. We replace the entire `stripe` module export so that:
 *   - `new Stripe(secret)` (BYOK path in resolveSiteStripe) records its
 *     constructor arg and yields a stub with `paymentIntents.{create, update}`
 *   - The platform-singleton `getStripeClient()` in @/lib/stripe also goes
 *     through this constructor (it calls `new Stripe(process.env.STRIPE_SECRET_KEY)`)
 *
 * Each constructed instance pushes a record into `stripeCalls` so the test
 * can assert: how many times Stripe was instantiated, with what key, and
 * what params `paymentIntents.create` saw.
 */
interface PiCreateCall {
  params: Record<string, unknown>;
  // Which constructor instance was used (so we can correlate to the key).
  constructorKey: string;
}
const stripeCalls: {
  constructorKeys: string[];
  piCreates: PiCreateCall[];
  piUpdates: Array<{ id: string; params: Record<string, unknown> }>;
} = {
  constructorKeys: [],
  piCreates: [],
  piUpdates: [],
};
// State that the next `paymentIntents.create` call should return.
let nextPiResponse: { id: string; client_secret: string } = {
  id: 'pi_default',
  client_secret: 'pi_default_secret',
};

vi.mock('stripe', () => {
  class StripeMock {
    constructor(public readonly key?: string) {
      stripeCalls.constructorKeys.push(String(key ?? ''));
    }
    paymentIntents = {
      create: vi.fn(async (params: Record<string, unknown>) => {
        stripeCalls.piCreates.push({ params, constructorKey: this.key ?? '' });
        return {
          id: nextPiResponse.id,
          client_secret: nextPiResponse.client_secret,
          object: 'payment_intent',
          status: 'requires_payment_method',
        };
      }),
      update: vi.fn(async (id: string, params: Record<string, unknown>) => {
        stripeCalls.piUpdates.push({ id, params });
        return { id, object: 'payment_intent', status: 'requires_payment_method' };
      }),
    };
    // Surfaces some callers (e.g. webhook verifiers) require — unused here
    // but harmless and prevents "x is not a function" if other code path runs.
    webhooks = { constructEvent: () => ({}) };
  }
  return { default: StripeMock };
});

import { auth } from '@/lib/auth';
void (auth as unknown as Mock);

import { encryptApiKey } from '@/lib/crypto/api-key';
import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

const BYOK_SECRET_KEY = 'sk_test_byok_test';
const PLATFORM_SECRET_KEY = process.env.STRIPE_SECRET_KEY!;

async function seedSite(ctx: TenantCtx, label = 'site'): Promise<{ siteId: number }> {
  const sql = getTestSql();
  const [s] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_websites (client_id, name, domain)
    VALUES (${ctx.client.id}, ${`${label}-${Date.now()}-${Math.random()}`}, ${`${label}-${Date.now()}-${Math.floor(Math.random() * 9999)}.test`})
    RETURNING id
  `;
  return { siteId: s.id };
}

interface ConnectOpts {
  mode: 'connect';
  stripeAccountId?: string | null;
  stripeOnboardingComplete?: boolean;
  platformFeePercent?: string | null;
}
interface ByokOpts {
  mode: 'byok';
  stripeByokAllowed?: boolean;
  secretKeyPlaintext?: string | null; // null = no key stored
}
async function seedStoreSettings(
  siteId: number,
  opts: ConnectOpts | ByokOpts,
): Promise<void> {
  const sql = getTestSql();
  if (opts.mode === 'connect') {
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.store_settings (
        website_id, enabled, currency, stripe_mode,
        stripe_account_id, stripe_onboarding_complete, platform_fee_percent
      )
      VALUES (
        ${siteId}, true, 'USD', 'connect',
        ${opts.stripeAccountId === undefined ? 'acct_connected' : opts.stripeAccountId},
        ${opts.stripeOnboardingComplete ?? true},
        ${opts.platformFeePercent === undefined ? '5.00' : opts.platformFeePercent}
      )
    `;
  } else {
    const secretKey = opts.secretKeyPlaintext === undefined ? BYOK_SECRET_KEY : opts.secretKeyPlaintext;
    const encrypted = secretKey ? encryptApiKey(secretKey) : null;
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.store_settings (
        website_id, enabled, currency, stripe_mode, stripe_byok_allowed,
        stripe_secret_key_encrypted, stripe_account_id, platform_fee_percent
      )
      VALUES (
        ${siteId}, true, 'USD', 'byok',
        ${opts.stripeByokAllowed ?? true},
        ${encrypted}, NULL, '5.00'
      )
    `;
  }
}

async function seedProduct(siteId: number, priceCents: number): Promise<{ id: number }> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.products (
      website_id, name, slug, price, status, track_inventory, quantity
    )
    VALUES (
      ${siteId}, 'Test Product',
      ${`tp-${Date.now()}-${Math.floor(Math.random() * 9999)}`},
      ${priceCents}, 'active', false, 0
    )
    RETURNING id
  `;
  return { id: row.id };
}

async function seedCartWithItem(
  siteId: number,
  sessionId: string,
  productId: number,
  qty = 1,
  unitPrice = 10000,
): Promise<{ cartId: number }> {
  const sql = getTestSql();
  const [c] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.carts (website_id, session_id, status)
    VALUES (${siteId}, ${sessionId}, 'active')
    RETURNING id
  `;
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.cart_items (cart_id, product_id, quantity, unit_price)
    VALUES (${c.id}, ${productId}, ${qty}, ${unitPrice})
  `;
  return { cartId: c.id };
}

interface CheckoutBody {
  sessionId: string;
  customerEmail: string;
  customerName: string;
}
function buildCheckoutBody(sessionId: string): CheckoutBody {
  return {
    sessionId,
    customerEmail: 'buyer@example.test',
    customerName: 'Test Buyer',
  };
}

async function postCheckout(siteId: number, body: CheckoutBody) {
  const route = await import('@/app/api/storefront/[siteId]/checkout/route');
  return callHandler<{
    success: boolean;
    message?: string;
    code?: string;
    data?: { clientSecret: string; orderId: number; orderNumber: string; total: number };
  }>(
    route as unknown as Record<string, unknown>,
    'POST',
    { params: { siteId: String(siteId) }, body },
  );
}

/** Clear capture state between tests. */
function resetStripeCaptures(piId: string, clientSecret: string) {
  stripeCalls.constructorKeys.length = 0;
  stripeCalls.piCreates.length = 0;
  stripeCalls.piUpdates.length = 0;
  nextPiResponse = { id: piId, client_secret: clientSecret };
}

afterEach(() => {
  // Don't restoreAllMocks — that would un-do the module-level vi.mock('stripe').
});

describe('POST /api/storefront/[siteId]/checkout @storefront @store @stripe @byok', () => {
  let A: TenantCtx;
  beforeEach(async () => {
    A = await sessionForNewClientUser('byok-checkout');
  });

  it('Connect mode happy path — application_fee_amount + transfer_data sent to Stripe', async () => {
    resetStripeCaptures('pi_connect_test', 'pi_connect_test_secret');

    const { siteId } = await seedSite(A);
    await seedStoreSettings(siteId, { mode: 'connect', platformFeePercent: '5.00' });
    const product = await seedProduct(siteId, 10000);
    const sessionId = `sess-${Date.now()}`;
    await seedCartWithItem(siteId, sessionId, product.id, 1, 10000);

    const res = await postCheckout(siteId, buildCheckoutBody(sessionId));
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data?.clientSecret).toBe('pi_connect_test_secret');

    // Exactly one PaymentIntent CREATE captured.
    expect(stripeCalls.piCreates.length).toBe(1);
    const params = stripeCalls.piCreates[0].params;
    // 5% of 10000 cents = 500.
    expect(params.application_fee_amount).toBe(500);
    expect(params.transfer_data).toEqual({ destination: 'acct_connected' });
    expect(params.amount).toBe(10000);
    expect(params.currency).toBe('usd');
  });

  it('Connect mode without completed onboarding → 400 and Stripe is NOT called', async () => {
    resetStripeCaptures('pi_never', 'pi_never_secret');

    const { siteId } = await seedSite(A);
    await seedStoreSettings(siteId, {
      mode: 'connect',
      stripeAccountId: 'acct_connected',
      stripeOnboardingComplete: false,
    });
    const product = await seedProduct(siteId, 10000);
    const sessionId = `sess-${Date.now()}`;
    await seedCartWithItem(siteId, sessionId, product.id, 1, 10000);

    const res = await postCheckout(siteId, buildCheckoutBody(sessionId));
    expect(res.status).toBe(400);
    expect((res.data?.message ?? '').toLowerCase()).toContain('onboarding');
    expect(stripeCalls.piCreates.length).toBe(0);
  });

  it('BYOK mode happy path — NO fee / transfer_data; constructor was given tenant BYOK key', async () => {
    resetStripeCaptures('pi_byok', 'pi_byok_secret');

    const { siteId } = await seedSite(A);
    await seedStoreSettings(siteId, { mode: 'byok' });
    const product = await seedProduct(siteId, 10000);
    const sessionId = `sess-${Date.now()}`;
    await seedCartWithItem(siteId, sessionId, product.id, 1, 10000);

    const res = await postCheckout(siteId, buildCheckoutBody(sessionId));
    expect(res.status).toBe(200);
    expect(res.data?.data?.clientSecret).toBe('pi_byok_secret');

    expect(stripeCalls.piCreates.length).toBe(1);
    const params = stripeCalls.piCreates[0].params;
    expect(params.application_fee_amount).toBeUndefined();
    expect(params.transfer_data).toBeUndefined();
    expect(params.amount).toBe(10000);

    // The Stripe instance used by the route in BYOK mode was constructed with
    // the tenant's secret key — NOT the platform's STRIPE_SECRET_KEY.
    expect(stripeCalls.piCreates[0].constructorKey).toBe(BYOK_SECRET_KEY);
    expect(stripeCalls.piCreates[0].constructorKey).not.toBe(PLATFORM_SECRET_KEY);
  });

  it('BYOK mode with no secret key configured → 400 byok_no_key, Stripe NOT called', async () => {
    resetStripeCaptures('pi_never', 'pi_never_secret');

    const { siteId } = await seedSite(A);
    await seedStoreSettings(siteId, { mode: 'byok', secretKeyPlaintext: null });
    const product = await seedProduct(siteId, 10000);
    const sessionId = `sess-${Date.now()}`;
    await seedCartWithItem(siteId, sessionId, product.id, 1, 10000);

    const res = await postCheckout(siteId, buildCheckoutBody(sessionId));
    expect(res.status).toBe(400);
    expect(res.data?.code).toBe('byok_no_key');
    expect(stripeCalls.piCreates.length).toBe(0);
  });

  it('Connect mode null platformFeePercent — application_fee_amount defaults to 5% (500 cents)', async () => {
    resetStripeCaptures('pi_fallback', 'pi_fallback_secret');

    const { siteId } = await seedSite(A);
    await seedStoreSettings(siteId, { mode: 'connect', platformFeePercent: null });
    const product = await seedProduct(siteId, 10000);
    const sessionId = `sess-${Date.now()}`;
    await seedCartWithItem(siteId, sessionId, product.id, 1, 10000);

    const res = await postCheckout(siteId, buildCheckoutBody(sessionId));
    expect(res.status).toBe(200);

    expect(stripeCalls.piCreates.length).toBe(1);
    const params = stripeCalls.piCreates[0].params;
    // Fallback `?? 500` in the route → 5% of 10000 = 500.
    expect(params.application_fee_amount).toBe(500);
    expect(params.transfer_data).toEqual({ destination: 'acct_connected' });
  });
});
