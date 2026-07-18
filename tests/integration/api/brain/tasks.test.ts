/**
 * Brain tasks — POST/PUT/DELETE on /tasks + /tasks/[id], POST on
 * /tasks/[id]/promote-to-kanban.
 *
 * Contract:
 *   - 401 unauth, 404 cross-tenant
 *   - POST: title required (400 otherwise)
 *   - PUT: returns updated row, 404 when missing
 *   - DELETE: 404 on missing, cross-tenant safe
 *   - promote-to-kanban: kanban_card row created in caller's project; cross-
 *     tenant projectId or taskId must be rejected.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function seedTask(ctx: TenantCtx, overrides: { title?: string } = {}): Promise<{ id: number }> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.brain_tasks (client_id, title, status, priority, source, created_by_ai, needs_review, compliance_flag)
    VALUES (
      ${ctx.client.id},
      ${overrides.title ?? `task-${Date.now()}`},
      'open',
      'medium',
      'manual',
      false,
      false,
      false
    )
    RETURNING id
  `;
  return row;
}

async function seedKanbanProject(ctx: TenantCtx): Promise<{ projectId: number; columnId: number }> {
  const sql = getTestSql();
  const [project] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.projects (name, client_id, status, created_by)
    VALUES (${`pj-${Date.now()}`}, ${ctx.client.id}, 'active', ${ctx.user.id})
    RETURNING id
  `;
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.project_members (project_id, user_id, role)
    VALUES (${project.id}, ${ctx.user.id}, 'owner')
  `;
  const [column] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.kanban_columns (project_id, name, "order", is_done)
    VALUES (${project.id}, 'Todo', 0, false)
    RETURNING id
  `;
  return { projectId: project.id, columnId: column.id };
}

describe('Brain tasks — POST /tasks @brain @tasks', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-tasks-create'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/brain/tasks/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { title: 'x' } },
    );
    expect(res.status).toBe(401);
  });

  it('400 on missing title', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/tasks/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { description: 'no title' } },
    );
    expect(res.status).toBe(400);
  });

  it('creates a task scoped to the caller tenant', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/tasks/route');
    const res = await callHandler<{ success: boolean; data: { id: number; title: string } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { title: 'Ship it', priority: 'high' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.title).toBe('Ship it');

    const sql = getTestSql();
    const [row] = await sql<{ client_id: number; priority: string }[]>`
      SELECT client_id, priority FROM ${sql(TEST_SCHEMA)}.brain_tasks WHERE id = ${res.data!.data.id}
    `;
    expect(row.client_id).toBe(A.client.id);
    expect(row.priority).toBe('high');
  });
});

describe('Brain tasks — PUT /tasks/[id] @brain @tasks', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-tasks-put'); });

  it('updates own task', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const t = await seedTask(A, { title: 'before' });

    const route = await import('@/app/api/portal/brain/tasks/[id]/route');
    const res = await callHandler<{ success: boolean; data: { title: string; status: string } }>(
      route as unknown as Record<string, unknown>,
      'PUT',
      { params: { id: String(t.id) }, body: { title: 'after', status: 'in_progress' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.title).toBe('after');
    expect(res.data?.data.status).toBe('in_progress');
  });

  it('400 on bogus id', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/tasks/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'PUT',
      { params: { id: 'abc' }, body: { title: 'x' } },
    );
    expect(res.status).toBe(400);
  });

  it('404 cross-tenant', async () => {
    const B = await sessionForNewClientUser('brain-tasks-put-b');
    const taskB = await seedTask(B, { title: 'foreign' });
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/brain/tasks/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'PUT',
      { params: { id: String(taskB.id) }, body: { title: 'hijack' } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const [row] = await sql<{ title: string }[]>`
      SELECT title FROM ${sql(TEST_SCHEMA)}.brain_tasks WHERE id = ${taskB.id}
    `;
    expect(row.title).toBe('foreign');
  });
});

describe('Brain tasks — DELETE /tasks/[id] @brain @tasks', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-tasks-del'); });

  it('deletes own task', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const t = await seedTask(A);
    const route = await import('@/app/api/portal/brain/tasks/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(t.id) } },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.brain_tasks WHERE id = ${t.id}
    `;
    expect(rows.length).toBe(0);
  });

  it('404 on missing id', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/tasks/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: '999999' } },
    );
    expect(res.status).toBe(404);
  });

  it('404 cross-tenant', async () => {
    const B = await sessionForNewClientUser('brain-tasks-del-b');
    const taskB = await seedTask(B);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/brain/tasks/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(taskB.id) } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.brain_tasks WHERE id = ${taskB.id}
    `;
    expect(rows.length).toBe(1);
  });
});

describe('Brain tasks — POST /tasks/[id]/promote-to-kanban @brain @tasks', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-tasks-promote'); });

  it('400 when projectId missing', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const t = await seedTask(A);
    const route = await import('@/app/api/portal/brain/tasks/[id]/promote-to-kanban/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(t.id) }, body: {} },
    );
    expect(res.status).toBe(400);
  });

  it('creates kanban_card with the caller tenant association', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const t = await seedTask(A, { title: 'promote-me' });
    const { projectId, columnId } = await seedKanbanProject(A);

    const route = await import('@/app/api/portal/brain/tasks/[id]/promote-to-kanban/route');
    const res = await callHandler<{ success: boolean; data: { cardId: number; projectId: number; columnId: number } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(t.id) }, body: { projectId, columnId } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);

    // Assert kanban_card row exists in the caller's project
    const sql = getTestSql();
    const [card] = await sql<{ id: number; project_id: number; column_id: number }[]>`
      SELECT id, project_id, column_id FROM ${sql(TEST_SCHEMA)}.kanban_cards
      WHERE id = ${res.data!.data.cardId}
    `;
    expect(card.project_id).toBe(projectId);
    expect(card.column_id).toBe(columnId);

    // The card's project must belong to A's client_id (the tenant association)
    const [proj] = await sql<{ client_id: number }[]>`
      SELECT client_id FROM ${sql(TEST_SCHEMA)}.projects WHERE id = ${card.project_id}
    `;
    expect(proj.client_id).toBe(A.client.id);

    // brain_task should now link to the card
    const [task] = await sql<{ linked_kanban_card_id: number | null }[]>`
      SELECT linked_kanban_card_id FROM ${sql(TEST_SCHEMA)}.brain_tasks WHERE id = ${t.id}
    `;
    expect(task.linked_kanban_card_id).toBe(card.id);
  });

  it('400 cross-tenant projectId — promotion library throws', async () => {
    const B = await sessionForNewClientUser('brain-tasks-promote-b');
    const taskA = await seedTask(A);
    const { projectId: projectB } = await seedKanbanProject(B);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/brain/tasks/[id]/promote-to-kanban/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(taskA.id) }, body: { projectId: projectB } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/project/i);

    // No kanban card should have been created in B's project
    const sql = getTestSql();
    const cards = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.kanban_cards WHERE project_id = ${projectB}
    `;
    expect(cards.length).toBe(0);
  });

  it('400 cross-tenant taskId — task lookup fails', async () => {
    const B = await sessionForNewClientUser('brain-tasks-promote-b2');
    const taskB = await seedTask(B);
    const { projectId } = await seedKanbanProject(A);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/brain/tasks/[id]/promote-to-kanban/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(taskB.id) }, body: { projectId } },
    );
    expect(res.status).toBe(400);
  });
});
