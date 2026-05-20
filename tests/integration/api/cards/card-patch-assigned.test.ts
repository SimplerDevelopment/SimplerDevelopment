/**
 * PATCH /api/portal/cards/[id] — assignedTo junction-replace coverage.
 *
 * The basic auth/authz/forbidden matrix is covered by tests/integration/api/security/authz-matrix.test.ts.
 * This file pins down the behaviour around the body.assignedTo field:
 *   - Setting assignedTo: <userId> inserts into kanban_card_assignees and auto-watches the user
 *   - Setting assignedTo: null wipes the existing assignee row(s)
 *   - Reassign from user X to user Y removes X, inserts Y, and adds Y to watchers
 *   - Cross-tenant: A cannot patch B's card (404, no junction mutation)
 *   - Bad input: missing body fields are no-ops; unknown user IDs still get inserted by FK
 *     (we don't assert FK error — current handler doesn't validate user membership)
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

async function seedCard(client: TenantCtx, clientRole: ProjectRole = 'owner') {
  const sql = getTestSql();
  const [proj] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.projects (name, client_id, status, created_by)
    VALUES ('Patch project', ${client.client.id}, 'active', ${client.user.id})
    RETURNING id
  `;
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.project_members (project_id, user_id, role)
    VALUES (${proj.id}, ${client.user.id}, ${clientRole})
  `;
  const [col] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.kanban_columns (project_id, name, "order")
    VALUES (${proj.id}, 'Todo', 0) RETURNING id
  `;
  const [card] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.kanban_cards (column_id, project_id, title, "order")
    VALUES (${col.id}, ${proj.id}, 'C', 0) RETURNING id
  `;
  return { projectId: proj.id, cardId: card.id };
}

async function makeUser(label: string) {
  const sql = getTestSql();
  const email = `${label}-${Date.now()}-${Math.floor(Math.random()*9999)}@test.local`;
  const [u] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.users (name, email, password, role, active)
    VALUES (${label}, ${email}, 'x', 'editor', true) RETURNING id
  `;
  return u.id;
}

describe('PATCH /api/portal/cards/[id] — assignedTo junction @cards @assigned', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  let staff: TenantCtx;

  beforeEach(async () => {
    [{ A, B }, staff] = await Promise.all([
      twoTenants(),
      sessionForStaff('agency-patch'),
    ]);
  });

  it('401 unauthenticated', async () => {
    const { cardId } = await seedCard(A);
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/cards/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(cardId) }, body: { assignedTo: 1 } },
    );
    expect(res.status).toBe(401);
  });

  it('cross-tenant 404: A cannot patch B\'s card and no assignee written', async () => {
    const { cardId } = await seedCard(B);
    const userId = await makeUser('victim');
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/cards/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(cardId) }, body: { assignedTo: userId } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ user_id: number }[]>`
      SELECT user_id FROM ${sql(TEST_SCHEMA)}.kanban_card_assignees WHERE card_id = ${cardId}
    `;
    expect(rows.length).toBe(0);
  });

  it('staff: setting assignedTo inserts into assignees + watchers junctions', async () => {
    const { cardId } = await seedCard(A);
    const userId = await makeUser('assignee-1');
    mockedAuth.mockResolvedValue(staff.session);

    const route = await import('@/app/api/portal/cards/[id]/route');
    const res = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(cardId) }, body: { assignedTo: userId } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);

    const sql = getTestSql();
    const assignees = await sql<{ user_id: number }[]>`
      SELECT user_id FROM ${sql(TEST_SCHEMA)}.kanban_card_assignees WHERE card_id = ${cardId}
    `;
    expect(assignees.map(r => r.user_id)).toEqual([userId]);

    const watchers = await sql<{ user_id: number }[]>`
      SELECT user_id FROM ${sql(TEST_SCHEMA)}.kanban_card_watchers WHERE card_id = ${cardId} AND user_id = ${userId}
    `;
    expect(watchers.length).toBe(1);
  });

  it('staff: setting assignedTo to null clears existing assignment', async () => {
    const { cardId } = await seedCard(A);
    const userId = await makeUser('assignee-clear');
    mockedAuth.mockResolvedValue(staff.session);

    const route = await import('@/app/api/portal/cards/[id]/route');
    // first assign
    await callHandler(route as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(cardId) }, body: { assignedTo: userId } });
    // then clear
    const res = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(cardId) }, body: { assignedTo: null } },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const assignees = await sql<{ user_id: number }[]>`
      SELECT user_id FROM ${sql(TEST_SCHEMA)}.kanban_card_assignees WHERE card_id = ${cardId}
    `;
    expect(assignees.length).toBe(0);
  });

  it('staff: reassigning from X to Y removes X and adds Y (junction replace)', async () => {
    const { cardId } = await seedCard(A);
    const xId = await makeUser('x');
    const yId = await makeUser('y');
    mockedAuth.mockResolvedValue(staff.session);

    const route = await import('@/app/api/portal/cards/[id]/route');
    await callHandler(route as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(cardId) }, body: { assignedTo: xId } });
    const res = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(cardId) }, body: { assignedTo: yId } },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const assignees = await sql<{ user_id: number }[]>`
      SELECT user_id FROM ${sql(TEST_SCHEMA)}.kanban_card_assignees WHERE card_id = ${cardId}
    `;
    expect(assignees.map(r => r.user_id)).toEqual([yId]);

    // Y was added to watchers; X may still be in watchers (auto-watch never removes)
    const yWatch = await sql<{ user_id: number }[]>`
      SELECT user_id FROM ${sql(TEST_SCHEMA)}.kanban_card_watchers WHERE card_id = ${cardId} AND user_id = ${yId}
    `;
    expect(yWatch.length).toBe(1);
  });

  it('omitting assignedTo from body does not modify junction rows', async () => {
    const { cardId } = await seedCard(A);
    const userId = await makeUser('untouched');
    mockedAuth.mockResolvedValue(staff.session);

    const route = await import('@/app/api/portal/cards/[id]/route');
    // first establish baseline
    await callHandler(route as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(cardId) }, body: { assignedTo: userId } });

    const res = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(cardId) }, body: { title: 'changed-only' } },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const assignees = await sql<{ user_id: number }[]>`
      SELECT user_id FROM ${sql(TEST_SCHEMA)}.kanban_card_assignees WHERE card_id = ${cardId}
    `;
    expect(assignees.map(r => r.user_id)).toEqual([userId]);
  });

  it('empty body is a no-op success (no fields to update)', async () => {
    const { cardId } = await seedCard(A);
    mockedAuth.mockResolvedValue(staff.session);

    const route = await import('@/app/api/portal/cards/[id]/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(cardId) }, body: {} });
    expect(res.status).toBe(200);
  });
});
