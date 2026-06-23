/**
 * Integration tests for portal billing routes.
 *
 * Covers:
 *   - GET    /api/portal/settings/billing            — recent invoices + active services
 *   - POST   /api/portal/services/[id]/checkout      — Stripe checkout session creation
 *   - GET    /api/portal/billing/payment-methods     — list saved methods
 *   - DELETE /api/portal/billing/payment-methods     — detach a saved method
 *
 * Stripe is mocked at the module level so no network call is made. The test
 * asserts the route hands the right shape to `stripe.checkout.sessions.create`
 * (mode = subscription | payment, line items, customer wiring) and surfaces
 * the returned URL via the {success,data} envelope.
 *
 * Tenancy: a portal user can only ever read invoices + services scoped to
 * their own client_id, and can only delete payment methods that belong to
 * them. We seed cross-tenant rows and assert the route doesn't surface them.
 */
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

// Stripe is dynamically imported inside the checkout route. Mock its default
// export so `new Stripe(key)` returns an object whose checkout.sessions.create
// is a vi.fn we can interrogate per-test.
//
// Important: the constructor MUST be a real `function` (not an arrow) so that
// `new Stripe(key)` works — vi.fn() is callable but not constructable, and
// the route does `const stripe = new Stripe(stripeKey)`.
const stripeCheckoutCreate = vi.fn();
const stripePaymentMethodDetach = vi.fn();
vi.mock('stripe', () => {
  function StripeMock(this: unknown) {
    Object.assign(this as object, {
      checkout: { sessions: { create: stripeCheckoutCreate } },
      paymentMethods: { detach: stripePaymentMethodDetach },
    });
  }
  return { default: StripeMock };
});

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function asTenant(ctx: TenantCtx | null) {
  mockedAuth.mockResolvedValue(ctx?.session ?? null);
}

async function seedService(opts: {
  name?: string;
  category?: string;
  price?: number;
  billingCycle?: 'once' | 'monthly' | 'annually';
  active?: boolean;
} = {}) {
  const sql = getTestSql();
  const slug = `svc-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.services (name, slug, category, price, billing_cycle, active)
    VALUES (
      ${opts.name ?? 'Hosting Plan'},
      ${slug},
      ${opts.category ?? 'hosting'},
      ${opts.price ?? 1000},
      ${opts.billingCycle ?? 'monthly'},
      ${opts.active ?? true}
    )
    RETURNING id
  `;
  return row.id;
}

async function seedInvoice(clientId: number, amount = 5000, status = 'paid') {
  const sql = getTestSql();
  const number = `INV-TEST-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.invoices (number, client_id, status, subtotal, total)
    VALUES (${number}, ${clientId}, ${status}, ${amount}, ${amount})
    RETURNING id
  `;
  return row.id;
}

async function seedClientService(clientId: number, serviceId: number) {
  const sql = getTestSql();
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_services (client_id, service_id, status)
    VALUES (${clientId}, ${serviceId}, 'active')
  `;
}

async function seedPaymentMethod(clientId: number) {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.payment_methods (
      client_id, stripe_payment_method_id, brand, last4, exp_month, exp_year
    )
    VALUES (
      ${clientId},
      ${'pm_' + Math.random().toString(36).slice(2)},
      'visa',
      '4242',
      12,
      2030
    )
    RETURNING id
  `;
  return row.id;
}

beforeEach(() => {
  stripeCheckoutCreate.mockReset();
  stripePaymentMethodDetach.mockReset();
  stripePaymentMethodDetach.mockResolvedValue({});
});

describe('GET /api/portal/settings/billing (subscription) @settings @billing @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('billing-get-a'),
      sessionForNewClientUser('billing-get-b'),
    ]);
  });

  it('returns only the caller\'s invoices + services (200)', async () => {
    // Seed cross-tenant data.
    const svc = await seedService({ name: 'A Plan' });
    const svcB = await seedService({ name: 'B Plan' });
    await seedClientService(A.client.id, svc);
    await seedClientService(B.client.id, svcB);
    await seedInvoice(A.client.id, 1000);
    await seedInvoice(B.client.id, 9999);

    await asTenant(A);
    const route = await import('@/app/api/portal/settings/billing/route');
    const res = await callHandler<{
      success: boolean;
      data: {
        invoices: Array<{ total: number; clientId: number }>;
        services: Array<{ serviceName: string }>;
        stripeCustomerId: string | null;
      };
    }>(route as unknown as Record<string, unknown>, 'GET');
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    // No cross-tenant leak.
    expect(res.data?.data.invoices.every(i => i.clientId === A.client.id)).toBe(true);
    const names = res.data?.data.services.map(s => s.serviceName);
    expect(names).toContain('A Plan');
    expect(names).not.toContain('B Plan');
  });

  it('caps invoices at 10 (most-recent first)', async () => {
    for (let i = 0; i < 12; i++) await seedInvoice(A.client.id, 100 + i);
    await asTenant(A);
    const route = await import('@/app/api/portal/settings/billing/route');
    const res = await callHandler<{ data: { invoices: unknown[] } }>(
      route as unknown as Record<string, unknown>, 'GET',
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.invoices.length).toBeLessThanOrEqual(10);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/settings/billing/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/portal/services/[id]/checkout (Stripe checkout-session) @settings @billing', () => {
  let A: TenantCtx;
  const ORIGINAL_KEY = process.env.STRIPE_SECRET_KEY;

  beforeEach(async () => {
    A = await sessionForNewClientUser('billing-checkout');
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    stripeCheckoutCreate.mockResolvedValue({
      id: 'cs_test_123',
      url: 'https://checkout.stripe.test/cs_test_123',
    });
  });

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = ORIGINAL_KEY;
  });

  it('happy path (subscription): creates a session in subscription mode (200)', async () => {
    const svcId = await seedService({ billingCycle: 'monthly', price: 2500 });
    await asTenant(A);
    const route = await import('@/app/api/portal/services/[id]/checkout/route');
    const res = await callHandler<{ success: boolean; data: { url: string } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(svcId) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.url).toBe('https://checkout.stripe.test/cs_test_123');
    expect(stripeCheckoutCreate).toHaveBeenCalledTimes(1);
    const callArg = stripeCheckoutCreate.mock.calls[0][0];
    expect(callArg.mode).toBe('subscription');
    expect(callArg.line_items[0].price_data.recurring).toEqual({ interval: 'month' });
    expect(callArg.metadata).toEqual({ serviceId: String(svcId), clientId: String(A.client.id) });
  });

  it('happy path (one-time): creates a session in payment mode', async () => {
    const svcId = await seedService({ billingCycle: 'once', price: 9900 });
    await asTenant(A);
    const route = await import('@/app/api/portal/services/[id]/checkout/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(svcId) } },
    );
    expect(res.status).toBe(200);
    const callArg = stripeCheckoutCreate.mock.calls[0][0];
    expect(callArg.mode).toBe('payment');
    expect(callArg.customer_creation).toBe('always');
  });

  it('returns 404 for an inactive / unknown service', async () => {
    const svcId = await seedService({ active: false });
    await asTenant(A);
    const route = await import('@/app/api/portal/services/[id]/checkout/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(svcId) } },
    );
    expect(res.status).toBe(404);
    expect(stripeCheckoutCreate).not.toHaveBeenCalled();
  });

  it('returns 409 when the caller already has the service active', async () => {
    const svcId = await seedService({ billingCycle: 'monthly' });
    await seedClientService(A.client.id, svcId);
    await asTenant(A);
    const route = await import('@/app/api/portal/services/[id]/checkout/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(svcId) } },
    );
    expect(res.status).toBe(409);
    expect(stripeCheckoutCreate).not.toHaveBeenCalled();
  });

  it('returns 500 when STRIPE_SECRET_KEY is missing (no Stripe call)', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const svcId = await seedService();
    await asTenant(A);
    const route = await import('@/app/api/portal/services/[id]/checkout/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(svcId) } },
    );
    expect(res.status).toBe(500);
    expect(stripeCheckoutCreate).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/services/[id]/checkout/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: '1' } },
    );
    expect(res.status).toBe(401);
  });
});

describe('GET /api/portal/billing/payment-methods @settings @billing @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('pm-list-a'),
      sessionForNewClientUser('pm-list-b'),
    ]);
  });

  it('returns only the caller\'s payment methods', async () => {
    const aId = await seedPaymentMethod(A.client.id);
    const bId = await seedPaymentMethod(B.client.id);

    await asTenant(A);
    const route = await import('@/app/api/portal/billing/payment-methods/route');
    const res = await callHandler<{ success: boolean; data: Array<{ id: number; clientId: number }> }>(
      route as unknown as Record<string, unknown>, 'GET',
    );
    expect(res.status).toBe(200);
    const ids = res.data!.data.map(m => m.id);
    expect(ids).toContain(aId);
    expect(ids).not.toContain(bId);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/billing/payment-methods/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET');
    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/portal/billing/payment-methods @settings @billing @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('pm-del-a'),
      sessionForNewClientUser('pm-del-b'),
    ]);
  });

  it('happy path: removes own payment method (200)', async () => {
    const id = await seedPaymentMethod(A.client.id);
    await asTenant(A);
    const route = await import('@/app/api/portal/billing/payment-methods/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { body: { id: String(id) } },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.payment_methods WHERE id = ${id}
    `;
    expect(rows.length).toBe(0);
  });

  it('rejects missing id (400)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/billing/payment-methods/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { body: {} },
    );
    expect(res.status).toBe(400);
  });

  it('cross-tenant: A cannot delete B\'s payment method (404, row preserved)', async () => {
    const id = await seedPaymentMethod(B.client.id);
    await asTenant(A);
    const route = await import('@/app/api/portal/billing/payment-methods/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { body: { id: String(id) } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.payment_methods WHERE id = ${id}
    `;
    expect(rows.length).toBe(1);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/billing/payment-methods/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { body: { id: '1' } },
    );
    expect(res.status).toBe(401);
  });
});
