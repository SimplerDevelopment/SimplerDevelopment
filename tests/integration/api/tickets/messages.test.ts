/**
 * POST /api/portal/tickets/[id]/messages
 *
 * Contract:
 *   - 401 unauth
 *   - 404 cross-tenant ticket id (client check)
 *   - 400 when body is empty/whitespace
 *   - 200 + message persisted; client cannot set isInternal=true
 *   - staff can post and set isInternal=true
 *   - status auto-advance: open -> in_progress on staff reply,
 *                          waiting -> open on client reply
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import {
  sessionForStaff,
  twoTenants,
  type TenantCtx,
} from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function seedTicket(
  ctx: TenantCtx,
  status: 'open' | 'waiting' | 'in_progress' = 'open',
): Promise<{ id: number }> {
  const sql = getTestSql();
  const ts = Date.now();
  const rand = Math.floor(Math.random() * 1e6);
  // support_tickets.number is INTEGER (max ~2.1B) — keep within int4 range.
  const number = (ts % 100_000_000) + rand;
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.support_tickets
      (number, client_id, subject, category, priority, status, created_by)
    VALUES
      (${number}, ${ctx.client.id}, ${`Subj-${ts}-${rand}`},
       'general', 'medium', ${status}, ${ctx.user.id})
    RETURNING id
  `;
  return { id: row.id };
}

describe('POST /api/portal/tickets/[id]/messages @tickets @messages', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  let staff: TenantCtx;
  beforeEach(async () => {
    [{ A, B }, staff] = await Promise.all([twoTenants(), sessionForStaff('agency-tickets')]);
  });

  it('401 unauthenticated', async () => {
    const { id } = await seedTicket(A);
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/tickets/[id]/messages/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(id) }, body: { body: 'hello' } });
    expect(res.status).toBe(401);
  });

  it("404 cross-tenant: A cannot post a message on B's ticket", async () => {
    const { id } = await seedTicket(B);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tickets/[id]/messages/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(id) }, body: { body: 'leak' } });
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.ticket_messages WHERE ticket_id = ${id}
    `;
    expect(rows.length).toBe(0);
  });

  it('400 when body is empty', async () => {
    const { id } = await seedTicket(A);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tickets/[id]/messages/route');
    const r1 = await callHandler(route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(id) }, body: { body: '' } });
    expect(r1.status).toBe(400);
    const r2 = await callHandler(route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(id) }, body: { body: '   ' } });
    expect(r2.status).toBe(400);
  });

  it('200 + message persisted; client request cannot set isInternal', async () => {
    const { id } = await seedTicket(A);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tickets/[id]/messages/route');
    const res = await callHandler<{ data: { id: number; isInternal: boolean; body: string; authorId: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(id) }, body: { body: 'follow up', isInternal: true } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data?.isInternal).toBe(false); // forced false for clients
    expect(res.data?.data?.body).toBe('follow up');
  });

  it('staff can post + flag isInternal=true', async () => {
    const { id } = await seedTicket(A);
    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/portal/tickets/[id]/messages/route');
    const res = await callHandler<{ data: { isInternal: boolean } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(id) }, body: { body: 'staff note', isInternal: true } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data?.isInternal).toBe(true);
  });

  it('status auto-advances: open -> in_progress on staff reply', async () => {
    const { id } = await seedTicket(A, 'open');
    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/portal/tickets/[id]/messages/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(id) }, body: { body: 'taking a look' } });
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const [row] = await sql<{ status: string }[]>`
      SELECT status FROM ${sql(TEST_SCHEMA)}.support_tickets WHERE id = ${id}
    `;
    expect(row.status).toBe('in_progress');
  });

  it('status auto-advances: waiting -> open on client reply', async () => {
    const { id } = await seedTicket(A, 'waiting');
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tickets/[id]/messages/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(id) }, body: { body: 'replying back' } });
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const [row] = await sql<{ status: string }[]>`
      SELECT status FROM ${sql(TEST_SCHEMA)}.support_tickets WHERE id = ${id}
    `;
    expect(row.status).toBe('open');
  });
});
