/**
 * GET /api/portal/my-tasks
 *
 * Aggregation contract:
 *   - 401 unauth
 *   - empty list when caller has no assignments
 *   - returns only cards where caller is in kanban_card_assignees
 *   - openOnly=1 (default) filters out cards in columns where isDone=true
 *   - openOnly=0 returns done cards too
 *   - clients are scoped by their tenant projects (cards on other tenants' projects are hidden)
 *   - staff bypass tenant scope and see any assigned card
 *   - response groups cards by project + sorts cards by due date (nulls last)
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

interface SeedOpts {
  client: TenantCtx;
  isDone?: boolean;
  title?: string;
  dueDate?: string | null;
  projectKey?: string | null;
  number?: number | null;
}
async function seedAssignedCard(opts: SeedOpts, assigneeId: number): Promise<{ cardId: number; projectId: number }> {
  const sql = getTestSql();
  const ts = Date.now();
  const rand = Math.floor(Math.random() * 1e9);
  const [proj] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.projects
      (name, project_key, client_id, status, created_by)
    VALUES
      (${`Proj-${ts}-${rand}`}, ${opts.projectKey ?? null},
       ${opts.client.client.id}, 'active', ${opts.client.user.id})
    RETURNING id
  `;
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.project_members (project_id, user_id, role)
    VALUES (${proj.id}, ${opts.client.user.id}, 'owner')
  `;
  const [col] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.kanban_columns (project_id, name, "order", is_done)
    VALUES (${proj.id}, 'C', 0, ${opts.isDone ?? false}) RETURNING id
  `;
  const [card] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.kanban_cards
      (column_id, project_id, title, "order", number, due_date)
    VALUES
      (${col.id}, ${proj.id}, ${opts.title ?? 'task'}, 0,
       ${opts.number ?? null},
       ${opts.dueDate ? new Date(opts.dueDate) : null})
    RETURNING id
  `;
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.kanban_card_assignees (card_id, user_id)
    VALUES (${card.id}, ${assigneeId})
  `;
  return { cardId: card.id, projectId: proj.id };
}

describe('GET /api/portal/my-tasks @my-tasks', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  let staff: TenantCtx;
  beforeEach(async () => {
    [{ A, B }, staff] = await Promise.all([twoTenants(), sessionForStaff('agency-tasks')]);
  });

  it('401 unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/my-tasks/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET', {});
    expect(res.status).toBe(401);
  });

  it('returns empty when caller has no assignments', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/my-tasks/route');
    const res = await callHandler<{ data: { projects: unknown[] } }>(
      route as unknown as Record<string, unknown>, 'GET', {},
    );
    expect(res.status).toBe(200);
    expect(res.data?.data?.projects).toEqual([]);
  });

  it("returns only cards assigned to the caller (other users' assignments hidden)", async () => {
    const mine = await seedAssignedCard({ client: A, title: 'mine' }, A.user.id);
    // Card in same tenant but assigned to a *different* user
    await seedAssignedCard({ client: A, title: 'theirs' }, B.user.id);

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/my-tasks/route');
    const res = await callHandler<{
      data: { projects: Array<{ cards: Array<{ id: number; title: string }> }> };
    }>(route as unknown as Record<string, unknown>, 'GET', {});
    expect(res.status).toBe(200);

    const titles = res.data?.data?.projects.flatMap(p => p.cards.map(c => c.title)) ?? [];
    expect(titles).toContain('mine');
    expect(titles).not.toContain('theirs');

    const ids = res.data?.data?.projects.flatMap(p => p.cards.map(c => c.id)) ?? [];
    expect(ids).toContain(mine.cardId);
  });

  it("client cannot see assignments on a different tenant's project", async () => {
    // Cross-tenant: A's user is somehow assigned to a card on B's project.
    // The route's join (projects.client_id = caller's clientId) must filter it out.
    const sql = getTestSql();
    const [proj] = await sql<{ id: number }[]>`
      INSERT INTO ${sql(TEST_SCHEMA)}.projects (name, client_id, status, created_by)
      VALUES (${`Cross-${Date.now()}`}, ${B.client.id}, 'active', ${B.user.id})
      RETURNING id
    `;
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.project_members (project_id, user_id, role)
      VALUES (${proj.id}, ${B.user.id}, 'owner')
    `;
    const [col] = await sql<{ id: number }[]>`
      INSERT INTO ${sql(TEST_SCHEMA)}.kanban_columns (project_id, name, "order", is_done)
      VALUES (${proj.id}, 'C', 0, false) RETURNING id
    `;
    const [card] = await sql<{ id: number }[]>`
      INSERT INTO ${sql(TEST_SCHEMA)}.kanban_cards (column_id, project_id, title, "order")
      VALUES (${col.id}, ${proj.id}, 'cross-tenant', 0) RETURNING id
    `;
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.kanban_card_assignees (card_id, user_id)
      VALUES (${card.id}, ${A.user.id})
    `;

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/my-tasks/route');
    const res = await callHandler<{ data: { projects: Array<{ cards: Array<{ id: number }> }> } }>(
      route as unknown as Record<string, unknown>, 'GET', {},
    );
    expect(res.status).toBe(200);
    const ids = res.data?.data?.projects.flatMap(p => p.cards.map(c => c.id)) ?? [];
    expect(ids).not.toContain(card.id);
  });

  it('openOnly=1 (default) hides cards in done columns; openOnly=0 includes them', async () => {
    const open = await seedAssignedCard({ client: A, title: 'open-task', isDone: false }, A.user.id);
    const done = await seedAssignedCard({ client: A, title: 'done-task', isDone: true }, A.user.id);

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/my-tasks/route');

    const r1 = await callHandler<{ data: { projects: Array<{ cards: Array<{ id: number }> }> } }>(
      route as unknown as Record<string, unknown>, 'GET', {},
    );
    const ids1 = r1.data?.data?.projects.flatMap(p => p.cards.map(c => c.id)) ?? [];
    expect(ids1).toContain(open.cardId);
    expect(ids1).not.toContain(done.cardId);

    const r2 = await callHandler<{ data: { projects: Array<{ cards: Array<{ id: number }> }> } }>(
      route as unknown as Record<string, unknown>, 'GET', { query: { openOnly: '0' } },
    );
    const ids2 = r2.data?.data?.projects.flatMap(p => p.cards.map(c => c.id)) ?? [];
    expect(ids2).toContain(open.cardId);
    expect(ids2).toContain(done.cardId);
  });

  it("staff bypass: see any assigned card regardless of project clientId", async () => {
    // Staff user assigned to a card on B's tenant project
    const sql = getTestSql();
    const [proj] = await sql<{ id: number }[]>`
      INSERT INTO ${sql(TEST_SCHEMA)}.projects (name, client_id, status, created_by)
      VALUES (${`StaffSeen-${Date.now()}`}, ${B.client.id}, 'active', ${B.user.id})
      RETURNING id
    `;
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.project_members (project_id, user_id, role)
      VALUES (${proj.id}, ${B.user.id}, 'owner')
    `;
    const [col] = await sql<{ id: number }[]>`
      INSERT INTO ${sql(TEST_SCHEMA)}.kanban_columns (project_id, name, "order", is_done)
      VALUES (${proj.id}, 'C', 0, false) RETURNING id
    `;
    const [card] = await sql<{ id: number }[]>`
      INSERT INTO ${sql(TEST_SCHEMA)}.kanban_cards (column_id, project_id, title, "order")
      VALUES (${col.id}, ${proj.id}, 'staff-visible', 0) RETURNING id
    `;
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.kanban_card_assignees (card_id, user_id)
      VALUES (${card.id}, ${staff.user.id})
    `;

    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/portal/my-tasks/route');
    const res = await callHandler<{ data: { projects: Array<{ cards: Array<{ id: number; title: string }> }> } }>(
      route as unknown as Record<string, unknown>, 'GET', {},
    );
    expect(res.status).toBe(200);
    const titles = res.data?.data?.projects.flatMap(p => p.cards.map(c => c.title)) ?? [];
    expect(titles).toContain('staff-visible');
  });

  it('cards within a project are sorted by dueDate (nulls last)', async () => {
    // Build three cards on the same project with mixed due dates
    const sql = getTestSql();
    const [proj] = await sql<{ id: number }[]>`
      INSERT INTO ${sql(TEST_SCHEMA)}.projects (name, project_key, client_id, status, created_by)
      VALUES (${`Sort-${Date.now()}`}, 'SRT', ${A.client.id}, 'active', ${A.user.id})
      RETURNING id
    `;
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.project_members (project_id, user_id, role)
      VALUES (${proj.id}, ${A.user.id}, 'owner')
    `;
    const [col] = await sql<{ id: number }[]>`
      INSERT INTO ${sql(TEST_SCHEMA)}.kanban_columns (project_id, name, "order", is_done)
      VALUES (${proj.id}, 'C', 0, false) RETURNING id
    `;
    async function insertCard(title: string, due: Date | null, num: number) {
      const [c] = await sql<{ id: number }[]>`
        INSERT INTO ${sql(TEST_SCHEMA)}.kanban_cards (column_id, project_id, title, "order", number, due_date)
        VALUES (${col.id}, ${proj.id}, ${title}, ${num}, ${num}, ${due ?? null})
        RETURNING id
      `;
      await sql`
        INSERT INTO ${sql(TEST_SCHEMA)}.kanban_card_assignees (card_id, user_id)
        VALUES (${c.id}, ${A.user.id})
      `;
      return c.id;
    }
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
    const nextWeek = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    await insertCard('no-due', null, 3);
    await insertCard('next-week', nextWeek, 2);
    await insertCard('tomorrow', tomorrow, 1);

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/my-tasks/route');
    const res = await callHandler<{
      data: { projects: Array<{ id: number; cards: Array<{ title: string }> }> };
    }>(route as unknown as Record<string, unknown>, 'GET', {});
    expect(res.status).toBe(200);
    const projectGroup = res.data?.data?.projects.find(p => p.id === proj.id);
    expect(projectGroup).toBeDefined();
    expect(projectGroup!.cards.map(c => c.title)).toEqual(['tomorrow', 'next-week', 'no-due']);
  });
});
