/**
 * Portal invoices — POST /api/portal/invoices/[id]/checkout
 *
 * Contract:
 *   - 401 unauth
 *   - 404 invoice not found / cross-tenant (client scope)
 *   - 400 invoice not in payable status (draft, paid, cancelled)
 *   - 500 when STRIPE_SECRET_KEY is missing
 *   - 200 happy path (mocked Stripe) — checkout session created + persisted
 *   - line_items derived from invoice_items (unit_amount, quantity, description)
 *   - staff (admin/employee) bypass tenant scope
 */
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

// Mock the dynamic Stripe import the route uses (`await import('stripe')`).
// Vitest 4 warns when a vi.fn() mock lacking `function`/`class` syntax is
// invoked with `new`, so we declare a real function expression.
const stripeCheckoutCreate = vi.fn();
vi.mock('stripe', () => ({
  default: function MockStripe() {
    return { checkout: { sessions: { create: stripeCheckoutCreate } } };
  },
}));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import {
  sessionForStaff,
  twoTenants,
  type TenantCtx,
} from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function seedInvoice(
  ctx: TenantCtx,
  opts: { status?: string; subtotal?: number } = {},
): Promise<{ invoiceId: number }> {
  const sql = getTestSql();
  const ts = Date.now();
  const rand = Math.floor(Math.random() * 1e9);
  const status = opts.status ?? 'sent';
  const subtotal = opts.subtotal ?? 5000;
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.invoices
      (number, client_id, status, subtotal, tax, total, created_by)
    VALUES
      (${`INV-${ts}-${rand}`}, ${ctx.client.id}, ${status},
       ${subtotal}, 0, ${subtotal}, ${ctx.user.id})
    RETURNING id
  `;
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.invoice_items
      (invoice_id, description, quantity, unit_price, total)
    VALUES
      (${row.id}, 'Setup fee', 1, ${subtotal}, ${subtotal})
  `;
  return { invoiceId: row.id };
}

const STRIPE_KEY_BACKUP = process.env.STRIPE_SECRET_KEY;
function setStripeKey(value: string | undefined) {
  if (value === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = value;
}

describe('POST /api/portal/invoices/[id]/checkout @invoices @checkout', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  let staff: TenantCtx;

  beforeEach(async () => {
    stripeCheckoutCreate.mockReset();
    stripeCheckoutCreate.mockResolvedValue({ id: 'cs_mock_test_123', url: 'https://stripe.mock/checkout/cs_mock_test_123' });
    setStripeKey('sk_test_mock');
    [{ A, B }, staff] = await Promise.all([twoTenants(), sessionForStaff('agency-invoices')]);
  });

  // Restore env at the end (vitest doesn't isolate process.env across tests)
  afterEach(() => { setStripeKey(STRIPE_KEY_BACKUP); });

  it('401 unauthenticated', async () => {
    const { invoiceId } = await seedInvoice(A);
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/invoices/[id]/checkout/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(invoiceId) } });
    expect(res.status).toBe(401);
    expect(stripeCheckoutCreate).not.toHaveBeenCalled();
  });

  it("404 cross-tenant: A cannot checkout B's invoice", async () => {
    const { invoiceId } = await seedInvoice(B);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/invoices/[id]/checkout/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(invoiceId) } });
    expect(res.status).toBe(404);
    expect(stripeCheckoutCreate).not.toHaveBeenCalled();
  });

  it('404 invoice not found', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/invoices/[id]/checkout/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST',
      { params: { id: '999999999' } });
    expect(res.status).toBe(404);
  });

  it('400 invoice not in a payable status (e.g. draft)', async () => {
    const { invoiceId } = await seedInvoice(A, { status: 'draft' });
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/invoices/[id]/checkout/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(invoiceId) } });
    expect(res.status).toBe(400);
    expect(stripeCheckoutCreate).not.toHaveBeenCalled();
  });

  it('500 when STRIPE_SECRET_KEY is missing', async () => {
    setStripeKey(undefined);
    const { invoiceId } = await seedInvoice(A);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/invoices/[id]/checkout/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(invoiceId) } });
    expect(res.status).toBe(500);
    expect(res.data && (res.data as { message?: string }).message).toMatch(/stripe/i);
    expect(stripeCheckoutCreate).not.toHaveBeenCalled();
  });

  it('200 happy path: builds line_items + persists checkout session id', async () => {
    const { invoiceId } = await seedInvoice(A, { status: 'sent', subtotal: 7500 });
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/invoices/[id]/checkout/route');
    const res = await callHandler<{ data: { url: string } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(invoiceId) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data?.url).toMatch(/stripe\.mock/);
    expect(stripeCheckoutCreate).toHaveBeenCalledTimes(1);

    const arg = stripeCheckoutCreate.mock.calls[0][0];
    expect(arg.mode).toBe('payment');
    expect(arg.metadata.invoiceId).toBe(String(invoiceId));
    expect(Array.isArray(arg.line_items)).toBe(true);
    expect(arg.line_items[0].price_data.unit_amount).toBe(7500);
    expect(arg.line_items[0].price_data.product_data.name).toBe('Setup fee');
    expect(arg.line_items[0].quantity).toBe(1);

    // The session id is persisted on the invoice row
    const sql = getTestSql();
    const [row] = await sql<{ stripe_checkout_session_id: string | null }[]>`
      SELECT stripe_checkout_session_id FROM ${sql(TEST_SCHEMA)}.invoices WHERE id = ${invoiceId}
    `;
    expect(row.stripe_checkout_session_id).toBe('cs_mock_test_123');
  });

  it('staff bypasses tenant scope (admin can checkout any client invoice)', async () => {
    const { invoiceId } = await seedInvoice(A);
    mockedAuth.mockResolvedValue(staff.session);

    const route = await import('@/app/api/portal/invoices/[id]/checkout/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(invoiceId) } });
    expect(res.status).toBe(200);
    expect(stripeCheckoutCreate).toHaveBeenCalledTimes(1);
  });

  it('500 when Stripe call throws', async () => {
    stripeCheckoutCreate.mockRejectedValueOnce(new Error('boom'));
    const { invoiceId } = await seedInvoice(A);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/invoices/[id]/checkout/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(invoiceId) } });
    expect(res.status).toBe(500);
  });
});

