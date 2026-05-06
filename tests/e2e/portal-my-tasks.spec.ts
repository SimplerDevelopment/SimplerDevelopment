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
 * fields (the REST API doesn't expose them). We use the postgres.js driver
 * directly here — Playwright doesn't load Next.js's `@/` path alias, so we
 * cannot just `import('@/lib/db')` from a spec.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestKanbanProject, createTestKanbanCard } from './setup/helpers';
import postgres from 'postgres';
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

let sql: ReturnType<typeof postgres> | null = null;
function db() {
  if (!sql) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set; required for brain-task DB inserts.');
    sql = postgres(process.env.DATABASE_URL, { max: 2, idle_timeout: 5 });
  }
  return sql;
}

test.afterAll(async () => {
  if (sql) {
    await sql.end({ timeout: 5 });
    sql = null;
  }
});

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
  if (!id) throw new Error('No activeClientId returned for clientApi');
  return id;
}

interface BrainTaskInsert {
  clientId: number;
  ownerId: number | null;
  title: string;
  status?: 'open' | 'in_progress' | 'blocked' | 'done';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  dealId?: number | null;
  companyId?: number | null;
  linkedKanbanCardId?: number | null;
}

async function insertBrainTaskDirect(input: BrainTaskInsert) {
  const s = db();
  const rows = await s<{ id: number }[]>`
    INSERT INTO brain_tasks (
      client_id, owner_id, title, status, priority, deal_id, company_id, linked_kanban_card_id, source, created_by_ai, needs_review, compliance_flag
    ) VALUES (
      ${input.clientId}, ${input.ownerId}, ${input.title}, ${input.status ?? 'open'}, ${input.priority ?? 'medium'},
      ${input.dealId ?? null}, ${input.companyId ?? null}, ${input.linkedKanbanCardId ?? null},
      'manual', false, false, false
    )
    RETURNING id
  `;
  const id = rows[0].id;
  const cleanup = async () => {
    try { await s`DELETE FROM brain_tasks WHERE id = ${id}` } catch {}
  };
  return { id, cleanup };
}

test.describe('Portal /my-tasks unified inbox @portal @my-tasks @brain', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.afterEach(async () => { await runCleanups(cleanups); cleanups = []; });

  test('brain task assigned to me appears with source=brain and BRAIN- key', async ({ clientApi }) => {
    const meId = await getMeId(clientApi);
    if (!meId) { test.skip(); return; }
    const clientId = await getActiveClientId(clientApi);

    const { id: taskId, cleanup } = await insertBrainTaskDirect({
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
    const found = allCards.find((c) => c.source === 'brain' && c.id === taskId);
    expect(found, 'expected brain task to appear in /my-tasks response').toBeTruthy();
    expect(found!.key).toBe(`BRAIN-${taskId}`);
    expect(found!.columnName).toBe('Open');
    expect(found!.columnIsDone).toBe(false);
    expect(found!.linkUrl).toBe(`/portal/brain/tasks?task=${taskId}`);
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

    const { id: brainTaskId, cleanup: bCleanup } = await insertBrainTaskDirect({
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
    expect(kanbanFound, 'expected kanban card to appear').toBeTruthy();
    // Brain task should NOT be present (deduped)
    const brainFound = allCards.find((c) => c.source === 'brain' && c.id === brainTaskId);
    expect(brainFound, 'brain task with linkedKanbanCardId should be deduped from response').toBeFalsy();
  });

  test('openOnly filter excludes status=done brain tasks', async ({ clientApi }) => {
    const meId = await getMeId(clientApi);
    if (!meId) { test.skip(); return; }
    const clientId = await getActiveClientId(clientApi);

    const { id: openId, cleanup: c1 } = await insertBrainTaskDirect({
      clientId, ownerId: meId, title: 'Brain open task', status: 'open',
    });
    cleanups.push(c1);
    const { id: doneId, cleanup: c2 } = await insertBrainTaskDirect({
      clientId, ownerId: meId, title: 'Brain done task', status: 'done',
    });
    cleanups.push(c2);

    const open = await clientApi.get('/api/portal/my-tasks?openOnly=1');
    const openCards = (open.data.data.projects as MyTaskGroupShape[]).flatMap((g) => g.cards);
    const openHas = (id: number) => openCards.some((c) => c.source === 'brain' && c.id === id);
    expect(openHas(openId)).toBe(true);
    expect(openHas(doneId)).toBe(false);

    const all = await clientApi.get('/api/portal/my-tasks?openOnly=0');
    const allCards = (all.data.data.projects as MyTaskGroupShape[]).flatMap((g) => g.cards);
    const allHas = (id: number) => allCards.some((c) => c.source === 'brain' && c.id === id);
    expect(allHas(openId)).toBe(true);
    expect(allHas(doneId)).toBe(true);
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

    const { id: brainTaskId, cleanup: bCleanup } = await insertBrainTaskDirect({
      clientId, ownerId: meId, title: 'Deal-linked brain task', dealId: deal.id,
    });
    cleanups.push(bCleanup);

    const res = await clientApi.get('/api/portal/my-tasks?openOnly=1');
    const groups = res.data.data.projects as MyTaskGroupShape[];
    const dealGroup = groups.find((g) => g.id === `brain-deal-${deal.id}`);
    expect(dealGroup, `expected group brain-deal-${deal.id}`).toBeTruthy();
    expect(dealGroup!.source).toBe('brain');
    expect(dealGroup!.name).toBe(`${dealTitle} · CRM Deal`);
    expect(dealGroup!.cards.some((c) => c.id === brainTaskId)).toBe(true);
  });

  test('uncategorized brain task lands in brain-uncategorized', async ({ clientApi }) => {
    const meId = await getMeId(clientApi);
    if (!meId) { test.skip(); return; }
    const clientId = await getActiveClientId(clientApi);

    const { id: brainTaskId, cleanup } = await insertBrainTaskDirect({
      clientId, ownerId: meId, title: 'Uncategorized brain task',
    });
    cleanups.push(cleanup);

    const res = await clientApi.get('/api/portal/my-tasks?openOnly=1');
    const groups = res.data.data.projects as MyTaskGroupShape[];
    const uncat = groups.find((g) => g.id === 'brain-uncategorized');
    expect(uncat, 'expected brain-uncategorized group').toBeTruthy();
    expect(uncat!.source).toBe('brain');
    expect(uncat!.name).toBe('Brain tasks');
    expect(uncat!.cards.some((c) => c.id === brainTaskId)).toBe(true);
  });

  test('tenancy: brain task on another client does not appear in my response', async ({ clientApi }) => {
    const meId = await getMeId(clientApi);
    if (!meId) { test.skip(); return; }

    const myClientId = await getActiveClientId(clientApi);
    const s = db();
    const others = await s<{ id: number }[]>`SELECT id FROM clients WHERE id <> ${myClientId} LIMIT 1`;
    if (others.length === 0) { test.skip(); return; }
    const otherClientId = others[0].id;

    const { id: foreignId, cleanup } = await insertBrainTaskDirect({
      clientId: otherClientId, ownerId: meId, title: 'Foreign-tenant brain task',
    });
    cleanups.push(cleanup);

    const res = await clientApi.get('/api/portal/my-tasks?openOnly=0');
    const groups = res.data.data.projects as MyTaskGroupShape[];
    const allCards = groups.flatMap((g) => g.cards);
    const leaked = allCards.find((c) => c.source === 'brain' && c.id === foreignId);
    expect(leaked, 'foreign-client brain task must NOT appear in my response').toBeFalsy();
  });
});
