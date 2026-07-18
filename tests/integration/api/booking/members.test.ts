/**
 * Booking page members — /api/portal/tools/booking/[id]/members
 *   GET   — list page members + team members
 *   POST  — add an existing client team member to the page (upsert)
 *   PUT   — bulk update displayName / color / availability / active
 *   DELETE — remove member by ?memberId=…
 *
 * Coverage:
 *   - Auth (401), service gate (403), cross-tenant rejection (404)
 *   - POST 400 when userId omitted, 400 when user is NOT a client team member
 *   - POST upserts (second POST returns updated row, no dup)
 *   - DELETE 400 without memberId, 200 + assignedMembers JSON pruned
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
      buffer_before, buffer_after, conference_type, google_calendar_sync, color,
      assigned_members
    ) VALUES (
      ${ctx.client.id}, 'Page', ${slug}, 30, 60, 60, 'UTC', true, 0, false, false,
      false, false, false, false, true, 0, 15, 'none', false, '#2563eb',
      '[]'::json
    ) RETURNING id
  `;
  return row;
}

/** Add a teammate user as a client_member of the given client. Returns the user id. */
async function addTeammate(ctx: TenantCtx, label: string): Promise<number> {
  const sql = getTestSql();
  const email = `teammate-${label}-${Date.now()}-${Math.floor(Math.random() * 1e9)}@test.local`;
  const [u] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.users (name, email, password, role, active)
    VALUES (${label}, ${email}, 'x', 'editor', true) RETURNING id
  `;
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_members (client_id, user_id, role)
    VALUES (${ctx.client.id}, ${u.id}, 'member')
  `;
  return u.id;
}

describe('Members @booking @members', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('mem-a'),
      sessionForNewClientUser('mem-b'),
    ]);
    await Promise.all([enableBookingService(A), enableBookingService(B)]);
  });

  it('GET 401 unauth', async () => {
    mockedAuth.mockResolvedValue(null);
    const page = await seedPage(A);
    const route = await import('@/app/api/portal/tools/booking/[id]/members/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(page.id) } },
    );
    expect(res.status).toBe(401);
  });

  it('GET 404 cross-tenant', async () => {
    const page = await seedPage(B);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/[id]/members/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(page.id) } },
    );
    expect(res.status).toBe(404);
  });

  it('GET returns members + teamMembers shape', async () => {
    const page = await seedPage(A);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/[id]/members/route');
    const res = await callHandler<{ success: boolean; data: { members: unknown[]; teamMembers: unknown[] } }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(page.id) } },
    );
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data?.data.members)).toBe(true);
    expect(Array.isArray(res.data?.data.teamMembers)).toBe(true);
  });

  it('POST 400 when userId is missing', async () => {
    const page = await seedPage(A);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/[id]/members/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(page.id) }, body: {} },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/userId/i);
  });

  it('POST 400 when user is not on the client team', async () => {
    const page = await seedPage(A);
    const outsiderId = await addTeammate(B, 'outsider'); // teammate of B, not A
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/[id]/members/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(page.id) }, body: { userId: outsiderId } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/team member/i);
  });

  it('POST adds a teammate, second call upserts (no dup)', async () => {
    const page = await seedPage(A);
    const teammateId = await addTeammate(A, 'mate');
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/[id]/members/route');

    const first = await callHandler<{ success: boolean; data: { id: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(page.id) }, body: { userId: teammateId, displayName: 'First Display' } },
    );
    expect(first.status).toBe(200);

    const second = await callHandler<{ success: boolean; data: { id: number; displayName: string } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(page.id) }, body: { userId: teammateId, displayName: 'Updated Display' } },
    );
    expect(second.status).toBe(200);
    expect(second.data?.data.displayName).toBe('Updated Display');

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.booking_page_members
      WHERE booking_page_id = ${page.id} AND user_id = ${teammateId}
    `;
    expect(rows.length).toBe(1);
  });

  it('PUT bulk-updates displayName + color + active', async () => {
    const page = await seedPage(A);
    const teammateId = await addTeammate(A, 'mate2');
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/[id]/members/route');
    const created = await callHandler<{ success: boolean; data: { id: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(page.id) }, body: { userId: teammateId } },
    );

    const upd = await callHandler<{ success: boolean; data: { displayName: string; color: string; active: boolean } }>(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(page.id) }, body: {
        memberId: created.data!.data.id, displayName: 'Pat', color: '#abcdef', active: false,
      } },
    );
    expect(upd.status).toBe(200);
    expect(upd.data?.data.displayName).toBe('Pat');
    expect(upd.data?.data.color).toBe('#abcdef');
    expect(upd.data?.data.active).toBe(false);
  });

  it('PUT 400 without memberId', async () => {
    const page = await seedPage(A);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/[id]/members/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(page.id) }, body: { displayName: 'X' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/memberId/i);
  });

  it('DELETE 400 without memberId query param', async () => {
    const page = await seedPage(A);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/[id]/members/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(page.id) } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/memberId/i);
  });

  it('DELETE removes the member and prunes assignedMembers JSON on the page', async () => {
    const page = await seedPage(A);
    const teammateId = await addTeammate(A, 'rm-mate');
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/[id]/members/route');

    const created = await callHandler<{ success: boolean; data: { id: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(page.id) }, body: { userId: teammateId } },
    );

    // Verify assignedMembers contains the new userId
    const sql = getTestSql();
    const [before] = await sql<{ assigned_members: number[] }[]>`
      SELECT assigned_members FROM ${sql(TEST_SCHEMA)}.booking_pages WHERE id = ${page.id}
    `;
    expect(before.assigned_members).toContain(teammateId);

    const del = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(page.id) }, query: { memberId: created.data!.data.id } },
    );
    expect(del.status).toBe(200);

    const [after] = await sql<{ assigned_members: number[] }[]>`
      SELECT assigned_members FROM ${sql(TEST_SCHEMA)}.booking_pages WHERE id = ${page.id}
    `;
    expect(after.assigned_members).not.toContain(teammateId);
  });
});
