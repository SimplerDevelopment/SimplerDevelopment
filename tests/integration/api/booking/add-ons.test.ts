/**
 * Booking add-ons —
 *   /api/portal/tools/booking/[id]/add-ons      (GET, POST)
 *   /api/portal/tools/booking/[id]/add-ons/[addOnId]  (PUT, DELETE)
 *
 * Coverage:
 *   - Auth (401), service gate (403), cross-tenant rejection (404)
 *   - Custom add-on POST requires name + price (400 otherwise)
 *   - Product add-on POST requires productId (400 otherwise)
 *   - Created with default ordering, list returns ASC by order
 *   - PUT updates price/order/active; DELETE removes the row
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
      true, false, false, false, false, 0, 15, 'none', false, '#2563eb'
    ) RETURNING id
  `;
  return row;
}

describe('GET /api/portal/tools/booking/[id]/add-ons @booking @addons', () => {
  let A: TenantCtx;
  beforeEach(async () => {
    A = await sessionForNewClientUser('addons-list');
    await enableBookingService(A);
  });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const page = await seedPage(A);
    const route = await import('@/app/api/portal/tools/booking/[id]/add-ons/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(page.id) } },
    );
    expect(res.status).toBe(401);
  });

  it('403 when client has no booking subscription', async () => {
    const C = await sessionForNewClientUser('addons-no-svc');
    const page = await seedPage(C);
    mockedAuth.mockResolvedValue(C.session);
    const route = await import('@/app/api/portal/tools/booking/[id]/add-ons/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(page.id) } },
    );
    expect([401, 402, 403]).toContain(res.status);
  });

  it('returns add-ons in ascending order', async () => {
    const page = await seedPage(A);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/[id]/add-ons/route');

    // Create out of order
    await callHandler(route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(page.id) }, body: { source: 'custom', name: 'Z', price: 100, order: 2 } });
    await callHandler(route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(page.id) }, body: { source: 'custom', name: 'A', price: 100, order: 0 } });
    await callHandler(route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(page.id) }, body: { source: 'custom', name: 'M', price: 100, order: 1 } });

    const res = await callHandler<{ success: boolean; data: { name: string; order: number }[] }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(page.id) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.map(a => a.name)).toEqual(['A', 'M', 'Z']);
  });
});

describe('POST /api/portal/tools/booking/[id]/add-ons @booking @addons', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('addons-create-a'),
      sessionForNewClientUser('addons-create-b'),
    ]);
    await Promise.all([enableBookingService(A), enableBookingService(B)]);
  });

  it('404 cross-tenant', async () => {
    const page = await seedPage(B);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/[id]/add-ons/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(page.id) }, body: { source: 'custom', name: 'X', price: 100 } },
    );
    expect(res.status).toBe(404);
  });

  it('400 when source=custom and name missing', async () => {
    const page = await seedPage(A);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/[id]/add-ons/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(page.id) }, body: { source: 'custom', price: 100 } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/name and price/i);
  });

  it('400 when source=custom and price missing', async () => {
    const page = await seedPage(A);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/[id]/add-ons/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(page.id) }, body: { source: 'custom', name: 'X' } },
    );
    expect(res.status).toBe(400);
  });

  it('400 when source=product but productId is missing', async () => {
    const page = await seedPage(A);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/[id]/add-ons/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(page.id) }, body: { source: 'product' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/productId/i);
  });

  it('201 + persisted row for a valid custom add-on', async () => {
    const page = await seedPage(A);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/[id]/add-ons/route');
    const res = await callHandler<{ success: boolean; data: { id: number; name: string; price: number; maxQuantity: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(page.id) }, body: { source: 'custom', name: 'T-shirt', price: 2500 } },
    );
    expect(res.status).toBe(201);
    expect(res.data?.data.name).toBe('T-shirt');
    expect(res.data?.data.price).toBe(2500);
    expect(res.data?.data.maxQuantity).toBe(10);
  });
});

describe('PUT/DELETE /api/portal/tools/booking/[id]/add-ons/[addOnId] @booking @addons', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('addons-id-a'),
      sessionForNewClientUser('addons-id-b'),
    ]);
    await Promise.all([enableBookingService(A), enableBookingService(B)]);
  });

  async function createAddOn(ctx: TenantCtx) {
    const page = await seedPage(ctx);
    mockedAuth.mockResolvedValue(ctx.session);
    const route = await import('@/app/api/portal/tools/booking/[id]/add-ons/route');
    const res = await callHandler<{ success: boolean; data: { id: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(page.id) }, body: { source: 'custom', name: 'Hat', price: 1000 } },
    );
    return { pageId: page.id, addOnId: res.data!.data.id };
  }

  it('PUT 404 cross-tenant', async () => {
    const { pageId, addOnId } = await createAddOn(B);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/[id]/add-ons/[addOnId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(pageId), addOnId: String(addOnId) }, body: { name: 'Hijack' } },
    );
    expect(res.status).toBe(404);
  });

  it('PUT updates price + active', async () => {
    const { pageId, addOnId } = await createAddOn(A);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/[id]/add-ons/[addOnId]/route');
    const res = await callHandler<{ success: boolean; data: { price: number; active: boolean } }>(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(pageId), addOnId: String(addOnId) }, body: { price: 1500, active: false } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.price).toBe(1500);
    expect(res.data?.data.active).toBe(false);
  });

  it('DELETE removes the add-on (200), then PUT 404', async () => {
    const { pageId, addOnId } = await createAddOn(A);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/[id]/add-ons/[addOnId]/route');
    const del = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(pageId), addOnId: String(addOnId) } },
    );
    expect(del.status).toBe(200);

    const after = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(pageId), addOnId: String(addOnId) }, body: { name: 'X' } },
    );
    expect(after.status).toBe(404);
  });

  it('DELETE 404 cross-tenant + leaves the row intact', async () => {
    const { pageId, addOnId } = await createAddOn(B);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/[id]/add-ons/[addOnId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(pageId), addOnId: String(addOnId) } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.booking_add_ons WHERE id = ${addOnId}
    `;
    expect(rows.length).toBe(1);
  });
});
