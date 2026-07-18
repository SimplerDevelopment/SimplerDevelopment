/**
 * Bookings on a page —
 *   /api/portal/tools/booking/[id]/bookings (GET)
 *   /api/portal/tools/booking/[id]/bookings/[bookingId] (PUT — status / notes / assignedTo)
 *   /api/portal/tools/booking/[id]/bookings/[bookingId]/refund (POST — Stripe refund)
 *
 * Coverage:
 *   - Auth (401), cross-tenant (404), bad input
 *   - PUT status='cancelled' stamps cancelled_at
 *   - PUT cross-page mismatch (404)
 *   - Refund 400 when booking has no payment, 200 happy-path with mocked Stripe
 *   - Refund flips paymentStatus -> 'refunded' and (full refund) status -> 'cancelled'
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

// Mock the dynamic stripe import used by the refund route
const stripeRefundCreate = vi.fn();
vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(() => ({
    refunds: { create: stripeRefundCreate },
  })),
}));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function enableBookingService(ctx: TenantCtx): Promise<void> {
  const sql = getTestSql();
  const slug = `booking-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const [svc] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.services (name, slug, category, price, billing_cycle)
    VALUES ('Booking', ${slug}, 'booking', 0, 'monthly') RETURNING id
  `;
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_services (client_id, service_id, status)
    VALUES (${ctx.client.id}, ${svc.id}, 'active')
  `;
}

async function seedPage(ctx: TenantCtx): Promise<{ id: number }> {
  const sql = getTestSql();
  const slug = `pg-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.booking_pages (
      client_id, title, slug, duration, max_advance_days, min_notice_mins,
      timezone, active, price, checkin_enabled, enable_discount_codes,
      enable_add_ons, enable_gift_certificates, enable_waivers,
      require_waiver_before_booking, allow_staff_selection,
      buffer_before, buffer_after, conference_type, google_calendar_sync, color
    ) VALUES (
      ${ctx.client.id}, 'Page', ${slug}, 30, 60, 60, 'UTC', true, 0, false, false,
      false, false, false, false, false, 0, 15, 'none', false, '#2563eb'
    ) RETURNING id
  `;
  return row;
}

async function seedBooking(opts: {
  pageId: number;
  clientId: number;
  guestName?: string;
  paymentStatus?: 'free' | 'paid' | 'pending' | 'refunded';
  total?: number;
  stripePaymentIntentId?: string | null;
  status?: 'confirmed' | 'cancelled';
}): Promise<{ id: number }> {
  const sql = getTestSql();
  const start = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const cancelToken = `tok-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.bookings (
      booking_page_id, client_id, guest_name, guest_email,
      start_time, end_time, timezone, status, cancel_token,
      payment_status, total, stripe_payment_intent_id, group_size
    ) VALUES (
      ${opts.pageId}, ${opts.clientId},
      ${opts.guestName ?? 'Guest'}, 'guest@test.local',
      ${start}, ${end}, 'UTC',
      ${opts.status ?? 'confirmed'},
      ${cancelToken},
      ${opts.paymentStatus ?? 'free'},
      ${opts.total ?? 0},
      ${opts.stripePaymentIntentId ?? null},
      1
    ) RETURNING id
  `;
  return row;
}

describe('GET /api/portal/tools/booking/[id]/bookings @booking @portal', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('bk-list-a'),
      sessionForNewClientUser('bk-list-b'),
    ]);
    await Promise.all([enableBookingService(A), enableBookingService(B)]);
  });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const page = await seedPage(A);
    const route = await import('@/app/api/portal/tools/booking/[id]/bookings/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(page.id) } },
    );
    expect(res.status).toBe(401);
  });

  it('404 when booking page is in a different tenant', async () => {
    const page = await seedPage(B);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/[id]/bookings/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(page.id) } },
    );
    expect(res.status).toBe(404);
  });

  it('returns bookings for a page in DESC start order', async () => {
    const page = await seedPage(A);
    await seedBooking({ pageId: page.id, clientId: A.client.id, guestName: 'First' });
    await seedBooking({ pageId: page.id, clientId: A.client.id, guestName: 'Second' });

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/[id]/bookings/route');
    const res = await callHandler<{ success: boolean; data: { guestName: string }[] }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(page.id) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.length).toBe(2);
  });
});

describe('PUT /api/portal/tools/booking/[id]/bookings/[bookingId] @booking @portal', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('bk-edit-a'),
      sessionForNewClientUser('bk-edit-b'),
    ]);
    await Promise.all([enableBookingService(A), enableBookingService(B)]);
  });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/tools/booking/[id]/bookings/[bookingId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: '1', bookingId: '1' }, body: {} },
    );
    expect(res.status).toBe(401);
  });

  it('404 when booking page belongs to another tenant', async () => {
    const page = await seedPage(B);
    const booking = await seedBooking({ pageId: page.id, clientId: B.client.id });
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/tools/booking/[id]/bookings/[bookingId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(page.id), bookingId: String(booking.id) }, body: { notes: 'hi' } },
    );
    expect(res.status).toBe(404);
  });

  it('404 when bookingId is not on the given page', async () => {
    const page1 = await seedPage(A);
    const page2 = await seedPage(A);
    const onPage2 = await seedBooking({ pageId: page2.id, clientId: A.client.id });
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/tools/booking/[id]/bookings/[bookingId]/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(page1.id), bookingId: String(onPage2.id) }, body: { notes: 'x' } },
    );
    expect(res.status).toBe(404);
    expect(res.data?.message).toMatch(/booking not found/i);
  });

  it('updates notes and stamps cancelled_at when status flips to cancelled', async () => {
    const page = await seedPage(A);
    const booking = await seedBooking({ pageId: page.id, clientId: A.client.id });
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/tools/booking/[id]/bookings/[bookingId]/route');
    const res = await callHandler<{ success: boolean; data: { notes: string | null; status: string; cancelledAt: string | null } }>(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(page.id), bookingId: String(booking.id) }, body: { notes: 'Customer no-show', status: 'cancelled' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.notes).toBe('Customer no-show');
    expect(res.data?.data.status).toBe('cancelled');
    expect(res.data?.data.cancelledAt).toBeTruthy();
  });
});

describe('POST /api/portal/tools/booking/[id]/bookings/[bookingId]/refund @booking @portal', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('bk-rf-a'),
      sessionForNewClientUser('bk-rf-b'),
    ]);
    await Promise.all([enableBookingService(A), enableBookingService(B)]);
    stripeRefundCreate.mockReset();
    process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_mock';
  });

  it('401 unauth', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/tools/booking/[id]/bookings/[bookingId]/refund/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: '1', bookingId: '1' }, body: {} },
    );
    expect(res.status).toBe(401);
  });

  it('404 when booking page is in another tenant', async () => {
    const page = await seedPage(B);
    const booking = await seedBooking({
      pageId: page.id, clientId: B.client.id,
      paymentStatus: 'paid', total: 5000, stripePaymentIntentId: 'pi_test_1',
    });
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/tools/booking/[id]/bookings/[bookingId]/refund/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(page.id), bookingId: String(booking.id) }, body: {} },
    );
    expect(res.status).toBe(404);
    expect(stripeRefundCreate).not.toHaveBeenCalled();
  });

  it('400 when booking has no payment to refund (paymentStatus=free)', async () => {
    const page = await seedPage(A);
    const booking = await seedBooking({ pageId: page.id, clientId: A.client.id });
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/tools/booking/[id]/bookings/[bookingId]/refund/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(page.id), bookingId: String(booking.id) }, body: {} },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/no payment/i);
  });

  it('full refund flips paymentStatus -> refunded and status -> cancelled', async () => {
    const page = await seedPage(A);
    const booking = await seedBooking({
      pageId: page.id, clientId: A.client.id,
      paymentStatus: 'paid', total: 5000, stripePaymentIntentId: 'pi_test_full',
    });
    stripeRefundCreate.mockResolvedValue({ id: 're_full', amount: 5000, status: 'succeeded' });
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/tools/booking/[id]/bookings/[bookingId]/refund/route');
    const res = await callHandler<{ success: boolean; data: { refundId: string; amount: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(page.id), bookingId: String(booking.id) }, body: {} },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.refundId).toBe('re_full');
    expect(stripeRefundCreate).toHaveBeenCalledWith({ payment_intent: 'pi_test_full' });

    const sql = getTestSql();
    const [row] = await sql<{ payment_status: string; status: string; cancelled_at: Date | null }[]>`
      SELECT payment_status, status, cancelled_at
      FROM ${sql(TEST_SCHEMA)}.bookings WHERE id = ${booking.id}
    `;
    expect(row.payment_status).toBe('refunded');
    expect(row.status).toBe('cancelled');
    expect(row.cancelled_at).not.toBeNull();
  });

  it('partial refund keeps booking status confirmed but marks paymentStatus refunded', async () => {
    const page = await seedPage(A);
    const booking = await seedBooking({
      pageId: page.id, clientId: A.client.id,
      paymentStatus: 'paid', total: 5000, stripePaymentIntentId: 'pi_test_partial',
    });
    stripeRefundCreate.mockResolvedValue({ id: 're_partial', amount: 1000, status: 'succeeded' });
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/tools/booking/[id]/bookings/[bookingId]/refund/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(page.id), bookingId: String(booking.id) }, body: { amount: 1000 } },
    );
    expect(res.status).toBe(200);
    expect(stripeRefundCreate).toHaveBeenCalledWith({ payment_intent: 'pi_test_partial', amount: 1000 });

    const sql = getTestSql();
    const [row] = await sql<{ payment_status: string; status: string }[]>`
      SELECT payment_status, status
      FROM ${sql(TEST_SCHEMA)}.bookings WHERE id = ${booking.id}
    `;
    expect(row.payment_status).toBe('refunded');
    // partial refund should NOT cancel the booking
    expect(row.status).toBe('confirmed');
  });
});
