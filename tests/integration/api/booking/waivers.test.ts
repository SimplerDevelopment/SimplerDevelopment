/**
 * Booking waivers — /api/portal/tools/booking/[id]/waivers
 *   GET — list waivers signed against a page, optional ?startDate / ?endDate
 *
 * Coverage:
 *   - Auth (401), service gate (403), cross-tenant (404)
 *   - Returns metadata (no signatureData / waiverContent in payload)
 *   - startDate / endDate filter narrows the window
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
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
      false, false, true, false, false, 0, 15, 'none', false, '#2563eb'
    ) RETURNING id
  `;
  return row;
}

async function seedBooking(pageId: number, clientId: number): Promise<number> {
  const sql = getTestSql();
  const start = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.bookings (
      booking_page_id, client_id, guest_name, guest_email,
      start_time, end_time, timezone, status, cancel_token,
      payment_status, total, group_size
    ) VALUES (
      ${pageId}, ${clientId}, 'Guest', 'g@test.local',
      ${start}, ${end}, 'UTC', 'confirmed',
      ${'tok-' + Date.now() + '-' + Math.random()},
      'free', 0, 1
    ) RETURNING id
  `;
  return row.id;
}

async function seedWaiver(opts: {
  bookingId: number; pageId: number; clientId: number;
  signedAt: Date; signerName?: string;
}) {
  const sql = getTestSql();
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.booking_waivers (
      booking_id, booking_page_id, client_id,
      signer_name, signer_email, signature_data, waiver_content,
      ip_address, signed_at
    ) VALUES (
      ${opts.bookingId}, ${opts.pageId}, ${opts.clientId},
      ${opts.signerName ?? 'Signer'}, 'signer@test.local',
      'data:image/png;base64,iVBORw0KGgo=', 'I agree.',
      '127.0.0.1', ${opts.signedAt}
    )
  `;
}

describe('GET /api/portal/tools/booking/[id]/waivers @booking @waivers', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('wv-a'),
      sessionForNewClientUser('wv-b'),
    ]);
    await Promise.all([enableBookingService(A), enableBookingService(B)]);
  });

  it('401 unauth', async () => {
    mockedAuth.mockResolvedValue(null);
    const page = await seedPage(A);
    const route = await import('@/app/api/portal/tools/booking/[id]/waivers/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(page.id) } },
    );
    expect(res.status).toBe(401);
  });

  it('403 without booking subscription', async () => {
    const C = await sessionForNewClientUser('wv-no-svc');
    const page = await seedPage(C);
    mockedAuth.mockResolvedValue(C.session);
    const route = await import('@/app/api/portal/tools/booking/[id]/waivers/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(page.id) } },
    );
    expect([401, 402, 403]).toContain(res.status);
  });

  it('404 cross-tenant', async () => {
    const page = await seedPage(B);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/[id]/waivers/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(page.id) } },
    );
    expect(res.status).toBe(404);
  });

  it('returns metadata only (no signatureData / waiverContent in shape)', async () => {
    const page = await seedPage(A);
    const bookingId = await seedBooking(page.id, A.client.id);
    await seedWaiver({
      bookingId, pageId: page.id, clientId: A.client.id,
      signedAt: new Date(), signerName: 'Alex',
    });
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/tools/booking/[id]/waivers/route');
    const res = await callHandler<{ success: boolean; data: Record<string, unknown>[] }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(page.id) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.length).toBe(1);
    const w = res.data!.data[0];
    expect(w).toHaveProperty('signerName');
    expect(w).toHaveProperty('signerEmail');
    expect(w).toHaveProperty('signedAt');
    expect(w).not.toHaveProperty('signatureData');
    expect(w).not.toHaveProperty('waiverContent');
  });

  it('startDate + endDate narrow the window', async () => {
    const page = await seedPage(A);
    const bookingId = await seedBooking(page.id, A.client.id);

    const farPast = new Date('2020-01-01T00:00:00Z');
    const today = new Date();
    await seedWaiver({ bookingId, pageId: page.id, clientId: A.client.id, signedAt: farPast, signerName: 'Old' });
    await seedWaiver({ bookingId, pageId: page.id, clientId: A.client.id, signedAt: today, signerName: 'Recent' });

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/[id]/waivers/route');

    // Window covering only today
    const ymd = today.toISOString().slice(0, 10);
    const res = await callHandler<{ success: boolean; data: { signerName: string }[] }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(page.id) }, query: { startDate: ymd, endDate: ymd } },
    );
    expect(res.status).toBe(200);
    const names = res.data!.data.map(w => w.signerName);
    expect(names).toContain('Recent');
    expect(names).not.toContain('Old');
  });
});
