/**
 * Booking pages — /api/portal/tools/booking + /api/portal/tools/booking/[id]
 *
 * Coverage:
 *   - Service gate: 403 without booking subscription, 200 once active
 *   - List, create, update, delete (portal owner role)
 *   - Cross-tenant rejection on GET/PUT/DELETE (404)
 *   - Bad input (POST 400 without title)
 *   - DELETE removes the row; subsequent GET is 404
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/automation', () => ({
  emitEvent: vi.fn().mockResolvedValue(undefined),
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

async function seedPage(ctx: TenantCtx, overrides: { title?: string; slug?: string; active?: boolean } = {}): Promise<{ id: number; slug: string }> {
  const sql = getTestSql();
  const slug = overrides.slug ?? `pg-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const [row] = await sql<{ id: number; slug: string }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.booking_pages (
      client_id, title, slug, duration, max_advance_days, min_notice_mins,
      timezone, active, price, checkin_enabled, enable_discount_codes,
      enable_add_ons, enable_gift_certificates, enable_waivers,
      require_waiver_before_booking, allow_staff_selection,
      buffer_before, buffer_after, conference_type, google_calendar_sync, color
    ) VALUES (
      ${ctx.client.id}, ${overrides.title ?? 'Seeded Page'}, ${slug}, 30,
      60, 60, 'UTC', ${overrides.active ?? true}, 0, false, false,
      false, false, false, false, false, 0, 15, 'none', false, '#2563eb'
    ) RETURNING id, slug
  `;
  return row;
}

describe('Booking pages — service gate @booking @portal', () => {
  it('403 when client has no booking subscription', async () => {
    const A = await sessionForNewClientUser('bk-pg-nosvc');
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/tools/booking/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
    );
    expect([401, 402, 403]).toContain(res.status);
  });

  it('200 once the booking service is active', async () => {
    const A = await sessionForNewClientUser('bk-pg-svc-ok');
    await enableBookingService(A);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/tools/booking/route');
    const res = await callHandler<{ success: boolean; data: unknown[] }>(
      route as unknown as Record<string, unknown>, 'GET',
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(Array.isArray(res.data?.data)).toBe(true);
  });
});

describe('Booking pages — list / create @booking @portal', () => {
  let A: TenantCtx;
  beforeEach(async () => {
    A = await sessionForNewClientUser('bk-pg-crud');
    await enableBookingService(A);
    mockedAuth.mockResolvedValue(A.session);
  });

  it('GET 401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/tools/booking/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET');
    expect(res.status).toBe(401);
  });

  it('POST creates a page and auto-generates a slug from the title', async () => {
    const route = await import('@/app/api/portal/tools/booking/route');
    const res = await callHandler<{ success: boolean; data: { id: number; slug: string; title: string; duration: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { title: 'Office Hours!', duration: 45, timezone: 'America/Chicago' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data.title).toBe('Office Hours!');
    expect(res.data?.data.slug).toMatch(/^office-hours-[a-z0-9]+$/);
    expect(res.data?.data.duration).toBe(45);
  });

  it('POST 400 when title is missing', async () => {
    const route = await import('@/app/api/portal/tools/booking/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { description: 'No title' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/title/i);
  });

  it('POST 400 when title is empty / whitespace', async () => {
    const route = await import('@/app/api/portal/tools/booking/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { title: '   ' } },
    );
    expect(res.status).toBe(400);
  });

  it('GET returns only the caller\'s pages (cross-tenant scope)', async () => {
    const B = await sessionForNewClientUser('bk-pg-crud-b');
    await enableBookingService(B);
    await seedPage(A, { title: 'Mine' });
    await seedPage(B, { title: 'Theirs' });

    const route = await import('@/app/api/portal/tools/booking/route');
    const res = await callHandler<{ success: boolean; data: { title: string }[] }>(
      route as unknown as Record<string, unknown>, 'GET',
    );
    expect(res.status).toBe(200);
    const titles = res.data!.data.map(p => p.title);
    expect(titles).toContain('Mine');
    expect(titles).not.toContain('Theirs');
  });
});

describe('Booking pages — GET / PUT / DELETE by id @booking @portal', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('bk-pg-id-a'),
      sessionForNewClientUser('bk-pg-id-b'),
    ]);
    await Promise.all([enableBookingService(A), enableBookingService(B)]);
  });

  it('GET 404 for cross-tenant page', async () => {
    const page = await seedPage(B);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(page.id) } },
    );
    expect(res.status).toBe(404);
  });

  it('GET returns the page when it belongs to the caller', async () => {
    const page = await seedPage(A, { title: 'Owned' });
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/[id]/route');
    const res = await callHandler<{ success: boolean; data: { id: number; title: string } }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(page.id) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.title).toBe('Owned');
  });

  it('PUT updates allowed fields, ignores unknown ones', async () => {
    const page = await seedPage(A);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/[id]/route');
    const res = await callHandler<{ success: boolean; data: { title: string; duration: number; bufferBefore: number } }>(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(page.id) }, body: {
        title: 'Renamed',
        duration: 60,
        bufferBefore: 5,
        unknownField: 'should be ignored',
      } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.title).toBe('Renamed');
    expect(res.data?.data.duration).toBe(60);
    expect(res.data?.data.bufferBefore).toBe(5);
  });

  it('PUT 404 cross-tenant + leaves the row untouched', async () => {
    const page = await seedPage(B, { title: 'B-original' });
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(page.id) }, body: { title: 'A-attempt' } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const [row] = await sql<{ title: string }[]>`
      SELECT title FROM ${sql(TEST_SCHEMA)}.booking_pages WHERE id = ${page.id}
    `;
    expect(row.title).toBe('B-original');
  });

  it('DELETE removes the page for the owner', async () => {
    const page = await seedPage(A);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(page.id) } },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.booking_pages WHERE id = ${page.id}
    `;
    expect(rows.length).toBe(0);
  });

  it('DELETE 404 cross-tenant + does not delete the row', async () => {
    const page = await seedPage(B);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(page.id) } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.booking_pages WHERE id = ${page.id}
    `;
    expect(rows.length).toBe(1);
  });

  it('GET 404 for non-existent id', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: '9999999' } },
    );
    expect(res.status).toBe(404);
  });
});
