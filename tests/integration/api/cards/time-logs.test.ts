/**
 * Time logs:
 *   POST   /api/portal/cards/[id]/time-logs
 *   DELETE /api/portal/cards/[id]/time-logs/[logId]
 *
 * Contract:
 *   POST:
 *     - 401 unauth
 *     - 403 client (non-staff) — staff-only feature
 *     - 400 minutes <= 0 / missing
 *     - 200 + row inserted with userId/cardId attached
 *   DELETE:
 *     - 401 unauth
 *     - 403 client
 *     - 200 row removed (regardless of cardId match — the route only filters by logId,
 *       which is a known coarse filter; we pin the current behaviour to flag any tightening)
 *
 * NOTE: the recon's "PATCH" on time-logs does not exist in the codebase — this file
 * covers the methods that DO exist.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import {
  sessionForNewClientUser,
  sessionForStaff,
  type TenantCtx,
} from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function seedCardWithLog(client: TenantCtx, opts?: { withLog?: boolean; userId?: number }) {
  const sql = getTestSql();
  const [proj] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.projects (name, client_id, status, created_by)
    VALUES ('TimeLog project', ${client.client.id}, 'active', ${client.user.id})
    RETURNING id
  `;
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.project_members (project_id, user_id, role)
    VALUES (${proj.id}, ${client.user.id}, 'owner')
  `;
  const [col] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.kanban_columns (project_id, name, "order")
    VALUES (${proj.id}, 'Todo', 0) RETURNING id
  `;
  const [card] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.kanban_cards (column_id, project_id, title, "order")
    VALUES (${col.id}, ${proj.id}, 'C', 0) RETURNING id
  `;
  let logId: number | null = null;
  if (opts?.withLog) {
    const [log] = await sql<{ id: number }[]>`
      INSERT INTO ${sql(TEST_SCHEMA)}.kanban_card_time_logs (card_id, user_id, minutes, note)
      VALUES (${card.id}, ${opts.userId ?? client.user.id}, 30, 'seed')
      RETURNING id
    `;
    logId = log.id;
  }
  return { projectId: proj.id, cardId: card.id, logId };
}

describe('POST /api/portal/cards/[id]/time-logs @cards @time-logs', () => {
  let client: TenantCtx;
  let staff: TenantCtx;
  beforeEach(async () => {
    [client, staff] = await Promise.all([
      sessionForNewClientUser('tl-client'),
      sessionForStaff('tl-staff'),
    ]);
  });

  it('401 unauthenticated', async () => {
    const { cardId } = await seedCardWithLog(client);
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/cards/[id]/time-logs/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(cardId) }, body: { minutes: 5 } },
    );
    expect(res.status).toBe(401);
  });

  it('403 client (non-staff)', async () => {
    const { cardId } = await seedCardWithLog(client);
    mockedAuth.mockResolvedValue(client.session);
    const route = await import('@/app/api/portal/cards/[id]/time-logs/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(cardId) }, body: { minutes: 5 } },
    );
    expect(res.status).toBe(403);
  });

  it('400 when minutes is missing', async () => {
    const { cardId } = await seedCardWithLog(client);
    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/portal/cards/[id]/time-logs/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(cardId) }, body: {} },
    );
    expect(res.status).toBe(400);
  });

  it('400 when minutes is zero or negative', async () => {
    const { cardId } = await seedCardWithLog(client);
    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/portal/cards/[id]/time-logs/route');

    const r0 = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(cardId) }, body: { minutes: 0 } },
    );
    expect(r0.status).toBe(400);

    const rn = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(cardId) }, body: { minutes: -5 } },
    );
    expect(rn.status).toBe(400);
  });

  it('200 + row inserted with cardId/userId/minutes/note', async () => {
    const { cardId } = await seedCardWithLog(client);
    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/portal/cards/[id]/time-logs/route');
    const res = await callHandler<{ success: boolean; data: { id: number; minutes: number; note: string | null } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(cardId) }, body: { minutes: 17, note: 'work' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data?.minutes).toBe(17);
    expect(res.data?.data?.note).toBe('work');

    const sql = getTestSql();
    const [row] = await sql<{ minutes: number; note: string | null; user_id: number; card_id: number }[]>`
      SELECT minutes, note, user_id, card_id
      FROM ${sql(TEST_SCHEMA)}.kanban_card_time_logs WHERE card_id = ${cardId}
    `;
    expect(row.minutes).toBe(17);
    expect(row.note).toBe('work');
    expect(row.user_id).toBe(staff.user.id);
    expect(row.card_id).toBe(cardId);
  });
});

describe('DELETE /api/portal/cards/[id]/time-logs/[logId] @cards @time-logs', () => {
  let client: TenantCtx;
  let staff: TenantCtx;
  beforeEach(async () => {
    [client, staff] = await Promise.all([
      sessionForNewClientUser('tl-del-client'),
      sessionForStaff('tl-del-staff'),
    ]);
  });

  it('401 unauthenticated', async () => {
    const { cardId, logId } = await seedCardWithLog(client, { withLog: true });
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/cards/[id]/time-logs/[logId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(cardId), logId: String(logId) } },
    );
    expect(res.status).toBe(401);
  });

  it('403 client', async () => {
    const { cardId, logId } = await seedCardWithLog(client, { withLog: true });
    mockedAuth.mockResolvedValue(client.session);
    const route = await import('@/app/api/portal/cards/[id]/time-logs/[logId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(cardId), logId: String(logId) } },
    );
    expect(res.status).toBe(403);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.kanban_card_time_logs WHERE id = ${logId}
    `;
    expect(rows.length).toBe(1);
  });

  it('200 + row deleted when staff acts', async () => {
    const { cardId, logId } = await seedCardWithLog(client, { withLog: true });
    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/portal/cards/[id]/time-logs/[logId]/route');
    const res = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(cardId), logId: String(logId) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.kanban_card_time_logs WHERE id = ${logId}
    `;
    expect(rows.length).toBe(0);
  });

  it('200 even for non-existent logId (idempotent no-op)', async () => {
    const { cardId } = await seedCardWithLog(client);
    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/portal/cards/[id]/time-logs/[logId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(cardId), logId: '99999999' } },
    );
    expect(res.status).toBe(200);
  });
});
