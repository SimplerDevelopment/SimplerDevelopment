/**
 * Stripe webhook signature verification + dispatch.
 *
 * The handler uses Stripe's `webhooks.constructEvent` which validates the
 * `stripe-signature` header via HMAC-SHA256. We reconstruct that signature in
 * tests so we can exercise both the happy path and tamper/forgery scenarios.
 *
 * No network calls hit Stripe's API during these tests — `constructEvent` is
 * pure HMAC and `new Stripe(key)` is just a client factory. So we don't need
 * MSW handlers for api.stripe.com here.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createHmac } from 'node:crypto';

// These must be set BEFORE the route is imported. Conveniently, setup-api.ts
// runs first and defines TEST_SCHEMA env manipulation; extend it here via
// beforeAll which runs before any test-body imports.
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_mock';
process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_mock';

import { callHandler } from '../../helpers/call-handler';
import { sessionForNewClientUser } from '../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../helpers/test-db';

function signStripeEvent(secret: string, payload: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const signedPayload = `${timestamp}.${payload}`;
  const v1 = createHmac('sha256', secret).update(signedPayload).digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

function buildCheckoutCompletedEvent(metadata: Record<string, string | number>, sessionId = 'cs_test_mock_1'): string {
  return JSON.stringify({
    id: 'evt_test_' + Date.now(),
    object: 'event',
    type: 'checkout.session.completed',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    api_version: '2024-06-20',
    data: {
      object: {
        id: sessionId,
        object: 'checkout.session',
        payment_status: 'paid',
        customer: 'cus_test_1',
        metadata,
      },
    },
  });
}

async function createInvoice(clientId: number): Promise<{ id: number; number: string }> {
  const sql = getTestSql();
  const number = `INV-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  const [row] = await sql<{ id: number; number: string }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.invoices (number, client_id, status, subtotal, tax, total)
    VALUES (${number}, ${clientId}, 'sent', 10000, 0, 10000) RETURNING id, number
  `;
  return row;
}

describe('Stripe webhook @billing @security', () => {
  const SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

  it('rejects a request with no stripe-signature header', async () => {
    const route = await import('@/app/api/stripe/webhook/route');
    const body = buildCheckoutCompletedEvent({});
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body, headers: { 'content-type': 'application/json' } },   // no stripe-signature header
    );
    expect(res.status).not.toBe(200);
  });

  it('rejects a request whose signature was computed against the wrong secret', async () => {
    const body = buildCheckoutCompletedEvent({});
    const forgedSig = signStripeEvent('whsec_the_attacker_guess', body);

    const route = await import('@/app/api/stripe/webhook/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body, headers: { 'stripe-signature': forgedSig, 'content-type': 'application/json' } },
    );
    expect(res.status).not.toBe(200);   // constructEvent throws → handler returns non-200
  });

  it('rejects a request where the body was tampered after signing', async () => {
    const original = buildCheckoutCompletedEvent({ invoiceId: '999' });
    const goodSig = signStripeEvent(SECRET, original);
    // Swap metadata after signing
    const tampered = original.replace('"invoiceId":"999"', '"invoiceId":"1000"');

    const route = await import('@/app/api/stripe/webhook/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: tampered, headers: { 'stripe-signature': goodSig, 'content-type': 'application/json' } },
    );
    expect(res.status).not.toBe(200);
  });

  it('accepts a properly-signed checkout.session.completed and marks the invoice paid', async () => {
    const ctx = await sessionForNewClientUser('stripe-ok');
    const invoice = await createInvoice(ctx.client.id);

    const body = buildCheckoutCompletedEvent({ invoiceId: String(invoice.id) });
    const sig = signStripeEvent(SECRET, body);

    const route = await import('@/app/api/stripe/webhook/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: body, headers: { 'stripe-signature': sig, 'content-type': 'application/json' } },
    );

    expect(res.status).toBe(200);

    const sql = getTestSql();
    const [after] = await sql<{ status: string; paid_at: Date | null; stripe_checkout_session_id: string | null }[]>`
      SELECT status, paid_at, stripe_checkout_session_id FROM ${sql(TEST_SCHEMA)}.invoices WHERE id = ${invoice.id}
    `;
    expect(after.status).toBe('paid');
    expect(after.paid_at).not.toBeNull();
    expect(after.stripe_checkout_session_id).toBe('cs_test_mock_1');
  });

  it('accepts a replay of the same checkout.session.completed without re-charging', async () => {
    const ctx = await sessionForNewClientUser('stripe-replay');
    const invoice = await createInvoice(ctx.client.id);
    const body = buildCheckoutCompletedEvent({ invoiceId: String(invoice.id) }, 'cs_test_replay_1');
    const sig = signStripeEvent(SECRET, body);

    const route = await import('@/app/api/stripe/webhook/route');
    const res1 = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: body, headers: { 'stripe-signature': sig, 'content-type': 'application/json' } },
    );
    const res2 = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: body, headers: { 'stripe-signature': sig, 'content-type': 'application/json' } },
    );

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    // Invoice still shows paid once — the second call is idempotent
    const sql = getTestSql();
    const [after] = await sql<{ status: string }[]>`
      SELECT status FROM ${sql(TEST_SCHEMA)}.invoices WHERE id = ${invoice.id}
    `;
    expect(after.status).toBe('paid');
  });
});
