import { describe, it, expect, beforeEach, vi } from 'vitest';
import Stripe from 'stripe';
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/mcp-auth', () => ({ resolvePortalFromCurrentRequest: async () => null }));

// The fetch transport is intercepted by MSW. Keep real Stripe serialization
// and DB transactions while ensuring this fixture cannot call a live account.
vi.mock('@/lib/stripe/index', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/stripe/index')>(),
  getStripeClient: () => new Stripe('sk_test_fixture', { httpClient: Stripe.createFetchHttpClient(), maxNetworkRetries: 0, timeout: 2000 }),
}));
import { db } from '@/lib/db';
import { orders, products, storeCheckoutReservations, giftCertificates, giftCertificateRedemptions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { reserveCheckout, releaseCheckout } from '@/lib/store/checkout-reservations';
import { processStorePayment } from '@/lib/store/payment-events';
import { expireCheckout } from '@/lib/store/checkout-expiration';
import { applyOrderPaymentAction } from '@/lib/store/order-payment-actions';
import { PUT as updatePortalOrder } from '@/app/api/portal/websites/[siteId]/store/orders/[orderId]/route';
import { auth } from '@/lib/auth';
import { http, HttpResponse } from 'msw';
import { server } from '../../../setup-api';
import { JOB_HANDLERS } from '@/lib/jobs';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';
import { grantService, sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';

describe('Store reservation and payment recovery @store @tenancy', () => {
  let tenant: TenantCtx;
  let websiteId: number;
  let productId: number;
  beforeEach(async () => {
    tenant = await sessionForNewClientUser('store-reservations');
    const foreignTenant = await sessionForNewClientUser('store-reservations-foreign');
    const sql = getTestSql();
    // Deliberately make A's website ID equal B's client ID. Passing a website
    // as clientId would therefore deliver the buyer's details to B.
    await sql`INSERT INTO ${sql(TEST_SCHEMA)}.client_websites (client_id,name,domain) VALUES (${tenant.client.id},'Placeholder','placeholder.test')`;
    const [site] = await sql<{id:number}[]>`INSERT INTO ${sql(TEST_SCHEMA)}.client_websites (client_id,name,domain) VALUES (${tenant.client.id},'Store','reservations.test') RETURNING id`;
    websiteId = site.id;
    expect(websiteId).toBe(foreignTenant.client.id);
    expect(websiteId).not.toBe(tenant.client.id);
    const [product] = await sql<{id:number}[]>`INSERT INTO ${sql(TEST_SCHEMA)}.products (website_id,name,slug,price,status,quantity,track_inventory) VALUES (${websiteId},'Last unit','last-unit',1000,'active',1,true) RETURNING id`;
    productId = product.id;
  });

  async function order() {
    const [created] = await db.insert(orders).values({ websiteId, orderNumber: `ORD-${crypto.randomUUID()}`, customerEmail: 'buyer@example.test', customerName: 'Buyer', subtotal: 1000, total: 1000 }).returning();
    return created;
  }
  async function reserve(orderId: number) {
    return db.transaction(tx => reserveCheckout(tx, { orderId, websiteId, clientId: tenant.client.id,
      items: [{ productId, variantId: null, quantity: 1 }], giftCertificateId: null, giftCertificateAmount: 0, discountCode: null }));
  }
  function paid(orderId: number, id = 'evt_paid') {
    return { id, type: 'payment_intent.succeeded', data: { object: { id: 'pi_paid', amount_received: 1000, metadata: { orderId: String(orderId), websiteId: String(websiteId) } } } };
  }

  it('concurrent buyers cannot both reserve the last unit; losing transaction leaves no reservation or job', async () => {
    const a = await order(); const b = await order();
    const outcomes = await Promise.allSettled([reserve(a.id), reserve(b.id)]);
    expect(outcomes.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(r => r.status === 'rejected')).toHaveLength(1);
    const [product] = await db.select().from(products).where(eq(products.id, productId));
    expect(product.quantity).toBe(0);
    expect(await db.select().from(storeCheckoutReservations)).toHaveLength(1);
  });

  it('concurrent duplicate events commit one history, automation and notification without decrementing reserved inventory again', async () => {
    const created = await order(); await reserve(created.id);
    await Promise.all([processStorePayment(paid(created.id), websiteId), processStorePayment(paid(created.id), websiteId)]);
    await processStorePayment(paid(created.id, 'evt_second_success'), websiteId);
    const sql = getTestSql();
    const [counts] = await sql<{history:number;automation:number;notification:number;quantity:number}[]>`SELECT
      (SELECT count(*)::int FROM ${sql(TEST_SCHEMA)}.order_status_history WHERE order_id=${created.id}) AS history,
      (SELECT count(*)::int FROM ${sql(TEST_SCHEMA)}.automation_jobs WHERE event='order.paid') AS automation,
      (SELECT count(*)::int FROM ${sql(TEST_SCHEMA)}.internal_jobs WHERE type='store.payment_notification') AS notification,
      (SELECT quantity FROM ${sql(TEST_SCHEMA)}.products WHERE id=${productId}) AS quantity`;
    expect(counts).toEqual({ history: 1, automation: 1, notification: 1, quantity: 0 });
    const [event] = await sql<{client_id:number}[]>`SELECT client_id FROM ${sql(TEST_SCHEMA)}.automation_jobs WHERE event='order.paid'`;
    expect(event.client_id).toBe(tenant.client.id);
  });

  it('failure does not release a retryable payment; cancellation releases exactly once', async () => {
    const created = await order(); await reserve(created.id);
    await processStorePayment({ ...paid(created.id, 'evt_failure'), type: 'payment_intent.payment_failed' }, websiteId);
    let [product] = await db.select().from(products).where(eq(products.id, productId)); expect(product.quantity).toBe(0);
    const cancelled = { ...paid(created.id, 'evt_cancelled'), type: 'payment_intent.canceled' };
    await processStorePayment(cancelled, websiteId); await processStorePayment(cancelled, websiteId);
    [product] = await db.select().from(products).where(eq(products.id, productId)); expect(product.quantity).toBe(1);
    await db.transaction(async tx => { await tx.select().from(orders).where(eq(orders.id, created.id)).for('update'); await releaseCheckout(tx, created.id); });
    [product] = await db.select().from(products).where(eq(products.id, productId)); expect(product.quantity).toBe(1);
  });

  it('a rejected amount rolls back the event claim so a corrected delivery can recover', async () => {
    const created = await order(); await reserve(created.id);
    const event = paid(created.id);
    await expect(processStorePayment({ ...event, data: { object: { ...event.data.object, amount_received: 2000 } } }, websiteId)).rejects.toThrow('Paid amount');
    await processStorePayment(event, websiteId);
    const [stored] = await db.select().from(orders).where(eq(orders.id, created.id)); expect(stored.paymentStatus).toBe('paid');
  });

  it('a failed outbox insert rolls back payment and reservation commit; redelivery recovers every effect', async () => {
    const created = await order(); await reserve(created.id);
    const sql = getTestSql();
    await sql`ALTER TABLE ${sql(TEST_SCHEMA)}.internal_jobs ADD CONSTRAINT test_reject_store_notification CHECK (type <> 'store.payment_notification')`;
    try { await expect(processStorePayment(paid(created.id), websiteId)).rejects.toThrow(); }
    finally { await sql`ALTER TABLE ${sql(TEST_SCHEMA)}.internal_jobs DROP CONSTRAINT test_reject_store_notification`; }
    const [before] = await db.select().from(orders).where(eq(orders.id, created.id)); expect(before.paymentStatus).toBe('pending');
    const [reservation] = await db.select().from(storeCheckoutReservations).where(eq(storeCheckoutReservations.orderId, created.id)); expect(reservation.state).toBe('reserved');
    const [claim] = await sql<{count:number}[]>`SELECT count(*)::int AS count FROM ${sql(TEST_SCHEMA)}.store_payment_events`; expect(claim.count).toBe(0);
    await processStorePayment(paid(created.id), websiteId);
    const [after] = await db.select().from(orders).where(eq(orders.id, created.id)); expect(after.paymentStatus).toBe('paid');
    const [outbox] = await sql<{count:number}[]>`SELECT count(*)::int AS count FROM ${sql(TEST_SCHEMA)}.internal_jobs WHERE type='store.payment_notification'`; expect(outbox.count).toBe(1);
  });

  it('cross-site metadata cannot change another tenant order', async () => {
    const created = await order(); await reserve(created.id);
    await expect(processStorePayment(paid(created.id), websiteId + 1)).rejects.toThrow('siteId mismatch');
    const [stored] = await db.select().from(orders).where(eq(orders.id, created.id)); expect(stored.paymentStatus).toBe('pending');
  });

  it('gift credit is held without redemption, restored on cancellation and redeemed only when paid', async () => {
    const [certificate] = await db.insert(giftCertificates).values({ clientId: tenant.client.id, websiteId,
      code: 'GIFT-RESERVE', initialAmount: 500, remainingAmount: 500, status: 'active', purchaserName: 'Buyer', purchaserEmail: 'buyer@example.test' }).returning();
    const a = await order(); const b = await order();
    const hold = (orderId: number) => db.transaction(tx => reserveCheckout(tx, { orderId, websiteId, clientId: tenant.client.id,
      items: [], giftCertificateId: certificate.id, giftCertificateAmount: 500, discountCode: null }));
    await hold(a.id);
    expect(await db.select().from(giftCertificateRedemptions)).toHaveLength(0);
    await expect(hold(b.id)).rejects.toThrow('Gift certificate balance');
    await processStorePayment({ ...paid(a.id, 'evt_cancel_gift'), type: 'payment_intent.canceled' }, websiteId);
    let [credit] = await db.select().from(giftCertificates).where(eq(giftCertificates.id, certificate.id)); expect(credit.remainingAmount).toBe(500);
    await hold(b.id); await processStorePayment(paid(b.id), websiteId);
    [credit] = await db.select().from(giftCertificates).where(eq(giftCertificates.id, certificate.id)); expect(credit.remainingAmount).toBe(0);
    expect(await db.select().from(giftCertificateRedemptions)).toHaveLength(1);
  });

  it('refunds are monotonic, return gift credit once and do not restock shipped inventory or reactivate expired credit', async () => {
    const [certificate] = await db.insert(giftCertificates).values({ clientId: tenant.client.id, websiteId,
      code: 'GIFT-REFUND', initialAmount: 500, remainingAmount: 500, status: 'active', purchaserName: 'Buyer', purchaserEmail: 'buyer@example.test' }).returning();
    const created = await order();
    await db.transaction(tx => reserveCheckout(tx, { orderId: created.id, websiteId, clientId: tenant.client.id,
      items: [{ productId, variantId: null, quantity: 1 }], giftCertificateId: certificate.id, giftCertificateAmount: 500, discountCode: null }));
    await processStorePayment(paid(created.id), websiteId);
    await db.update(giftCertificates).set({ status: 'expired' }).where(eq(giftCertificates.id, certificate.id));
    const refund = { id: 'evt_refund', type: 'charge.refunded', data: { object: { id: 'ch_paid', payment_intent: 'pi_paid', amount_refunded: 1000, metadata: { orderId: String(created.id), websiteId: String(websiteId) } } } };
    await processStorePayment(refund, websiteId);
    await processStorePayment({ ...refund, id: 'evt_refund_duplicate' }, websiteId);
    await processStorePayment({ ...refund, id: 'evt_refund_old', data: { object: { ...refund.data.object, amount_refunded: 200 } } }, websiteId);
    // A queued fulfillment must stop once cash has been refunded; a missing
    // guard would attempt Printful here despite this fixture having no shipping.
    await expect(JOB_HANDLERS['pod.submit']({ orderId: created.id }, db)).resolves.toBeUndefined();
    const [stored] = await db.select().from(orders).where(eq(orders.id, created.id)); expect(stored.refundedAmount).toBe(1000); expect(stored.paymentStatus).toBe('refunded');
    const [credit] = await db.select().from(giftCertificates).where(eq(giftCertificates.id, certificate.id)); expect(credit.remainingAmount).toBe(500); expect(credit.status).toBe('expired');
    const ledger = await db.select().from(giftCertificateRedemptions); expect(ledger).toHaveLength(2); expect(ledger.reduce((sum, row) => sum + row.amount, 0)).toBe(0);
    const [product] = await db.select().from(products).where(eq(products.id, productId)); expect(product.quantity).toBe(0);
  });

  async function expired(orderId: number) {
    const sql = getTestSql(); process.env.STRIPE_SECRET_KEY = 'sk_test_store_expiration';
    await sql`INSERT INTO ${sql(TEST_SCHEMA)}.store_settings (website_id,enabled,currency,stripe_mode,stripe_account_id,stripe_onboarding_complete) VALUES (${websiteId},true,'USD','connect','acct_test',true)`;
    await db.update(orders).set({ stripePaymentIntentId: 'pi_paid' }).where(eq(orders.id, orderId));
    await db.update(storeCheckoutReservations).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(storeCheckoutReservations.orderId, orderId));
  }

  it('expiration cancels the provider intent before releasing stock, and duplicate expiration is harmless', async () => {
    const created = await order(); await reserve(created.id); await expired(created.id);
    let cancellations = 0;
    server.use(http.get('https://api.stripe.com/v1/payment_intents/pi_paid', () => HttpResponse.json({ id: 'pi_paid', status: 'requires_payment_method' })),
      http.post('https://api.stripe.com/v1/payment_intents/pi_paid/cancel', async () => {
        const [product] = await db.select().from(products).where(eq(products.id, productId)); expect(product.quantity).toBe(0);
        cancellations++; return HttpResponse.json({ id: 'pi_paid', status: 'canceled' });
      }));
    await expireCheckout({ orderId: created.id, clientId: tenant.client.id });
    await expireCheckout({ orderId: created.id, clientId: tenant.client.id });
    const [product] = await db.select().from(products).where(eq(products.id, productId)); expect(product.quantity).toBe(1); expect(cancellations).toBe(1);
  });

  it('expiration reconciles a captured payment when its succeeded webhook was lost', async () => {
    const created = await order(); await reserve(created.id); await expired(created.id);
    server.use(http.get('https://api.stripe.com/v1/payment_intents/pi_paid', () => HttpResponse.json({ ...paid(created.id).data.object, status: 'succeeded' })));
    await expireCheckout({ orderId: created.id, clientId: tenant.client.id });
    const [stored] = await db.select().from(orders).where(eq(orders.id, created.id)); expect(stored.paymentStatus).toBe('paid');
    const [reservation] = await db.select().from(storeCheckoutReservations).where(eq(storeCheckoutReservations.orderId, created.id)); expect(reservation.state).toBe('committed');
    const [product] = await db.select().from(products).where(eq(products.id, productId)); expect(product.quantity).toBe(0);
  });

  it('portal cancellation retains held stock when provider cancellation fails, then releases once after confirmation', async () => {
    const created = await order(); await reserve(created.id); await expired(created.id);
    const [stored] = await db.select().from(orders).where(eq(orders.id, created.id));
    server.use(http.get('https://api.stripe.com/v1/payment_intents/pi_paid', () => HttpResponse.json({ id: 'pi_paid', status: 'requires_payment_method' })),
      http.post('https://api.stripe.com/v1/payment_intents/pi_paid/cancel', () => HttpResponse.json({ error: { message: 'Temporary provider failure', type: 'api_error' } }, { status: 503 })));
    await expect(applyOrderPaymentAction(stored, 'cancelled')).rejects.toThrow();
    let [product] = await db.select().from(products).where(eq(products.id, productId)); expect(product.quantity).toBe(0);
    server.use(http.post('https://api.stripe.com/v1/payment_intents/pi_paid/cancel', ({ request }) => {
      expect(request.headers.get('idempotency-key')).toBe(`store-cancel:${created.id}:pi_paid`);
      return HttpResponse.json({ id: 'pi_paid', status: 'canceled' });
    }));
    await applyOrderPaymentAction(stored, 'cancelled'); await applyOrderPaymentAction(stored, 'cancelled');
    await processStorePayment({ ...paid(created.id, 'evt_cancel_after_portal'), type: 'payment_intent.canceled' }, websiteId);
    [product] = await db.select().from(products).where(eq(products.id, productId)); expect(product.quantity).toBe(1);
    const sql = getTestSql();
    const [effects] = await sql<{ history:number; jobs:number; owner:number }[]>`SELECT
      (SELECT count(*)::int FROM ${sql(TEST_SCHEMA)}.order_status_history WHERE status='cancelled') AS history,
      (SELECT count(*)::int FROM ${sql(TEST_SCHEMA)}.automation_jobs WHERE event='order.cancelled') AS jobs,
      (SELECT client_id FROM ${sql(TEST_SCHEMA)}.automation_jobs WHERE event='order.cancelled' LIMIT 1) AS owner`;
    expect(effects).toEqual({ history: 1, jobs: 1, owner: tenant.client.id });
  });

  it('portal refunds reconcile cumulative provider amounts through the webhook ledger and stable refund key', async () => {
    const created = await order(); await reserve(created.id); await expired(created.id);
    await processStorePayment(paid(created.id), websiteId);
    const [stored] = await db.select().from(orders).where(eq(orders.id, created.id));
    server.use(http.post('https://api.stripe.com/v1/refunds', ({ request }) => {
      expect(request.headers.get('idempotency-key')).toBe(`store-refund-full:${created.id}:pi_paid`);
      return HttpResponse.json({ id: 're_portal', status: 'succeeded', charge: 'ch_paid', amount: 800 });
    }), http.get('https://api.stripe.com/v1/charges/ch_paid', () => HttpResponse.json({ id: 'ch_paid', amount_refunded: 1000 })));
    await Promise.all([applyOrderPaymentAction(stored, 'refunded'), applyOrderPaymentAction(stored, 'refunded')]);
    await processStorePayment({ id: 'evt_portal_refund_echo', type: 'charge.refunded', data: { object: {
      id: 'ch_paid', payment_intent: 'pi_paid', amount_refunded: 1000, metadata: { orderId: String(created.id), websiteId: String(websiteId) },
    } } }, websiteId);
    const [result] = await db.select().from(orders).where(eq(orders.id, created.id));
    expect(result.status).toBe('refunded'); expect(result.refundedAmount).toBe(1000);
    const sql = getTestSql();
    const [count] = await sql<{ value:number }[]>`SELECT count(*)::int AS value FROM ${sql(TEST_SCHEMA)}.order_status_history WHERE status='refunded'`;
    expect(count.value).toBe(1);
  });

  it('portal status transitions commit tenant-correct durable effects atomically and retry without duplication', async () => {
    const created = await order(); await reserve(created.id); await processStorePayment(paid(created.id), websiteId);
    await grantService(tenant.client.id, 'store'); vi.mocked(auth).mockResolvedValue(tenant.session as never);
    const params = { params: Promise.resolve({ siteId: String(websiteId), orderId: String(created.id) }) };
    const request = () => new Request('http://localhost/api/portal/orders', { method: 'PUT',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'shipped', trackingNumber: 'TRACK' }) });
    const sql = getTestSql();
    await sql`ALTER TABLE ${sql(TEST_SCHEMA)}.internal_jobs ADD CONSTRAINT test_status_outbox_failure CHECK (dedupe_key NOT LIKE 'store.status:%')`;
    try {
      expect((await updatePortalOrder(request(), params)).status).toBe(502);
      const [stored] = await db.select().from(orders).where(eq(orders.id, created.id)); expect(stored.status).toBe('pending');
    } finally { await sql`ALTER TABLE ${sql(TEST_SCHEMA)}.internal_jobs DROP CONSTRAINT test_status_outbox_failure`; }
    expect((await updatePortalOrder(request(), params)).status).toBe(200);
    expect((await updatePortalOrder(request(), params)).status).toBe(200);
    const [effects] = await sql<{ history:number; jobs:number; owner:number; notifications:number }[]>`SELECT
      (SELECT count(*)::int FROM ${sql(TEST_SCHEMA)}.order_status_history WHERE status='shipped') AS history,
      (SELECT count(*)::int FROM ${sql(TEST_SCHEMA)}.automation_jobs WHERE event='order.shipped') AS jobs,
      (SELECT client_id FROM ${sql(TEST_SCHEMA)}.automation_jobs WHERE event='order.shipped' LIMIT 1) AS owner,
      (SELECT count(*)::int FROM ${sql(TEST_SCHEMA)}.internal_jobs WHERE dedupe_key LIKE 'store.status:%') AS notifications`;
    expect(effects).toEqual({ history: 1, jobs: 1, owner: tenant.client.id, notifications: 1 });
  });
});
