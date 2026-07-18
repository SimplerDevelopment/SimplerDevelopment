/**
 * Booking date overrides —
 *   /api/portal/tools/booking/[id]/date-overrides             (GET, POST)
 *   /api/portal/tools/booking/[id]/date-overrides/[overrideId] (PUT, DELETE)
 *
 * Coverage:
 *   - Auth (401), service gate (403), cross-tenant rejection (404)
 *   - POST validates: date+type required, type ∈ {available, blocked},
 *     when type=available startTime+endTime are required
 *   - 201 + persisted row on success; GET returns ASC by date
 *   - PUT updates fields; DELETE removes the row
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
      false, false, false, false, false, 0, 15, 'none', false, '#2563eb'
    ) RETURNING id
  `;
  return row;
}

describe('Date overrides — POST/GET on parent route @booking @overrides', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('do-a'),
      sessionForNewClientUser('do-b'),
    ]);
    await Promise.all([enableBookingService(A), enableBookingService(B)]);
  });

  it('GET 401 unauth', async () => {
    mockedAuth.mockResolvedValue(null);
    const page = await seedPage(A);
    const route = await import('@/app/api/portal/tools/booking/[id]/date-overrides/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(page.id) } },
    );
    expect(res.status).toBe(401);
  });

  it('POST 404 cross-tenant', async () => {
    const page = await seedPage(B);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/[id]/date-overrides/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(page.id) }, body: { date: '2026-06-01', type: 'blocked' } },
    );
    expect(res.status).toBe(404);
  });

  it('POST 400 when date or type missing', async () => {
    const page = await seedPage(A);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/[id]/date-overrides/route');
    const r1 = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(page.id) }, body: { type: 'blocked' } },
    );
    expect(r1.status).toBe(400);

    const r2 = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(page.id) }, body: { date: '2026-06-01' } },
    );
    expect(r2.status).toBe(400);
  });

  it('POST 400 when type is not "available" or "blocked"', async () => {
    const page = await seedPage(A);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/[id]/date-overrides/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(page.id) }, body: { date: '2026-06-01', type: 'maybe' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/available.*blocked/i);
  });

  it('POST 400 when type=available but startTime/endTime omitted', async () => {
    const page = await seedPage(A);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/[id]/date-overrides/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(page.id) }, body: { date: '2026-06-01', type: 'available' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/startTime.*endTime/i);
  });

  it('POST 201 + GET ASC by date', async () => {
    const page = await seedPage(A);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/[id]/date-overrides/route');

    await callHandler(route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(page.id) }, body: { date: '2026-07-15', type: 'blocked' } });
    await callHandler(route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(page.id) }, body: { date: '2026-06-01', type: 'available', startTime: '09:00', endTime: '17:00' } });

    const list = await callHandler<{ success: boolean; data: { date: string; type: string }[] }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(page.id) } },
    );
    expect(list.status).toBe(200);
    expect(list.data?.data.map(o => o.date)).toEqual(['2026-06-01', '2026-07-15']);
  });
});

describe('Date overrides — PUT/DELETE @booking @overrides', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('do-id-a'),
      sessionForNewClientUser('do-id-b'),
    ]);
    await Promise.all([enableBookingService(A), enableBookingService(B)]);
  });

  async function createOverride(ctx: TenantCtx) {
    const page = await seedPage(ctx);
    mockedAuth.mockResolvedValue(ctx.session);
    const route = await import('@/app/api/portal/tools/booking/[id]/date-overrides/route');
    const r = await callHandler<{ success: boolean; data: { id: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(page.id) }, body: { date: '2026-08-15', type: 'blocked' } },
    );
    return { pageId: page.id, overrideId: r.data!.data.id };
  }

  it('PUT 404 cross-tenant', async () => {
    const { pageId, overrideId } = await createOverride(B);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/[id]/date-overrides/[overrideId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(pageId), overrideId: String(overrideId) }, body: { note: 'x' } },
    );
    expect(res.status).toBe(404);
  });

  it('PUT updates note + type', async () => {
    const { pageId, overrideId } = await createOverride(A);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/[id]/date-overrides/[overrideId]/route');
    const res = await callHandler<{ success: boolean; data: { note: string | null; type: string } }>(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(pageId), overrideId: String(overrideId) }, body: { note: 'Holiday', type: 'available', startTime: '10:00', endTime: '14:00' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.note).toBe('Holiday');
    expect(res.data?.data.type).toBe('available');
  });

  it('DELETE removes the override (200)', async () => {
    const { pageId, overrideId } = await createOverride(A);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/[id]/date-overrides/[overrideId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(pageId), overrideId: String(overrideId) } },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.booking_date_overrides WHERE id = ${overrideId}
    `;
    expect(rows.length).toBe(0);
  });

  it('DELETE 404 cross-tenant + leaves row intact', async () => {
    const { pageId, overrideId } = await createOverride(B);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/[id]/date-overrides/[overrideId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(pageId), overrideId: String(overrideId) } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.booking_date_overrides WHERE id = ${overrideId}
    `;
    expect(rows.length).toBe(1);
  });
});
