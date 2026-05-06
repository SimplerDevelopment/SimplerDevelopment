/**
 * Portal /my-tasks unification — brain tasks aggregated alongside kanban cards.
 *
 * Covers:
 *  - brain task with ownerId=me appears in /api/portal/my-tasks with source='brain'
 *  - brain task linked to a kanban card is deduped (kanban side wins)
 *  - openOnly filter excludes status='done' brain tasks
 *  - groups: deal-linked brain task lands in `brain-deal-<id>` group
 *  - groups: uncategorized brain task lands in `brain-uncategorized`
 *  - tenancy: brain task on another client never bleeds into my response
 *
 * Brain tasks need direct DB writes for the dealId/companyId/linkedKanbanCardId
 * fields (the REST API doesn't expose them). We use `@/lib/db` which loads
 * DATABASE_URL from .env at test start.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestKanbanProject, createTestKanbanCard } from './setup/helpers';
import 'dotenv/config';

interface MyTaskCardShape {
  id: number | string;
  source: 'kanban' | 'brain';
  key: string | null;
  title: string;
  columnName: string | null;
  columnIsDone: boolean;
  linkUrl: string;
}

interface MyTaskGroupShape {
  id: number | string;
  source: 'kanban' | 'brain';
  name: string;
  cards: MyTaskCardShape[];
}

async function getMeId(api: ReturnType<typeof Object> & { get: (p: string) => Promise<{ data: { user?: { id?: string } } | null }> }) {
  const session = await api.get('/api/auth/session');
  return parseInt(session.data?.user?.id ?? '0', 10);
}

/** Insert a brain task directly. Returns the row + a cleanup. */
async function insertBrainTaskDirect(input: {
  clientId: number;
  ownerId: number | null;
  title: string;
  status?: 'open' | 'in_progress' | 'blocked' | 'done';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  dealId?: number | null;
  companyId?: number | null;
  linkedKanbanCardId?: number | null;
}) {
  const { db } = await import('@/lib/db');
  const { brainTasks } = await import('@/lib/db/schema');
  const [row] = await db.insert(brainTasks).values({
    clientId: input.clientId,
    ownerId: input.ownerId,
    title: input.title,
    status: input.status ?? 'open',
    priority: input.priority ?? 'medium',
    dealId: input.dealId ?? null,
    companyId: input.companyId ?? null,
    linkedKanbanCardId: input.linkedKanbanCardId ?? null,
    source: 'manual',
    createdByAi: false,
    needsReview: false,
    complianceFlag: false,
  }).returning();
  const cleanup = async () => {
    const { eq } = await import('drizzle-orm');
    await db.delete(brainTasks).where(eq(brainTasks.id, row.id)).catch(() => {});
  };
  return { row, cleanup };
}

/** Resolve the active client id for the logged-in fixture client. */
async function getActiveClientId(api: { get: (p: string) => Promise<{ data: unknown }> }): Promise<number> {
  const res = await api.get('/api/portal/clients') as { data: { activeClientId: number | null } | null };
  const id = res.data?.activeClientId;
  if (!id) throw new Error('No activeClientId returned for clientApi');
  return id;
}

test.describe('Portal /my-tasks unified inbox @portal @my-tasks @brain', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.afterEach(async () => { await runCleanups(cleanups); cleanups = []; });

  test('brain task assigned to me appears with source=brain and BRAIN- key', async ({ clientApi }) => {
    const meId = await getMeId(clientApi);
    if (!meId) { test.skip(); return; }
    const clientId = await getActiveClientId(clientApi);

    const { row: task, cleanup } = await insertBrainTaskDirect({
      clientId,
      ownerId: meId,
      title: `E2E Brain Task ${Date.now()}`,
      status: 'open',
    });
    cleanups.push(cleanup);

    const res = await clientApi.get('/api/portal/my-tasks?openOnly=1');
    expect(res.status).toBe(200);
    const groups = res.data.data.projects as MyTaskGroupShape[];
    const allCards = groups.flatMap((g) => g.cards.map((c) => ({ ...c, groupId: g.id, groupSource: g.source })));
    const found = allCards.find((c) => c.source === 'brain' && c.id === task.id);
    expect(found).toBeTruthy();
    expect(found!.key).toBe(`BRAIN-${task.id}`);
    expect(found!.columnName).toBe('Open');
    expect(found!.columnIsDone).toBe(false);
    expect(found!.linkUrl).toBe(`/portal/brain/tasks?task=${task.id}`);
  });

  test('brain task linked to a kanban card is deduped (kanban side appears)', async ({ clientApi }) => {
    const meId = await getMeId(clientApi);
    if (!meId) { test.skip(); return; }
    const clientId = await getActiveClientId(clientApi);

    const { columns, cleanup: projCleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(projCleanup);
    const { card, cleanup: cardCleanup } = await createTestKanbanCard(clientApi, columns[0].id, { title: 'Promoted card' });
    cleanups.push(cardCleanup);
    await clientApi.post(`/api/portal/cards/${card.id}/assignees`, { userId: meId });

    const { row: brainTask, cleanup: bCleanup } = await insertBrainTaskDirect({
      clientId,
      ownerId: meId,
      title: 'Already-promoted brain task',
      linkedKanbanCardId: card.id,
    });
    cleanups.push(bCleanup);

    const res = await clientApi.get('/api/portal/my-tasks?openOnly=1');
    const groups = res.data.data.projects as MyTaskGroupShape[];
    const allCards = groups.flatMap((g) => g.cards.map((c) => ({ ...c, groupSource: g.source })));

    // Kanban card should be present
    const kanbanFound = allCards.find((c) => c.source === 'kanban' && c.id === card.id);
    expect(kanbanFound).toBeTruthy();
    // Brain task should NOT be present (deduped)
    const brainFound = allCards.find((c) => c.source === 'brain' && c.id === brainTask.id);
    expect(brainFound).toBeFalsy();
  });

  test('openOnly filter excludes status=done brain tasks', async ({ clientApi }) => {
    const meId = await getMeId(clientApi);
    if (!meId) { test.skip(); return; }
    const clientId = await getActiveClientId(clientApi);

    const { row: openTask, cleanup: c1 } = await insertBrainTaskDirect({
      clientId, ownerId: meId, title: 'Brain open task', status: 'open',
    });
    cleanups.push(c1);
    const { row: doneTask, cleanup: c2 } = await insertBrainTaskDirect({
      clientId, ownerId: meId, title: 'Brain done task', status: 'done',
    });
    cleanups.push(c2);

    const open = await clientApi.get('/api/portal/my-tasks?openOnly=1');
    const openCards = (open.data.data.projects as MyTaskGroupShape[]).flatMap((g) => g.cards);
    const openHas = (id: number) => openCards.some((c) => c.source === 'brain' && c.id === id);
    expect(openHas(openTask.id)).toBe(true);
    expect(openHas(doneTask.id)).toBe(false);

    const all = await clientApi.get('/api/portal/my-tasks?openOnly=0');
    const allCards = (all.data.data.projects as MyTaskGroupShape[]).flatMap((g) => g.cards);
    const allHas = (id: number) => allCards.some((c) => c.source === 'brain' && c.id === id);
    expect(allHas(openTask.id)).toBe(true);
    expect(allHas(doneTask.id)).toBe(true);
  });

  test('brain task linked to a CRM deal lands in a brain-deal group', async ({ clientApi }) => {
    const meId = await getMeId(clientApi);
    if (!meId) { test.skip(); return; }
    const clientId = await getActiveClientId(clientApi);

    // Create a CRM pipeline + deal via the public API
    const ts = Date.now();
    const pipeRes = await clientApi.post('/api/portal/crm/pipelines', { name: `E2E Pipeline ${ts}` });
    expect(pipeRes.data?.success).toBe(true);
    const pipeline = pipeRes.data.data as { id: number; stages: { id: number }[] };
    const stageId = pipeline.stages?.[0]?.id;
    if (!stageId) { test.skip(); return; }

    const dealTitle = `E2E Deal ${ts}`;
    const dealRes = await clientApi.post('/api/portal/crm/deals', {
      title: dealTitle, pipelineId: pipeline.id, stageId, value: 1000, currency: 'USD',
    });
    expect(dealRes.data?.success).toBe(true);
    const deal = dealRes.data.data as { id: number };
    cleanups.push(async () => { await clientApi.delete(`/api/portal/crm/deals/${deal.id}`).catch(() => {}); });

    const { row: brainTask, cleanup: bCleanup } = await insertBrainTaskDirect({
      clientId, ownerId: meId, title: 'Deal-linked brain task', dealId: deal.id,
    });
    cleanups.push(bCleanup);

    const res = await clientApi.get('/api/portal/my-tasks?openOnly=1');
    const groups = res.data.data.projects as MyTaskGroupShape[];
    const dealGroup = groups.find((g) => g.id === `brain-deal-${deal.id}`);
    expect(dealGroup).toBeTruthy();
    expect(dealGroup!.source).toBe('brain');
    expect(dealGroup!.name).toBe(`${dealTitle} · CRM Deal`);
    expect(dealGroup!.cards.some((c) => c.id === brainTask.id)).toBe(true);
  });

  test('uncategorized brain task lands in brain-uncategorized', async ({ clientApi }) => {
    const meId = await getMeId(clientApi);
    if (!meId) { test.skip(); return; }
    const clientId = await getActiveClientId(clientApi);

    const { row: brainTask, cleanup } = await insertBrainTaskDirect({
      clientId, ownerId: meId, title: 'Uncategorized brain task',
    });
    cleanups.push(cleanup);

    const res = await clientApi.get('/api/portal/my-tasks?openOnly=1');
    const groups = res.data.data.projects as MyTaskGroupShape[];
    const uncat = groups.find((g) => g.id === 'brain-uncategorized');
    expect(uncat).toBeTruthy();
    expect(uncat!.source).toBe('brain');
    expect(uncat!.name).toBe('Brain tasks');
    expect(uncat!.cards.some((c) => c.id === brainTask.id)).toBe(true);
  });

  test('tenancy: brain task on another client does not appear in my response', async ({ clientApi }) => {
    const meId = await getMeId(clientApi);
    if (!meId) { test.skip(); return; }

    // Find another client distinct from the active one. If none, skip.
    const myClientId = await getActiveClientId(clientApi);
    const { db } = await import('@/lib/db');
    const { clients } = await import('@/lib/db/schema');
    const { ne } = await import('drizzle-orm');
    const [other] = await db.select({ id: clients.id }).from(clients).where(ne(clients.id, myClientId)).limit(1);
    if (!other?.id) { test.skip(); return; }

    const { row: foreignTask, cleanup } = await insertBrainTaskDirect({
      clientId: other.id, ownerId: meId, title: 'Foreign-tenant brain task',
    });
    cleanups.push(cleanup);

    const res = await clientApi.get('/api/portal/my-tasks?openOnly=0');
    const groups = res.data.data.projects as MyTaskGroupShape[];
    const allCards = groups.flatMap((g) => g.cards);
    const leaked = allCards.find((c) => c.source === 'brain' && c.id === foreignTask.id);
    expect(leaked).toBeFalsy();
  });
});
