// @vitest-environment node
/**
 * Unit tests for lib/portal/my-tasks-collect.ts
 *
 * Strategy: queue-based fluent DB stub (same pattern as brain-org-units.test.ts).
 * No real DB required. getPortalClient is mocked to return a stub client or null.
 *
 * collectKanbanTasks (staff path) query sequence:
 *   1. kanbanCardAssignees → [{cardId}]
 *   2. kanbanCards leftJoin kanbanColumns → visible cards
 *   3. kanbanColumns where isDone=true → done column rows
 *   4. projects leftJoin clients → project rows
 *   5. kanbanCardLabels innerJoin kanbanLabels → label rows
 *   6. kanbanCardChecklistItems → checklist rows
 *
 * collectKanbanTasks (non-staff path) adds getPortalClient() call; step 2 also
 * innerJoins projects to scope by client.id.
 *
 * collectBrainTasks query sequence:
 *   1. brainTasks → task rows
 *   2. Promise.all([crmDeals, crmCompanies, clients]) → lookup rows
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── DB stub (hoisted so vi.mock factory can close over it) ──────────────────

const { captured, dbStub } = vi.hoisted(() => {
  const captured = {
    selectRowsQueue: [] as Array<Array<Record<string, unknown>>>,
  };

  function nextSelectRows(): Array<Record<string, unknown>> {
    return captured.selectRowsQueue.length > 0 ? captured.selectRowsQueue.shift()! : [];
  }

  function makeSelectChain(): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    chain.from = () => chain;
    chain.where = () => chain;
    chain.leftJoin = () => chain;
    chain.innerJoin = () => chain;
    chain.orderBy = () => Promise.resolve(nextSelectRows());
    chain.limit = () => Promise.resolve(nextSelectRows());
    chain.groupBy = () => Promise.resolve(nextSelectRows());
    chain.then = (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve(nextSelectRows()).then(onFulfilled);
    return chain;
  }

  const dbStub = {
    select: () => makeSelectChain(),
  };

  return { captured, dbStub };
});

vi.mock('@/lib/db', () => ({ db: dbStub }));

// ─── Schema stub — explicit named exports for every table the module imports ──

function makeTable(name: string): Record<string, { __col: string }> {
  return new Proxy({} as Record<string, { __col: string }>, {
    get: (_t, field: string) => ({ __col: `${name}.${field}` }),
  });
}

vi.mock('@/lib/db/schema', () => ({
  projects: makeTable('projects'),
  kanbanCards: makeTable('kanbanCards'),
  kanbanColumns: makeTable('kanbanColumns'),
  kanbanCardAssignees: makeTable('kanbanCardAssignees'),
  kanbanCardLabels: makeTable('kanbanCardLabels'),
  kanbanLabels: makeTable('kanbanLabels'),
  kanbanCardChecklistItems: makeTable('kanbanCardChecklistItems'),
  clients: makeTable('clients'),
  brainTasks: makeTable('brainTasks'),
  crmDeals: makeTable('crmDeals'),
  crmCompanies: makeTable('crmCompanies'),
}));

// ─── drizzle-orm stub ────────────────────────────────────────────────────────

vi.mock('drizzle-orm', () => ({
  and: (...parts: unknown[]) => ({ kind: 'and', parts }),
  eq: (col: unknown, val: unknown) => ({ kind: 'eq', col, val }),
  ne: (col: unknown, val: unknown) => ({ kind: 'ne', col, val }),
  inArray: (col: unknown, vals: unknown[]) => ({ kind: 'inArray', col, vals }),
  isNull: (a: unknown) => ({ kind: 'isNull', a }),
  or: (...args: unknown[]) => ({ kind: 'or', args: args.filter(Boolean) }),
}));

// ─── portal-client stub ───────────────────────────────────────────────────────

const mockGetPortalClient = vi.fn<() => Promise<{ id: number; company: string | null } | null>>();

vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => mockGetPortalClient(...(args as [])),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resetCaptured() {
  captured.selectRowsQueue.length = 0;
}

/** Push rows for the next db.select().from()...then() call */
function pushSelect(rows: Array<Record<string, unknown>>) {
  captured.selectRowsQueue.push(rows);
}

// ─── Import under test (after mocks) ─────────────────────────────────────────

import { collectKanbanTasks, collectBrainTasks } from '@/lib/portal/my-tasks-collect';

// ─── Fixture helpers ──────────────────────────────────────────────────────────

function makeCard(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 10,
    projectId: 100,
    columnId: 1,
    columnName: 'In Progress',
    columnIsDone: false,
    number: 7,
    title: 'Fix the bug',
    priority: 'high',
    dueDate: new Date('2026-03-01'),
    ...overrides,
  };
}

function makeProject(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 100,
    name: 'Alpha Project',
    projectKey: 'ALPHA',
    clientId: 5,
    clientName: 'Acme Corp',
    ...overrides,
  };
}

function makeBrainTask(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 200,
    clientId: 5,
    title: 'Write docs',
    status: 'open',
    priority: 'medium',
    dueDate: new Date('2026-04-15'),
    dealId: null,
    companyId: null,
    ...overrides,
  };
}

// ─── collectKanbanTasks ───────────────────────────────────────────────────────

describe('collectKanbanTasks — staff path', () => {
  beforeEach(() => {
    resetCaptured();
    mockGetPortalClient.mockReset();
  });

  it('returns [] when the user has no card assignments', async () => {
    pushSelect([]); // kanbanCardAssignees → empty
    const result = await collectKanbanTasks({ userId: 1, isStaff: true, openOnly: false });
    expect(result).toEqual([]);
  });

  it('returns [] when assigned cards are not found (empty cards query)', async () => {
    pushSelect([{ cardId: 99 }]); // assignments
    pushSelect([]);               // visibleCards → empty
    const result = await collectKanbanTasks({ userId: 1, isStaff: true, openOnly: false });
    expect(result).toEqual([]);
  });

  it('collects a single card and returns one group', async () => {
    const card = makeCard();
    pushSelect([{ cardId: 10 }]);         // assignments
    pushSelect([card]);                    // visibleCards
    pushSelect([{ projectId: 100, id: 50, order: 0 }]); // doneColumns
    pushSelect([makeProject()]);           // projectRows
    pushSelect([]);                        // labels
    pushSelect([]);                        // checklist

    const groups = await collectKanbanTasks({ userId: 1, isStaff: true, openOnly: false });

    expect(groups).toHaveLength(1);
    expect(groups[0].source).toBe('kanban');
    expect(groups[0].name).toBe('Alpha Project');
    expect(groups[0].projectKey).toBe('ALPHA');
    expect(groups[0].clientName).toBe('Acme Corp');
    expect(groups[0].cards).toHaveLength(1);
  });

  it('builds correct card shape including key, linkUrl, doneColumnId', async () => {
    const card = makeCard({ id: 10, projectId: 100, number: 7 });
    pushSelect([{ cardId: 10 }]);
    pushSelect([card]);
    pushSelect([{ projectId: 100, id: 55, order: 0 }]); // done column id=55
    pushSelect([makeProject()]);
    pushSelect([]);
    pushSelect([]);

    const groups = await collectKanbanTasks({ userId: 1, isStaff: true, openOnly: false });
    const c = groups[0].cards[0];

    expect(c.key).toBe('ALPHA-7');
    expect(c.linkUrl).toBe('/portal/projects/100?card=10');
    expect(c.doneColumnId).toBe(55);
    expect(c.source).toBe('kanban');
  });

  it('attaches labels to the correct card', async () => {
    const card = makeCard({ id: 10 });
    pushSelect([{ cardId: 10 }]);
    pushSelect([card]);
    pushSelect([]);
    pushSelect([makeProject()]);
    pushSelect([{ cardId: 10, id: 1, name: 'bug', color: '#ff0000' }]);
    pushSelect([]);

    const groups = await collectKanbanTasks({ userId: 1, isStaff: true, openOnly: false });
    expect(groups[0].cards[0].labels).toEqual([{ id: 1, name: 'bug', color: '#ff0000' }]);
  });

  it('attaches checklist progress to the correct card', async () => {
    const card = makeCard({ id: 10 });
    pushSelect([{ cardId: 10 }]);
    pushSelect([card]);
    pushSelect([]);
    pushSelect([makeProject()]);
    pushSelect([]);
    pushSelect([
      { cardId: 10, completed: true },
      { cardId: 10, completed: false },
      { cardId: 10, completed: true },
    ]);

    const groups = await collectKanbanTasks({ userId: 1, isStaff: true, openOnly: false });
    expect(groups[0].cards[0].checklist).toEqual({ total: 3, done: 2 });
  });

  it('sets checklist=null when no checklist rows exist', async () => {
    const card = makeCard({ id: 10 });
    pushSelect([{ cardId: 10 }]);
    pushSelect([card]);
    pushSelect([]);
    pushSelect([makeProject()]);
    pushSelect([]);
    pushSelect([]); // no checklist rows

    const groups = await collectKanbanTasks({ userId: 1, isStaff: true, openOnly: false });
    expect(groups[0].cards[0].checklist).toBeNull();
  });

  it('sets doneColumnId=null when no done column exists for the project', async () => {
    const card = makeCard({ id: 10, projectId: 100 });
    pushSelect([{ cardId: 10 }]);
    pushSelect([card]);
    pushSelect([]); // no done columns
    pushSelect([makeProject()]);
    pushSelect([]);
    pushSelect([]);

    const groups = await collectKanbanTasks({ userId: 1, isStaff: true, openOnly: false });
    expect(groups[0].cards[0].doneColumnId).toBeNull();
  });

  it('picks lowest-order done column when multiple exist for a project', async () => {
    const card = makeCard({ id: 10, projectId: 100 });
    pushSelect([{ cardId: 10 }]);
    pushSelect([card]);
    // Two done columns — order 5 and order 2; lowest-order (2) wins → id=99
    pushSelect([
      { projectId: 100, id: 88, order: 5 },
      { projectId: 100, id: 99, order: 2 },
    ]);
    pushSelect([makeProject()]);
    pushSelect([]);
    pushSelect([]);

    const groups = await collectKanbanTasks({ userId: 1, isStaff: true, openOnly: false });
    expect(groups[0].cards[0].doneColumnId).toBe(99);
  });

  it('openOnly=true filters out done cards before further queries', async () => {
    const doneCard = makeCard({ id: 11, columnIsDone: true });
    pushSelect([{ cardId: 11 }]);  // assignments
    pushSelect([doneCard]);         // visibleCards returns the done card
    // openOnly filter kicks in here → filtered is empty → returns []
    const result = await collectKanbanTasks({ userId: 1, isStaff: true, openOnly: true });
    expect(result).toEqual([]);
  });

  it('openOnly=false includes done cards', async () => {
    const doneCard = makeCard({ id: 11, columnIsDone: true });
    pushSelect([{ cardId: 11 }]);
    pushSelect([doneCard]);
    pushSelect([]);
    pushSelect([makeProject()]);
    pushSelect([]);
    pushSelect([]);

    const groups = await collectKanbanTasks({ userId: 1, isStaff: true, openOnly: false });
    expect(groups).toHaveLength(1);
    expect(groups[0].cards[0].columnIsDone).toBe(true);
  });

  it('sorts cards by dueDate ASC within a group (nulls last)', async () => {
    const later = makeCard({ id: 20, projectId: 100, dueDate: new Date('2026-06-01'), number: 2 });
    const earlier = makeCard({ id: 10, projectId: 100, dueDate: new Date('2026-03-01'), number: 1 });
    const noDate = makeCard({ id: 30, projectId: 100, dueDate: null, number: 3 });

    pushSelect([{ cardId: 10 }, { cardId: 20 }, { cardId: 30 }]);
    pushSelect([later, earlier, noDate]); // intentionally un-sorted input
    pushSelect([]);
    pushSelect([makeProject()]);
    pushSelect([]);
    pushSelect([]);

    const groups = await collectKanbanTasks({ userId: 1, isStaff: true, openOnly: false });
    const ids = groups[0].cards.map((c) => c.id);
    expect(ids).toEqual([10, 20, 30]);
  });

  it('groups cards by project — two projects → two groups', async () => {
    const cardA = makeCard({ id: 1, projectId: 100, number: 1 });
    const cardB = makeCard({ id: 2, projectId: 200, number: 1 });
    pushSelect([{ cardId: 1 }, { cardId: 2 }]);
    pushSelect([cardA, cardB]);
    pushSelect([]);
    pushSelect([
      makeProject({ id: 100, name: 'Alpha', projectKey: 'A' }),
      makeProject({ id: 200, name: 'Beta', projectKey: 'B', clientId: 6, clientName: 'Beta Inc' }),
    ]);
    pushSelect([]);
    pushSelect([]);

    const groups = await collectKanbanTasks({ userId: 1, isStaff: true, openOnly: false });
    expect(groups).toHaveLength(2);
    const names = groups.map((g) => g.name).sort();
    expect(names).toEqual(['Alpha', 'Beta']);
  });

  it('projectIds filter restricts to matching projects only', async () => {
    const cardA = makeCard({ id: 1, projectId: 100 });
    const cardB = makeCard({ id: 2, projectId: 200 });
    pushSelect([{ cardId: 1 }, { cardId: 2 }]);
    pushSelect([cardA, cardB]);
    pushSelect([]);
    pushSelect([makeProject({ id: 100 })]);
    pushSelect([]);
    pushSelect([]);

    const groups = await collectKanbanTasks({
      userId: 1,
      isStaff: true,
      openOnly: false,
      projectIds: [100], // only project 100
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].cards.map((c) => c.id)).toEqual([1]);
  });

  it('sets key=null when projectKey is null', async () => {
    const card = makeCard({ id: 10, number: 3 });
    pushSelect([{ cardId: 10 }]);
    pushSelect([card]);
    pushSelect([]);
    pushSelect([makeProject({ projectKey: null })]);
    pushSelect([]);
    pushSelect([]);

    const groups = await collectKanbanTasks({ userId: 1, isStaff: true, openOnly: false });
    expect(groups[0].cards[0].key).toBeNull();
  });

  it('sets key=null when card number is null', async () => {
    const card = makeCard({ id: 10, number: null });
    pushSelect([{ cardId: 10 }]);
    pushSelect([card]);
    pushSelect([]);
    pushSelect([makeProject()]);
    pushSelect([]);
    pushSelect([]);

    const groups = await collectKanbanTasks({ userId: 1, isStaff: true, openOnly: false });
    expect(groups[0].cards[0].key).toBeNull();
  });
});

// ─── collectKanbanTasks — non-staff path ──────────────────────────────────────

describe('collectKanbanTasks — non-staff (client) path', () => {
  beforeEach(() => {
    resetCaptured();
    mockGetPortalClient.mockReset();
  });

  it('returns [] when getPortalClient returns null (no portal access)', async () => {
    mockGetPortalClient.mockResolvedValue(null);
    pushSelect([{ cardId: 10 }]); // assignments — client has some
    const result = await collectKanbanTasks({ userId: 9, isStaff: false, openOnly: false });
    expect(result).toEqual([]);
  });

  it('collects cards scoped to the client when portal client exists', async () => {
    mockGetPortalClient.mockResolvedValue({ id: 5, company: 'Acme Corp' });
    const card = makeCard({ id: 10, projectId: 100 });
    pushSelect([{ cardId: 10 }]); // assignments
    pushSelect([card]);            // visibleCards (innerJoin scopes to client)
    pushSelect([]);                // done columns
    pushSelect([makeProject()]);   // projects
    pushSelect([]);                // labels
    pushSelect([]);                // checklist

    const groups = await collectKanbanTasks({ userId: 9, isStaff: false, openOnly: false });
    expect(groups).toHaveLength(1);
    expect(groups[0].cards[0].id).toBe(10);
  });
});

// ─── collectBrainTasks ────────────────────────────────────────────────────────

describe('collectBrainTasks — staff path', () => {
  beforeEach(() => {
    resetCaptured();
    mockGetPortalClient.mockReset();
  });

  it('returns [] when the user has no brain tasks', async () => {
    pushSelect([]); // brainTasks → empty
    const result = await collectBrainTasks({ userId: 1, isStaff: true, openOnly: false });
    expect(result).toEqual([]);
  });

  it('returns a single brain group for an uncategorized task', async () => {
    const task = makeBrainTask({ id: 200, dealId: null, companyId: null });
    pushSelect([task]);  // brainTasks
    // Promise.all: dealIds empty → short-circuits; companyIds empty → short-circuits
    // Only clients arm consumes a queue slot.
    pushSelect([{ id: 5, company: 'Acme Corp' }]); // clients

    const groups = await collectBrainTasks({ userId: 1, isStaff: true, openOnly: false });

    expect(groups).toHaveLength(1);
    expect(groups[0].source).toBe('brain');
    expect(groups[0].id).toBe('brain-uncategorized');
    expect(groups[0].name).toBe('Brain tasks');
    expect(groups[0].cards).toHaveLength(1);
  });

  it('builds correct card shape for a brain task', async () => {
    // dealId:null, companyId:null → both Promise.all arms short-circuit; only clients pulls
    const task = makeBrainTask({ id: 200, status: 'in_progress', priority: 'high', dueDate: new Date('2026-04-15') });
    pushSelect([task]);
    pushSelect([{ id: 5, company: 'Acme Corp' }]); // clients

    const groups = await collectBrainTasks({ userId: 1, isStaff: true, openOnly: false });
    const card = groups[0].cards[0];

    expect(card.id).toBe(200);
    expect(card.source).toBe('brain');
    expect(card.key).toBe('BRAIN-200');
    expect(card.columnName).toBe('In Progress');
    expect(card.columnIsDone).toBe(false);
    expect(card.doneColumnId).toBeNull();
    expect(card.labels).toEqual([]);
    expect(card.checklist).toBeNull();
    expect(card.linkUrl).toBe('/portal/brain/tasks?task=200');
  });

  it('marks columnIsDone=true for done tasks', async () => {
    // dealId:null, companyId:null → both short-circuit; only clients pulls
    const task = makeBrainTask({ id: 201, status: 'done' });
    pushSelect([task]);
    pushSelect([{ id: 5, company: null }]); // clients

    const groups = await collectBrainTasks({ userId: 1, isStaff: true, openOnly: false });
    expect(groups[0].cards[0].columnIsDone).toBe(true);
    expect(groups[0].cards[0].columnName).toBe('Done');
  });

  it('groups tasks by dealId into a deal group', async () => {
    // dealId:77 → deals pulls; companyId:null → companies short-circuits; clients pulls
    const task = makeBrainTask({ id: 202, dealId: 77, companyId: null });
    pushSelect([task]);
    pushSelect([{ id: 77, title: 'Big Deal' }]); // deals
    pushSelect([{ id: 5, company: 'Acme Corp' }]); // clients

    const groups = await collectBrainTasks({ userId: 1, isStaff: true, openOnly: false });

    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe('brain-deal-77');
    expect(groups[0].name).toBe('Big Deal · CRM Deal');
    expect(groups[0].source).toBe('brain');
  });

  it('groups tasks by companyId into a company group', async () => {
    const task = makeBrainTask({ id: 203, dealId: null, companyId: 33 });
    pushSelect([task]);
    // dealIds is empty → Promise.resolve([]) short-circuits; no queue slot consumed
    pushSelect([{ id: 33, name: 'Globex' }]);   // companies
    pushSelect([{ id: 5, company: 'Acme Corp' }]); // clients

    const groups = await collectBrainTasks({ userId: 1, isStaff: true, openOnly: false });

    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe('brain-company-33');
    expect(groups[0].name).toBe('Globex · CRM Company');
  });

  it('falls back to Deal #id when deal title is not in lookup', async () => {
    // dealId:999 → deals arm pulls; companyId:null → companies short-circuits; clients pulls
    const task = makeBrainTask({ id: 204, dealId: 999, companyId: null });
    pushSelect([task]);
    pushSelect([]); // deals → empty (id 999 not found)
    pushSelect([{ id: 5, company: null }]); // clients

    const groups = await collectBrainTasks({ userId: 1, isStaff: true, openOnly: false });
    expect(groups[0].name).toBe('Deal #999 · CRM Deal');
  });

  it('falls back to Company #id when company name is not in lookup', async () => {
    // dealId:null → short-circuits; companyId:888 → companies pulls; clients pulls
    const task = makeBrainTask({ id: 205, dealId: null, companyId: 888 });
    pushSelect([task]);
    pushSelect([]); // companies → empty (id 888 not found)
    pushSelect([{ id: 5, company: null }]); // clients

    const groups = await collectBrainTasks({ userId: 1, isStaff: true, openOnly: false });
    expect(groups[0].name).toBe('Company #888 · CRM Company');
  });

  it('puts tasks with different linkages in separate groups', async () => {
    // t1: dealId:10, t2: companyId:20, t3: neither
    // dealIds=[10] (non-empty → pulls), companyIds=[20] (non-empty → pulls), clients pulls
    const t1 = makeBrainTask({ id: 1, dealId: 10, companyId: null });
    const t2 = makeBrainTask({ id: 2, dealId: null, companyId: 20 });
    const t3 = makeBrainTask({ id: 3, dealId: null, companyId: null });

    pushSelect([t1, t2, t3]);
    pushSelect([{ id: 10, title: 'Deal Alpha' }]); // deals
    pushSelect([{ id: 20, name: 'Company Beta' }]); // companies
    pushSelect([{ id: 5, company: 'Acme Corp' }]); // clients

    const groups = await collectBrainTasks({ userId: 1, isStaff: true, openOnly: false });

    expect(groups).toHaveLength(3);
    const ids = groups.map((g) => g.id).sort();
    expect(ids).toEqual(['brain-company-20', 'brain-deal-10', 'brain-uncategorized']);
  });

  it('puts multiple tasks in the same group when they share a dealId', async () => {
    // dealId:10 (non-empty → pulls), companyId:null → short-circuits, clients pulls
    const t1 = makeBrainTask({ id: 1, dealId: 10, companyId: null });
    const t2 = makeBrainTask({ id: 2, dealId: 10, companyId: null });

    pushSelect([t1, t2]);
    pushSelect([{ id: 10, title: 'Shared Deal' }]); // deals
    pushSelect([{ id: 5, company: null }]); // clients

    const groups = await collectBrainTasks({ userId: 1, isStaff: true, openOnly: false });
    expect(groups).toHaveLength(1);
    expect(groups[0].cards).toHaveLength(2);
  });

  it('sorts cards within a group by dueDate ASC, nulls last', async () => {
    // All tasks: dealId:null, companyId:null → only clients pulls
    const later = makeBrainTask({ id: 2, dueDate: new Date('2026-06-01') });
    const earlier = makeBrainTask({ id: 1, dueDate: new Date('2026-03-01') });
    const noDate = makeBrainTask({ id: 3, dueDate: null });

    pushSelect([later, noDate, earlier]); // deliberately unsorted
    pushSelect([{ id: 5, company: null }]); // clients

    const groups = await collectBrainTasks({ userId: 1, isStaff: true, openOnly: false });
    const ids = groups[0].cards.map((c) => c.id);
    expect(ids).toEqual([1, 2, 3]);
  });

  it('openOnly=true excludes done tasks', async () => {
    const open = makeBrainTask({ id: 1, status: 'open' });
    const done = makeBrainTask({ id: 2, status: 'done' });
    // openOnly adds ne(status, 'done') to WHERE; DB filters before returning.
    // Stub simulates DB already filtered. dealId:null, companyId:null → only clients pulls.
    pushSelect([open]);
    pushSelect([{ id: 5, company: null }]); // clients

    const groups = await collectBrainTasks({ userId: 1, isStaff: true, openOnly: true });
    // We only pushed one task (open); the done one is not present
    expect(groups[0].cards.map((c) => c.id)).toEqual([1]);
    expect(done).toBeDefined(); // keep linter happy — variable used
  });

  it('resolves clientName from clients lookup', async () => {
    // dealId=null, companyId=null → both short-circuit; only clients pulls from queue
    const task = makeBrainTask({ id: 200, clientId: 5, dealId: null, companyId: null });
    pushSelect([task]);
    pushSelect([{ id: 5, company: 'Acme Corp' }]); // clients (only queue slot consumed)

    const groups = await collectBrainTasks({ userId: 1, isStaff: true, openOnly: false });
    expect(groups[0].clientName).toBe('Acme Corp');
  });

  it('sets clientName=null when client is not found in lookup', async () => {
    // dealId:null, companyId:null → both short-circuit; only clients pulls → empty
    const task = makeBrainTask({ id: 200, clientId: 999, dealId: null, companyId: null });
    pushSelect([task]);
    pushSelect([]); // clients → no match for clientId 999

    const groups = await collectBrainTasks({ userId: 1, isStaff: true, openOnly: false });
    expect(groups[0].clientName).toBeNull();
  });
});

// ─── collectBrainTasks — non-staff path ──────────────────────────────────────

describe('collectBrainTasks — non-staff (client) path', () => {
  beforeEach(() => {
    resetCaptured();
    mockGetPortalClient.mockReset();
  });

  it('returns [] when getPortalClient returns null', async () => {
    mockGetPortalClient.mockResolvedValue(null);
    const result = await collectBrainTasks({ userId: 9, isStaff: false, openOnly: false });
    expect(result).toEqual([]);
  });

  it('collects tasks scoped to the client when portal client exists', async () => {
    mockGetPortalClient.mockResolvedValue({ id: 5, company: 'Acme Corp' });
    // dealId:null, companyId:null → only clients pulls from queue
    const task = makeBrainTask({ id: 300, clientId: 5, dealId: null, companyId: null });
    pushSelect([task]);
    pushSelect([{ id: 5, company: 'Acme Corp' }]); // clients

    const groups = await collectBrainTasks({ userId: 9, isStaff: false, openOnly: false });
    expect(groups).toHaveLength(1);
    expect(groups[0].cards[0].id).toBe(300);
  });
});
