/**
 * Integration tests for /api/portal/services/[id]/checkout.
 *
 * Stripe is fully mocked — we do not hit live infrastructure. The test
 * captures the call arguments to assert mode (subscription vs payment),
 * line items (price vs price_data), and metadata wiring.
 *
 * Coverage:
 *   - 401 unauthenticated
 *   - 404 service missing or inactive
 *   - 409 existing active subscription (no double-charge)
 *   - 500 when STRIPE_SECRET_KEY is unset
 *   - 200 happy paths:
 *       * monthly billingCycle ⇒ mode=subscription, line_items[0].price_data.recurring=month
 *       * once   billingCycle ⇒ mode=payment + customer_creation=always (no customer)
 *       * stripePriceId set   ⇒ line_items uses { price, quantity:1 }, no price_data
 */
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

const stripeCheckoutCreate = vi.fn();
vi.mock('stripe', () => {
  // Vitest 4 requires constructable mocks to use a `function` or `class`
  // (not an arrow factory). The route does `new Stripe(key)` so we expose a
  // class here whose instance has the same shape we need.
  function StripeMock(this: { checkout: { sessions: { create: typeof stripeCheckoutCreate } } }) {
    this.checkout = { sessions: { create: stripeCheckoutCreate } };
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

interface SeedSvcOpts {
  name?: string;
  category?: string;
  price?: number;
  billingCycle?: 'once' | 'monthly' | 'annually';
  active?: boolean;
  stripePriceId?: string | null;
}

async function seedService(opts: SeedSvcOpts = {}): Promise<number> {
  const sql = getTestSql();
  const slug = `svc-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.services
      (name, slug, category, price, billing_cycle, active, stripe_price_id)
    VALUES (
      ${opts.name ?? 'Test Service'},
      ${slug},
      ${opts.category ?? 'cms'},
      ${opts.price ?? 1999},
      ${opts.billingCycle ?? 'monthly'},
      ${opts.active ?? true},
      ${opts.stripePriceId ?? null}
    )
    RETURNING id
  `;
  return row.id;
}

async function subscribeActive(clientId: number, serviceId: number): Promise<void> {
  const sql = getTestSql();
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_services (client_id, service_id, status)
    VALUES (${clientId}, ${serviceId}, 'active')
  `;
}

describe('POST /api/portal/services/[id]/checkout @services @stripe-mocked', () => {
  let A: TenantCtx;
  const ORIGINAL_KEY = process.env.STRIPE_SECRET_KEY;

  beforeEach(async () => {
    A = await sessionForNewClientUser('svc-checkout');
    stripeCheckoutCreate.mockReset();
    stripeCheckoutCreate.mockResolvedValue({ url: 'https://checkout.stripe.test/session_xyz', id: 'cs_test_123' });
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock_key';
  });

  // Restore the env so other tests aren't disturbed.
  // (afterEach is per file; the global setup-api truncates DB, not env.)
  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = ORIGINAL_KEY;
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/services/[id]/checkout/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: '1' } },
    );
    expect(res.status).toBe(401);
    expect(stripeCheckoutCreate).not.toHaveBeenCalled();
  });

  it('returns 404 for unknown service', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/services/[id]/checkout/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: '999999' } },
    );
    expect(res.status).toBe(404);
    expect(stripeCheckoutCreate).not.toHaveBeenCalled();
  });

  it('returns 404 for an inactive service', async () => {
    const id = await seedService({ active: false });
    await asTenant(A);
    const route = await import('@/app/api/portal/services/[id]/checkout/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(id) } },
    );
    expect(res.status).toBe(404);
    expect(stripeCheckoutCreate).not.toHaveBeenCalled();
  });

  it('returns 409 if the client already has the service active (no double-charge)', async () => {
    const id = await seedService();
    await subscribeActive(A.client.id, id);
    await asTenant(A);
    const route = await import('@/app/api/portal/services/[id]/checkout/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(id) } },
    );
    expect(res.status).toBe(409);
    expect(res.data?.success).toBe(false);
    expect(stripeCheckoutCreate).not.toHaveBeenCalled();
  });

  it('returns 500 when STRIPE_SECRET_KEY is missing', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const id = await seedService();
    await asTenant(A);
    const route = await import('@/app/api/portal/services/[id]/checkout/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(id) } },
    );
    expect(res.status).toBe(500);
    expect(res.data?.message).toMatch(/Payments not configured/);
    expect(stripeCheckoutCreate).not.toHaveBeenCalled();
  });

  it('happy path (monthly): mode=subscription, ad-hoc price_data, metadata wired, returns session URL', async () => {
    const id = await seedService({ price: 2500, billingCycle: 'monthly', name: 'CMS Pro' });
    await asTenant(A);
    const route = await import('@/app/api/portal/services/[id]/checkout/route');
    const res = await callHandler<{ success: boolean; data: { url: string } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(id) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data.url).toBe('https://checkout.stripe.test/session_xyz');

    expect(stripeCheckoutCreate).toHaveBeenCalledTimes(1);
    const callArg = stripeCheckoutCreate.mock.calls[0][0];
    expect(callArg.mode).toBe('subscription');
    expect(callArg.line_items[0].price_data.recurring).toEqual({ interval: 'month' });
    expect(callArg.line_items[0].price_data.unit_amount).toBe(2500);
    expect(callArg.metadata.serviceId).toBe(String(id));
    expect(callArg.metadata.clientId).toBe(String(A.client.id));
    expect(callArg.success_url).toMatch(/portal\/services\?purchased=1/);
  });

  it('happy path (one-off): mode=payment + customer_creation=always when no stripeCustomerId', async () => {
    const id = await seedService({ price: 5000, billingCycle: 'once' });
    await asTenant(A);
    const route = await import('@/app/api/portal/services/[id]/checkout/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(id) } },
    );
    expect(res.status).toBe(200);

    const callArg = stripeCheckoutCreate.mock.calls[0][0];
    expect(callArg.mode).toBe('payment');
    expect(callArg.customer_creation).toBe('always');
    expect(callArg.line_items[0].price_data.recurring).toBeUndefined();
  });

  it('happy path (stripePriceId set): line_items uses { price, quantity:1 } — no price_data', async () => {
    const id = await seedService({ stripePriceId: 'price_test_abc', billingCycle: 'monthly' });
    await asTenant(A);
    const route = await import('@/app/api/portal/services/[id]/checkout/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(id) } },
    );
    expect(res.status).toBe(200);

    const callArg = stripeCheckoutCreate.mock.calls[0][0];
    expect(callArg.line_items).toEqual([{ price: 'price_test_abc', quantity: 1 }]);
    // No price_data when a Stripe price ID is supplied.
    expect(callArg.line_items[0].price_data).toBeUndefined();
  });
});
