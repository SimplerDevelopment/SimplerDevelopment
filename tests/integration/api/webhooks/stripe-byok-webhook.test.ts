/**
 * POST /api/stripe/webhook/ecommerce
 *
 * Tenant-aware Stripe webhook ingestion. `?siteId=N` is REQUIRED for BYOK
 * tenants (each registers their own per-site URL) and OPTIONAL for Connect
 * (legacy platform URL). When the query is absent we verify against the
 * platform's signing secret and derive siteId from the event's metadata.
 *
 * Signatures are computed locally via `stripe.webhooks.generateTestHeaderString`
 * — no network is involved in verification, so MSW isn't on the critical
 * path here. We DO ensure the email + Stripe fetch paths the route can
 * trigger are stubbed by the harness defaults (api-mocks.ts).
 *
 * Coverage:
 *   1) BYOK with valid HMAC → 200, order paymentStatus updated
 *   2) BYOK with invalid HMAC → 401, code:invalid_signature
 *   3) Connect WITH ?siteId — verifies with platform secret, order updated
 *   4) Connect WITHOUT ?siteId (legacy) — derives siteId from metadata, order updated
 *   5) No siteId AND no metadata.websiteId → 200 skipped:'no_website_id'
 *   6) No siteId, metadata derives to a BYOK site → 200 skipped:'byok_via_platform_url' (misrouted)
 *   7) siteId mismatch (query vs PI metadata) → 400 code:site_id_mismatch
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { randomBytes } from 'node:crypto';
import Stripe from 'stripe';

// Decryption helper reads ENCRYPTION_KEY at call time — set before any @/...
// import that touches lib/crypto/api-key.
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? randomBytes(32).toString('hex');
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_platform_for_integration_tests';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
// Public webhook — handler does not call auth(), parity-only mock.
void (auth as unknown as Mock);

import { encryptApiKey } from '@/lib/crypto/api-key';
import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

const BYOK_SECRET_KEY = 'sk_test_byok_for_webhook';
const BYOK_WEBHOOK_SECRET = 'whsec_byok_test_secret_for_webhook';
const PLATFORM_WEBHOOK_SECRET = 'whsec_platform_test_secret_for_webhook';

// Stripe instance used only for signing test payloads. Network is never
// involved because we only call `webhooks.generateTestHeaderString`.
const signer = new Stripe(BYOK_SECRET_KEY);

async function seedSite(ctx: TenantCtx, label = 'site'): Promise<{ siteId: number }> {
  const sql = getTestSql();
  const [s] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_websites (client_id, name, domain)
    VALUES (${ctx.client.id}, ${`${label}-${Date.now()}-${Math.random()}`}, ${`${label}-${Date.now()}-${Math.floor(Math.random() * 9999)}.test`})
    RETURNING id
  `;
  return { siteId: s.id };
}

type StoreMode = 'connect' | 'byok';
async function seedStoreSettings(siteId: number, mode: StoreMode): Promise<void> {
  const sql = getTestSql();
  if (mode === 'connect') {
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.store_settings (
        website_id, enabled, currency, stripe_mode,
        stripe_account_id, stripe_onboarding_complete
      )
      VALUES (${siteId}, true, 'USD', 'connect', 'acct_connected', true)
    `;
  } else {
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.store_settings (
        website_id, enabled, currency, stripe_mode, stripe_byok_allowed,
        stripe_secret_key_encrypted, stripe_webhook_secret_encrypted, stripe_account_id
      )
      VALUES (
        ${siteId}, true, 'USD', 'byok', true,
        ${encryptApiKey(BYOK_SECRET_KEY)},
        ${encryptApiKey(BYOK_WEBHOOK_SECRET)},
        NULL
      )
    `;
  }
}

async function seedPendingOrder(
  siteId: number,
): Promise<{ id: number; orderNumber: string }> {
  const sql = getTestSql();
  const num = `ORD-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  const [row] = await sql<{ id: number; order_number: string }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.orders (
      website_id, order_number, customer_email, customer_name,
      subtotal, total, status, payment_status,
      stripe_payment_intent_id
    )
    VALUES (
      ${siteId}, ${num}, 'buyer@example.test', 'Buyer',
      10000, 10000, 'pending', 'pending',
      'pi_for_webhook_test'
    )
    RETURNING id, order_number
  `;
  return { id: row.id, orderNumber: row.order_number };
}

interface BuildEventOpts {
  orderId: number;
  websiteId: number;
  piId?: string;
}
function buildSucceededEventBody(opts: BuildEventOpts): string {
  return JSON.stringify({
    id: `evt_${Date.now()}_${Math.floor(Math.random() * 9999)}`,
    object: 'event',
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: opts.piId ?? 'pi_for_webhook_test',
        object: 'payment_intent',
        amount: 10000,
        currency: 'usd',
        status: 'succeeded',
        metadata: {
          orderId: String(opts.orderId),
          websiteId: String(opts.websiteId),
          orderNumber: 'ORD-X',
        },
      },
    },
  });
}

interface PostOpts {
  body: string;
  signature: string;
  siteIdQuery?: number | null;
}
async function postWebhook(opts: PostOpts) {
  const route = await import('@/app/api/stripe/webhook/ecommerce/route');
  const url =
    opts.siteIdQuery && opts.siteIdQuery > 0
      ? `http://localhost:3000/api/stripe/webhook/ecommerce?siteId=${opts.siteIdQuery}`
      : 'http://localhost:3000/api/stripe/webhook/ecommerce';
  return callHandler<{
    success?: boolean;
    received?: boolean;
    skipped?: string;
    message?: string;
    code?: string;
  }>(
    route as unknown as Record<string, unknown>,
    'POST',
    {
      url,
      body: opts.body,
      headers: { 'content-type': 'application/json', 'stripe-signature': opts.signature },
    },
  );
}

async function fetchOrderPaymentStatus(orderId: number): Promise<string> {
  const sql = getTestSql();
  const [o] = await sql<{ payment_status: string | null }[]>`
    SELECT payment_status FROM ${sql(TEST_SCHEMA)}.orders WHERE id = ${orderId}
  `;
  return o.payment_status ?? '';
}

describe('POST /api/stripe/webhook/ecommerce @webhooks @store @stripe @byok', () => {
  let A: TenantCtx;

  beforeEach(async () => {
    A = await sessionForNewClientUser('stripe-byok-webhook');
    // Reset between tests — only set in tests that need it.
    delete process.env.STRIPE_ECOMMERCE_WEBHOOK_SECRET;
  });

  it('BYOK with valid HMAC — order marked paid', async () => {
    const { siteId } = await seedSite(A);
    await seedStoreSettings(siteId, 'byok');
    const order = await seedPendingOrder(siteId);

    const body = buildSucceededEventBody({ orderId: order.id, websiteId: siteId });
    const signature = signer.webhooks.generateTestHeaderString({
      payload: body,
      secret: BYOK_WEBHOOK_SECRET,
    });

    const res = await postWebhook({ body, signature, siteIdQuery: siteId });
    expect(res.status).toBe(200);
    expect(res.data?.received).toBe(true);
    expect(await fetchOrderPaymentStatus(order.id)).toBe('paid');
  });

  it('BYOK with invalid HMAC → 401 invalid_signature, order untouched', async () => {
    const { siteId } = await seedSite(A);
    await seedStoreSettings(siteId, 'byok');
    const order = await seedPendingOrder(siteId);

    const body = buildSucceededEventBody({ orderId: order.id, websiteId: siteId });
    // Sign with a DIFFERENT secret — verification must fail.
    const signature = signer.webhooks.generateTestHeaderString({
      payload: body,
      secret: 'whsec_wrong_secret',
    });

    const res = await postWebhook({ body, signature, siteIdQuery: siteId });
    expect(res.status).toBe(401);
    expect(res.data?.code).toBe('invalid_signature');
    expect(await fetchOrderPaymentStatus(order.id)).toBe('pending');
  });

  it('Connect mode WITH ?siteId — verifies via platform webhook secret, order updated', async () => {
    process.env.STRIPE_ECOMMERCE_WEBHOOK_SECRET = PLATFORM_WEBHOOK_SECRET;
    const { siteId } = await seedSite(A);
    await seedStoreSettings(siteId, 'connect');
    const order = await seedPendingOrder(siteId);

    const body = buildSucceededEventBody({ orderId: order.id, websiteId: siteId });
    const signature = signer.webhooks.generateTestHeaderString({
      payload: body,
      secret: PLATFORM_WEBHOOK_SECRET,
    });

    const res = await postWebhook({ body, signature, siteIdQuery: siteId });
    expect(res.status).toBe(200);
    expect(await fetchOrderPaymentStatus(order.id)).toBe('paid');
  });

  it('Connect mode WITHOUT ?siteId — derives siteId from event metadata, order updated', async () => {
    process.env.STRIPE_ECOMMERCE_WEBHOOK_SECRET = PLATFORM_WEBHOOK_SECRET;
    const { siteId } = await seedSite(A);
    await seedStoreSettings(siteId, 'connect');
    const order = await seedPendingOrder(siteId);

    const body = buildSucceededEventBody({ orderId: order.id, websiteId: siteId });
    const signature = signer.webhooks.generateTestHeaderString({
      payload: body,
      secret: PLATFORM_WEBHOOK_SECRET,
    });

    const res = await postWebhook({ body, signature, siteIdQuery: null });
    expect(res.status).toBe(200);
    expect(res.data?.received).toBe(true);
    expect(await fetchOrderPaymentStatus(order.id)).toBe('paid');
  });

  it('no ?siteId AND no metadata.websiteId → 200 skipped:no_website_id', async () => {
    process.env.STRIPE_ECOMMERCE_WEBHOOK_SECRET = PLATFORM_WEBHOOK_SECRET;

    // Event with no `websiteId` in metadata.
    const body = JSON.stringify({
      id: `evt_no_meta_${Date.now()}`,
      object: 'event',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_no_meta',
          object: 'payment_intent',
          status: 'succeeded',
          metadata: {}, // intentionally empty
        },
      },
    });
    const signature = signer.webhooks.generateTestHeaderString({
      payload: body,
      secret: PLATFORM_WEBHOOK_SECRET,
    });

    const res = await postWebhook({ body, signature, siteIdQuery: null });
    expect(res.status).toBe(200);
    expect(res.data?.skipped).toBe('no_website_id');
  });

  it('no ?siteId, metadata derives to a BYOK site → 200 skipped:byok_via_platform_url (misrouted)', async () => {
    process.env.STRIPE_ECOMMERCE_WEBHOOK_SECRET = PLATFORM_WEBHOOK_SECRET;
    const { siteId } = await seedSite(A);
    await seedStoreSettings(siteId, 'byok');
    const order = await seedPendingOrder(siteId);

    const body = buildSucceededEventBody({ orderId: order.id, websiteId: siteId });
    // Signed with PLATFORM secret because we're on the legacy platform URL.
    const signature = signer.webhooks.generateTestHeaderString({
      payload: body,
      secret: PLATFORM_WEBHOOK_SECRET,
    });

    const res = await postWebhook({ body, signature, siteIdQuery: null });
    expect(res.status).toBe(200);
    expect(res.data?.skipped).toBe('byok_via_platform_url');
    // Order must NOT have been touched.
    expect(await fetchOrderPaymentStatus(order.id)).toBe('pending');
  });

  it('siteId mismatch — ?siteId=A but event metadata websiteId=B → 400 site_id_mismatch', async () => {
    process.env.STRIPE_ECOMMERCE_WEBHOOK_SECRET = PLATFORM_WEBHOOK_SECRET;
    const { siteId: siteA } = await seedSite(A, 'site-a');
    const { siteId: siteB } = await seedSite(A, 'site-b');
    await seedStoreSettings(siteA, 'connect');
    await seedStoreSettings(siteB, 'connect');
    const orderB = await seedPendingOrder(siteB);

    // PI metadata says siteB but the request hits the per-site URL for siteA.
    const body = buildSucceededEventBody({ orderId: orderB.id, websiteId: siteB });
    const signature = signer.webhooks.generateTestHeaderString({
      payload: body,
      secret: PLATFORM_WEBHOOK_SECRET,
    });

    const res = await postWebhook({ body, signature, siteIdQuery: siteA });
    expect(res.status).toBe(400);
    expect(res.data?.code).toBe('site_id_mismatch');
    // Order in siteB must remain untouched.
    expect(await fetchOrderPaymentStatus(orderB.id)).toBe('pending');
  });
});
