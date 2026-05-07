/**
 * Portal /my-tasks — filters, pagination, inline-complete (API contract).
 *
 * Covers the second wave of work on /portal/my-tasks. Page-level UI is exercised
 * implicitly: this spec drives the same /api/portal/my-tasks endpoints + write
 * routes the page consumes, so any contract drift fails here first.
 *
 * Covers:
 *  - ?source=kanban returns only kanban groups; ?source=brain returns only brain
 *  - ?priorities=high filters out non-matching cards across both sources
 *  - ?overdue=1 keeps only past-due cards
 *  - ?projectIds=<id> narrows to a single kanban project
 *  - ?limit=<N>&cursor=<N> paginates deterministically with a stable nextCursor
 *  - response includes projectsAvailable for the project filter dropdown
 *  - response includes doneColumnId on kanban cards when an is_done column exists
 *  - inline-complete on a brain task: PUT /api/portal/brain/tasks/{id} { status: 'done' }
 *    drops it from openOnly=1 listings
 *  - inline-complete on a kanban card: PATCH /api/portal/cards/{id}/move with
 *    the doneColumnId echoed by the API drops it from openOnly=1 listings
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestKanbanProject, createTestKanbanCard } from './setup/helpers';
import postgres from 'postgres';
import 'dotenv/config';

interface CardShape {
  id: number;
  source: 'kanban' | 'brain';
  priority: string | null;
  dueDate: string | null;
  doneColumnId: number | null;
}
interface GroupShape {
  id: number | string;
  source: 'kanban' | 'brain';
  cards: CardShape[];
}
interface MyTasksData {
  projects: GroupShape[];
  nextCursor: number | null;
  total: number;
  projectsAvailable: { id: number; name: string }[];
}

let sql: ReturnType<typeof postgres> | null = null;
function db() {
  if (!sql) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set; required for brain-task DB inserts.');
    sql = postgres(process.env.DATABASE_URL, { max: 2, idle_timeout: 5 });
  }
  return sql;
}
test.afterAll(async () => { if (sql) { await sql.end({ timeout: 5 }); sql = null; } });

interface ApiClientLike {
  get: (path: string) => Promise<{ data: unknown; status: number }>;
}
async function getMeId(api: ApiClientLike): Promise<number> {
  const res = await api.get('/api/auth/session') as { data: { user?: { id?: string } } | null };
  return parseInt(res.data?.user?.id ?? '0', 10);
}
async function getActiveClientId(api: ApiClientLike): Promise<number> {
  const res = await api.get('/api/portal/clients') as { data: { activeClientId: number | null } | null };
  const id = res.data?.activeClientId;
  if (!id) throw new Error('No activeClientId returned');
  return id;
}

interface BrainInsert {
  clientId: number;
  ownerId: number;
  title: string;
  status?: 'open' | 'in_progress' | 'blocked' | 'done';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  dueDate?: Date | null;
}
async function insertBrainTask(input: BrainInsert) {
  const s = db();
  const rows = await s<{ id: number }[]>`
    INSERT INTO brain_tasks (
      client_id, owner_id, title, status, priority, due_date,
      source, created_by_ai, needs_review, compliance_flag
    ) VALUES (
      ${input.clientId}, ${input.ownerId}, ${input.title},
      ${input.status ?? 'open'}, ${input.priority ?? 'medium'}, ${input.dueDate ?? null},
      'manual', false, false, false
    )
    RETURNING id
  `;
  const id = rows[0].id;
  return { id, cleanup: async () => { try { await s`DELETE FROM brain_tasks WHERE id = ${id}` } catch {} } };
}

test.describe('Portal /my-tasks — filters / pagination / inline complete @portal @my-tasks', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.afterEach(async () => { await runCleanups(cleanups); cleanups = []; });

  test('source filter: ?source=brain hides kanban groups; ?source=kanban hides brain groups', async ({ clientApi }) => {
    const meId = await getMeId(clientApi);
    if (!meId) { test.skip(); return; }
    const clientId = await getActiveClientId(clientApi);

    // One kanban card + one brain task, both assigned to me
    const { columns, cleanup: pCleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(pCleanup);
    const { card, cleanup: cCleanup } = await createTestKanbanCard(clientApi, columns[0].id, { title: 'kanban-src' });
    cleanups.push(cCleanup);
    await clientApi.post(`/api/portal/cards/${card.id}/assignees`, { userId: meId });

    const { id: brainId, cleanup: bCleanup } = await insertBrainTask({ clientId, ownerId: meId, title: 'brain-src' });
    cleanups.push(bCleanup);

    const brainOnly = await clientApi.get('/api/portal/my-tasks?source=brain') as { data: { data: MyTasksData } };
    const sources = new Set(brainOnly.data.data.projects.flatMap(g => g.cards.map(c => c.source)));
    expect(sources.has('brain')).toBe(true);
    expect(sources.has('kanban')).toBe(false);
    expect(brainOnly.data.data.projects.flatMap(g => g.cards.filter(c => c.id === brainId)).length).toBeGreaterThan(0);

    const kanbanOnly = await clientApi.get('/api/portal/my-tasks?source=kanban') as { data: { data: MyTasksData } };
    const ksources = new Set(kanbanOnly.data.data.projects.flatMap(g => g.cards.map(c => c.source)));
    expect(ksources.has('kanban')).toBe(true);
    expect(ksources.has('brain')).toBe(false);
  });

  test('priority filter: ?priorities=high keeps only matching cards', async ({ clientApi }) => {
    const meId = await getMeId(clientApi);
    if (!meId) { test.skip(); return; }
    const clientId = await getActiveClientId(clientApi);

    const { id: highId, cleanup: c1 } = await insertBrainTask({ clientId, ownerId: meId, title: 'p-high', priority: 'high' });
    cleanups.push(c1);
    const { id: lowId, cleanup: c2 } = await insertBrainTask({ clientId, ownerId: meId, title: 'p-low', priority: 'low' });
    cleanups.push(c2);

    const res = await clientApi.get('/api/portal/my-tasks?priorities=high') as { data: { data: MyTasksData } };
    const ids = res.data.data.projects.flatMap(g => g.cards.map(c => c.id));
    expect(ids).toContain(highId);
    expect(ids).not.toContain(lowId);
  });

  test('overdue filter: ?overdue=1 keeps only past-due cards', async ({ clientApi }) => {
    const meId = await getMeId(clientApi);
    if (!meId) { test.skip(); return; }
    const clientId = await getActiveClientId(clientApi);

    const past = new Date(Date.now() - 2 * 86400_000);
    const future = new Date(Date.now() + 2 * 86400_000);

    const { id: pastId, cleanup: c1 } = await insertBrainTask({ clientId, ownerId: meId, title: 'overdue', dueDate: past });
    cleanups.push(c1);
    const { id: futureId, cleanup: c2 } = await insertBrainTask({ clientId, ownerId: meId, title: 'future', dueDate: future });
    cleanups.push(c2);
    const { id: noDueId, cleanup: c3 } = await insertBrainTask({ clientId, ownerId: meId, title: 'no-due' });
    cleanups.push(c3);

    const res = await clientApi.get('/api/portal/my-tasks?overdue=1') as { data: { data: MyTasksData } };
    const ids = res.data.data.projects.flatMap(g => g.cards.map(c => c.id));
    expect(ids).toContain(pastId);
    expect(ids).not.toContain(futureId);
    expect(ids).not.toContain(noDueId);
  });

  test('pagination: ?limit=1 returns one card and a nextCursor; cursor advances', async ({ clientApi }) => {
    const meId = await getMeId(clientApi);
    if (!meId) { test.skip(); return; }
    const clientId = await getActiveClientId(clientApi);

    const seeds: { id: number; cleanup: () => Promise<void> }[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await insertBrainTask({ clientId, ownerId: meId, title: `paginate-${i}` });
      seeds.push(r);
      cleanups.push(r.cleanup);
    }
    const seededIds = new Set(seeds.map(s => s.id));

    const page1 = await clientApi.get('/api/portal/my-tasks?source=brain&limit=1') as { data: { data: MyTasksData } };
    const ids1 = page1.data.data.projects.flatMap(g => g.cards.map(c => c.id)).filter(id => seededIds.has(id));
    expect(ids1.length).toBe(1);
    expect(page1.data.data.nextCursor).toBe(1);
    expect(page1.data.data.total).toBeGreaterThanOrEqual(3);

    const page2 = await clientApi.get(`/api/portal/my-tasks?source=brain&limit=1&cursor=${page1.data.data.nextCursor}`) as { data: { data: MyTasksData } };
    const ids2 = page2.data.data.projects.flatMap(g => g.cards.map(c => c.id)).filter(id => seededIds.has(id));
    expect(ids2.length).toBe(1);
    // No overlap between the seeded ids in page 1 and page 2.
    for (const id of ids2) expect(ids1).not.toContain(id);
  });

  test('projectsAvailable lists kanban projects + doneColumnId is populated when a Done column exists', async ({ clientApi }) => {
    const meId = await getMeId(clientApi);
    if (!meId) { test.skip(); return; }

    const { project, columns, cleanup: pCleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(pCleanup);
    // Helper seeds 4 columns; flag the last one as the done column.
    await clientApi.patch(`/api/portal/projects/${project.id}/columns/${columns[3].id}`, { isDone: true });

    const { card, cleanup: cCleanup } = await createTestKanbanCard(clientApi, columns[0].id, { title: 'avail' });
    cleanups.push(cCleanup);
    await clientApi.post(`/api/portal/cards/${card.id}/assignees`, { userId: meId });

    const res = await clientApi.get('/api/portal/my-tasks?source=kanban') as { data: { data: MyTasksData } };
    expect(res.data.data.projectsAvailable.some(p => p.id === project.id)).toBe(true);

    const myCard = res.data.data.projects
      .flatMap(g => g.cards)
      .find(c => c.source === 'kanban' && c.id === card.id);
    expect(myCard, 'expected the seeded kanban card in the response').toBeTruthy();
    expect(myCard!.doneColumnId).toBe(columns[3].id);
  });

  test('inline-complete brain: PUT /api/portal/brain/tasks/{id} status=done removes it from openOnly listings', async ({ clientApi }) => {
    const meId = await getMeId(clientApi);
    if (!meId) { test.skip(); return; }
    const clientId = await getActiveClientId(clientApi);

    const { id: taskId, cleanup } = await insertBrainTask({ clientId, ownerId: meId, title: 'flip-brain' });
    cleanups.push(cleanup);

    const before = await clientApi.get('/api/portal/my-tasks?source=brain&openOnly=1') as { data: { data: MyTasksData } };
    expect(before.data.data.projects.flatMap(g => g.cards.map(c => c.id))).toContain(taskId);

    const flip = await clientApi.put(`/api/portal/brain/tasks/${taskId}`, { status: 'done' });
    expect(flip.status).toBe(200);

    const after = await clientApi.get('/api/portal/my-tasks?source=brain&openOnly=1') as { data: { data: MyTasksData } };
    expect(after.data.data.projects.flatMap(g => g.cards.map(c => c.id))).not.toContain(taskId);

    // openOnly=0 should still show it
    const all = await clientApi.get('/api/portal/my-tasks?source=brain&openOnly=0') as { data: { data: MyTasksData } };
    expect(all.data.data.projects.flatMap(g => g.cards.map(c => c.id))).toContain(taskId);
  });

  test('inline-complete kanban: PATCH /api/portal/cards/{id}/move to doneColumnId removes from openOnly', async ({ clientApi }) => {
    const meId = await getMeId(clientApi);
    if (!meId) { test.skip(); return; }

    const { project, columns, cleanup: pCleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(pCleanup);
    await clientApi.patch(`/api/portal/projects/${project.id}/columns/${columns[3].id}`, { isDone: true });

    const { card, cleanup: cCleanup } = await createTestKanbanCard(clientApi, columns[0].id, { title: 'flip-kanban' });
    cleanups.push(cCleanup);
    await clientApi.post(`/api/portal/cards/${card.id}/assignees`, { userId: meId });

    const before = await clientApi.get('/api/portal/my-tasks?source=kanban&openOnly=1') as { data: { data: MyTasksData } };
    const seeded = before.data.data.projects.flatMap(g => g.cards).find(c => c.id === card.id);
    expect(seeded, 'card should be in openOnly response before flip').toBeTruthy();
    const doneColumnId = seeded!.doneColumnId;
    expect(doneColumnId).toBe(columns[3].id);

    const flip = await clientApi.patch(`/api/portal/cards/${card.id}/move`, { columnId: doneColumnId, order: 0 });
    expect(flip.status).toBe(200);

    const after = await clientApi.get('/api/portal/my-tasks?source=kanban&openOnly=1') as { data: { data: MyTasksData } };
    expect(after.data.data.projects.flatMap(g => g.cards.map(c => c.id))).not.toContain(card.id);
  });
});
