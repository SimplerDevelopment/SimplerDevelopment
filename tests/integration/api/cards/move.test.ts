/**
 * PATCH /api/portal/cards/[id]/move
 *
 * NOTE: the recon listed this as POST but the route exports PATCH only.
 *
 * Contract:
 *   - 401 unauth
 *   - 404 card does not exist
 *   - 400 destination column belongs to a different project
 *   - 403 non-staff caller whose client does not own the project
 *   - 200 + columnId/order updated when authorized
 *   - 200 + activity row recorded when columnId actually changes
 *
 * Move is *not* gated by canEdit (private vs agency) — per the route comment,
 * any user who can view the project can re-triage the board. This test pins
 * that semantic.
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
import type { ProjectRole } from '@/lib/portal/project-permissions';

async function seedTwoColCard(client: TenantCtx, clientRole: ProjectRole = 'owner') {
  const sql = getTestSql();
  const [proj] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.projects (name, client_id, status, created_by)
    VALUES ('Move project', ${client.client.id}, 'active', ${client.user.id})
    RETURNING id
  `;
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.project_members (project_id, user_id, role)
    VALUES (${proj.id}, ${client.user.id}, ${clientRole})
  `;
  const [todo] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.kanban_columns (project_id, name, "order")
    VALUES (${proj.id}, 'Todo', 0) RETURNING id
  `;
  const [done] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.kanban_columns (project_id, name, "order")
    VALUES (${proj.id}, 'Done', 1) RETURNING id
  `;
  const [card] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.kanban_cards (column_id, project_id, title, "order")
    VALUES (${todo.id}, ${proj.id}, 'C', 0) RETURNING id
  `;
  return { projectId: proj.id, todoId: todo.id, doneId: done.id, cardId: card.id };
}

describe('PATCH /api/portal/cards/[id]/move @cards @move', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  let staff: TenantCtx;
  beforeEach(async () => {
    [{ A, B }, staff] = await Promise.all([
      twoTenants(),
      sessionForStaff('agency-move'),
    ]);
  });

  it('401 unauthenticated', async () => {
    const { cardId, doneId } = await seedTwoColCard(A);
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/cards/[id]/move/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(cardId) }, body: { columnId: doneId, order: 0 } },
    );
    expect(res.status).toBe(401);
  });

  it('404 card does not exist', async () => {
    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/portal/cards/[id]/move/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: '999999999' }, body: { columnId: 1, order: 0 } },
    );
    expect(res.status).toBe(404);
  });

  it('400 destination column in a different project', async () => {
    const own = await seedTwoColCard(A);
    const other = await seedTwoColCard(A); // same tenant, distinct project
    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/portal/cards/[id]/move/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(own.cardId) }, body: { columnId: other.doneId, order: 0 } },
    );
    expect(res.status).toBe(400);
  });

  it('403 cross-tenant client (B\'s card, A\'s session)', async () => {
    const { cardId, doneId } = await seedTwoColCard(B);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/cards/[id]/move/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(cardId) }, body: { columnId: doneId, order: 0 } },
    );
    expect(res.status).toBe(403);

    // No move occurred
    const sql = getTestSql();
    const [row] = await sql<{ column_id: number }[]>`
      SELECT column_id FROM ${sql(TEST_SCHEMA)}.kanban_cards WHERE id = ${cardId}
    `;
    expect(row.column_id).not.toBe(doneId);
  });

  it('200 + columnId/order updated for staff; activity logged on column change', async () => {
    const { cardId, doneId } = await seedTwoColCard(A);
    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/portal/cards/[id]/move/route');
    const res = await callHandler<{ success: boolean; data: { columnId: number; order: number } }>(
      route as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(cardId) }, body: { columnId: doneId, order: 5 } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data?.columnId).toBe(doneId);
    expect(res.data?.data?.order).toBe(5);

    const sql = getTestSql();
    const [card] = await sql<{ column_id: number; order: number }[]>`
      SELECT column_id, "order" FROM ${sql(TEST_SCHEMA)}.kanban_cards WHERE id = ${cardId}
    `;
    expect(card.column_id).toBe(doneId);
    expect(card.order).toBe(5);

    const activities = await sql<{ type: string }[]>`
      SELECT type FROM ${sql(TEST_SCHEMA)}.kanban_card_activities
      WHERE card_id = ${cardId} AND type = 'card.column_changed'
    `;
    expect(activities.length).toBe(1);
  });

  it('200 + same-column reorder does NOT emit column_changed activity', async () => {
    const { cardId, todoId } = await seedTwoColCard(A);
    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/portal/cards/[id]/move/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(cardId) }, body: { columnId: todoId, order: 99 } },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const acts = await sql<{ type: string }[]>`
      SELECT type FROM ${sql(TEST_SCHEMA)}.kanban_card_activities
      WHERE card_id = ${cardId} AND type = 'card.column_changed'
    `;
    expect(acts.length).toBe(0);
  });

  it('200 client owner of agency project can still move (canEdit not gated)', async () => {
    const { cardId, doneId } = await seedTwoColCard(A, 'viewer');
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/cards/[id]/move/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(cardId) }, body: { columnId: doneId, order: 0 } },
    );
    expect(res.status).toBe(200);
  });
});
