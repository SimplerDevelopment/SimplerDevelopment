// @vitest-environment node
/**
 * Unit tests for lib/ai/portal-tools/projects.ts — Part 2.
 *
 * Covers: add_card_comment, create_project_card, update_project_card,
 * move_project_card, pm_spawn_project_from_deal.
 *
 * Shares the same mock/setup pattern as ai-portal-tools-projects.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------

interface MockState {
  projects: Array<Record<string, unknown>>;
  kanbanColumns: Array<Record<string, unknown>>;
  kanbanCards: Array<Record<string, unknown>>;
  sprints: Array<Record<string, unknown>>;
  kanbanCardFiles: Array<Record<string, unknown>>;
  kanbanCardComments: Array<Record<string, unknown>>;
  kanbanCardAssignees: Array<Record<string, unknown>>;
  users: Array<Record<string, unknown>>;
  kanbanLabels: Array<Record<string, unknown>>;
  cardTemplates: Array<Record<string, unknown>>;
  projectMembers: Array<Record<string, unknown>>;
  crmDeals: Array<Record<string, unknown>>;
  crmCompanies: Array<Record<string, unknown>>;
  nextId: Record<string, number>;
}

const state: MockState = {
  projects: [],
  kanbanColumns: [],
  kanbanCards: [],
  sprints: [],
  kanbanCardFiles: [],
  kanbanCardComments: [],
  kanbanCardAssignees: [],
  users: [],
  kanbanLabels: [],
  cardTemplates: [],
  projectMembers: [],
  crmDeals: [],
  crmCompanies: [],
  nextId: {
    projects: 1,
    kanbanColumns: 1,
    kanbanCards: 1,
    sprints: 1,
    kanbanCardFiles: 1,
    kanbanCardComments: 1,
    kanbanCardAssignees: 1,
    users: 1,
    kanbanLabels: 1,
    cardTemplates: 1,
    projectMembers: 1,
    crmDeals: 1,
    crmCompanies: 1,
  },
};

// ---------------------------------------------------------------------------
// Schema mock — thin proxy returning column references
// ---------------------------------------------------------------------------

vi.mock('@/lib/db/schema', () => {
  const wrap = (tableName: string) =>
    new Proxy(
      { __table: tableName, __isTable: true },
      {
        get(_t, prop: string) {
          if (prop === '__table') return tableName;
          if (prop === '__isTable') return true;
          if (prop === '__col') return undefined;
          return { __col: prop, __table: tableName };
        },
      },
    );
  const tables = [
    'projects', 'kanbanColumns', 'kanbanCards', 'sprints',
    'kanbanCardFiles', 'kanbanCardComments', 'kanbanCardAssignees', 'users',
    'kanbanLabels', 'cardTemplates', 'projectMembers', 'crmDeals', 'crmCompanies',
  ];
  const base: Record<string, ReturnType<typeof wrap>> = {};
  for (const t of tables) base[t] = wrap(t);
  return new Proxy(base, {
    has: (t, p) =>
      p in t ||
      !(
        p === 'then' ||
        p === '__esModule' ||
        p === 'default' ||
        typeof p !== 'string'
      ),
    get: (t, p) =>
      p in t
        ? t[p as string]
        : p === 'then' ||
            p === '__esModule' ||
            p === 'default' ||
            typeof p !== 'string'
          ? undefined
          : wrap(p as string),
  });
});

// ---------------------------------------------------------------------------
// drizzle-orm mock
// ---------------------------------------------------------------------------

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    op: 'sql',
    strings: Array.from(strings),
    values,
  }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// ---------------------------------------------------------------------------
// Predicate engine
// ---------------------------------------------------------------------------

function getCol(ref: unknown): { col: string; table: string } | null {
  const r = ref as { __col?: string; __table?: string } | undefined;
  if (!r?.__col || !r.__table) return null;
  return { col: r.__col, table: r.__table };
}

function readField(row: Record<string, unknown>, ref: unknown): unknown {
  const c = getCol(ref);
  if (!c) return undefined;
  return row[c.col];
}

function evalPredicate(filter: unknown, row: Record<string, unknown>): boolean {
  if (!filter) return true;
  if (typeof filter !== 'object') return true;
  const f = filter as {
    op?: string;
    a?: unknown;
    b?: unknown;
    args?: unknown[];
    list?: unknown[];
  };
  switch (f.op) {
    case 'eq': {
      const left = readField(row, f.a);
      return left === f.b;
    }
    case 'and':
      return (f.args ?? []).every((arg) => evalPredicate(arg, row));
    case 'inArray': {
      const left = readField(row, f.a);
      return (f.list ?? []).includes(left);
    }
    default:
      return true;
  }
}

function projectRow(
  row: Record<string, unknown>,
  projection: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!projection) return { ...row };
  const out: Record<string, unknown> = {};
  for (const [alias, ref] of Object.entries(projection)) {
    const refRec = ref as { __col?: string; __table?: string; __isTable?: boolean };
    if (refRec.__isTable) {
      out[alias] = { ...row };
      continue;
    }
    if ((refRec as { op?: string }).op === 'sql') {
      // Return 0 as a placeholder for sql-tagged count(*) fields;
      // the count-query detection below handles the real count case.
      out[alias] = 0;
      continue;
    }
    const c = getCol(ref);
    out[alias] = c ? row[c.col] : undefined;
  }
  return out;
}

function tableArray(name: string): Array<Record<string, unknown>> {
  return (state as unknown as Record<string, Array<Record<string, unknown>>>)[name] ?? [];
}

// ---------------------------------------------------------------------------
// DB mock
// ---------------------------------------------------------------------------

vi.mock('@/lib/db', () => {
  function buildSelect(projection: Record<string, unknown> | null) {
    let activeTable: string | null = null;
    let filter: unknown = null;
    let limitVal: number | null = null;
    const joinedTables: string[] = [];

    const chain: Record<string, unknown> = {
      from(table: { __table: string }) {
        activeTable = table.__table;
        return chain;
      },
      leftJoin(table: { __table: string }) {
        joinedTables.push(table.__table);
        return chain;
      },
      innerJoin(table: { __table: string }) {
        joinedTables.push(table.__table);
        return chain;
      },
      where(arg: unknown) {
        filter = arg;
        return chain;
      },
      orderBy() {
        return chain;
      },
      limit(n: number) {
        limitVal = n;
        return runQuery();
      },
      then(
        onFulfilled: (v: unknown) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) {
        return runQuery().then(onFulfilled, onRejected);
      },
    };

    function runQuery(): Promise<Array<Record<string, unknown>>> {
      if (!activeTable) return Promise.resolve([]);
      const rows = tableArray(activeTable).filter((r) => evalPredicate(filter, r));

      // Detect a sql-tagged count(*) projection — Drizzle emits a single row
      // {<alias>: <count>} for these queries.
      if (projection) {
        const projEntries = Object.entries(projection);
        const isCountQuery =
          projEntries.length === 1 &&
          (projEntries[0][1] as { op?: string }).op === 'sql';
        if (isCountQuery) {
          const alias = projEntries[0][0];
          return Promise.resolve([{ [alias]: rows.length }]);
        }
      }

      // Merge join tables into each base row so column projections resolve
      // (simple "pick first matching row" approach is enough for unit tests).
      const enriched = joinedTables.reduce<Array<Record<string, unknown>>>((acc, jt) => {
        return acc.map((r) => {
          const match = tableArray(jt).find(() => true); // just pick first; filter handled elsewhere
          return { ...r, ...(match ?? {}) };
        });
      }, rows);

      let out = enriched.map((r) => projectRow(r, projection));
      if (limitVal !== null) out = out.slice(0, limitVal);
      return Promise.resolve(out);
    }

    return chain;
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(payload: Record<string, unknown> | Array<Record<string, unknown>>) {
        const rows = Array.isArray(payload) ? payload : [payload];
        const inserted: Array<Record<string, unknown>> = [];
        for (const row of rows) {
          const arr = tableArray(table.__table);
          const idx =
            (state.nextId as Record<string, number>)[table.__table] ?? 1;
          const newRow = { id: idx, ...row };
          (state.nextId as Record<string, number>)[table.__table] = idx + 1;
          arr.push(newRow);
          inserted.push(newRow);
        }
        return {
          returning() {
            return Promise.resolve(inserted);
          },
          onConflictDoNothing() {
            return {
              returning() {
                return Promise.resolve(inserted);
              },
              then(
                onFulfilled: (v: unknown) => unknown,
                onRejected?: (e: unknown) => unknown,
              ) {
                return Promise.resolve(inserted).then(onFulfilled, onRejected);
              },
            };
          },
          then(
            onFulfilled: (v: unknown) => unknown,
            onRejected?: (e: unknown) => unknown,
          ) {
            return Promise.resolve(inserted).then(onFulfilled, onRejected);
          },
        };
      },
    };
  }

  function buildUpdate(table: { __table: string }) {
    let setPayload: Record<string, unknown> = {};
    const chain: Record<string, unknown> = {
      set(payload: Record<string, unknown>) {
        setPayload = payload;
        return chain;
      },
      where(f: unknown) {
        const arr = tableArray(table.__table);
        for (const row of arr) {
          if (evalPredicate(f, row)) {
            Object.assign(row, setPayload);
          }
        }
        return Promise.resolve(undefined);
      },
    };
    return chain;
  }

  return {
    db: {
      select(projection?: Record<string, unknown>) {
        return {
          from(table: { __table: string }) {
            return buildSelect(projection ?? null).from(table);
          },
        };
      },
      insert(table: { __table: string }) {
        return buildInsert(table);
      },
      update(table: { __table: string }) {
        return buildUpdate(table);
      },
    },
  };
});

// ---------------------------------------------------------------------------
// beforeEach — wipe state
// ---------------------------------------------------------------------------

beforeEach(() => {
  for (const key of Object.keys(state) as Array<keyof MockState>) {
    if (key === 'nextId') continue;
    (state[key] as Array<Record<string, unknown>>).length = 0;
  }
  state.nextId = {
    projects: 1,
    kanbanColumns: 1,
    kanbanCards: 1,
    sprints: 1,
    kanbanCardFiles: 1,
    kanbanCardComments: 1,
    kanbanCardAssignees: 1,
    users: 1,
    kanbanLabels: 1,
    cardTemplates: 1,
    projectMembers: 1,
    crmDeals: 1,
    crmCompanies: 1,
  };
});

async function importModule() {
  return await import('@/lib/ai/portal-tools/projects');
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

function seedProject(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: state.nextId.projects++,
    clientId: 10,
    name: 'My Project',
    description: 'A project',
    status: 'active',
    startDate: null,
    dueDate: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    createdBy: 1,
    projectKey: null,
    ...overrides,
  };
  state.projects.push(row);
  return row;
}

function seedColumn(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: state.nextId.kanbanColumns++,
    projectId: 1,
    name: 'To Do',
    order: 0,
    color: null,
    isDone: false,
    wipLimit: null,
    ...overrides,
  };
  state.kanbanColumns.push(row);
  return row;
}

function seedCard(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: state.nextId.kanbanCards++,
    projectId: 1,
    columnId: 1,
    title: 'A Card',
    description: null,
    priority: 'medium',
    dueDate: null,
    order: 0,
    createdBy: 1,
    sprintId: null,
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
  state.kanbanCards.push(row);
  return row;
}

function seedDeal(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: state.nextId.crmDeals++,
    clientId: 10,
    title: 'Big Deal',
    companyId: null,
    ...overrides,
  };
  state.crmDeals.push(row);
  return row;
}

function seedCrmCompany(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: state.nextId.crmCompanies++,
    name: 'Acme',
    ...overrides,
  };
  state.crmCompanies.push(row);
  return row;
}

// ---------------------------------------------------------------------------
// add_card_comment
// ---------------------------------------------------------------------------

describe('add_card_comment', () => {
  it('returns error when card not found', async () => {
    const { projectHandlers } = await importModule();
    const res = await projectHandlers.add_card_comment(
      { card_id: 999, body: 'Hello' },
      10,
      1,
    );
    expect(res).toEqual({ error: 'Card not found' });
  });

  it('returns error when card belongs to another client project', async () => {
    seedProject({ id: 1, clientId: 99 });
    seedCard({ id: 1, projectId: 1, columnId: 1 });
    const { projectHandlers } = await importModule();
    const res = await projectHandlers.add_card_comment(
      { card_id: 1, body: 'Hi' },
      10,
      1,
    );
    expect(res).toEqual({ error: 'Card does not belong to your project' });
  });

  it('inserts comment and returns success', async () => {
    seedProject({ id: 1, clientId: 10 });
    seedCard({ id: 1, projectId: 1, columnId: 1 });
    const { projectHandlers } = await importModule();
    const res = (await projectHandlers.add_card_comment(
      { card_id: 1, body: 'Great work!' },
      10,
      5,
    )) as Record<string, unknown>;
    expect(res.success).toBe(true);
    expect(state.kanbanCardComments).toHaveLength(1);
    expect(state.kanbanCardComments[0]).toMatchObject({
      cardId: 1,
      userId: 5,
      body: 'Great work!',
    });
  });
});

// ---------------------------------------------------------------------------
// create_project_card
// ---------------------------------------------------------------------------

describe('create_project_card', () => {
  it('returns error when column not found', async () => {
    const { projectHandlers } = await importModule();
    const res = await projectHandlers.create_project_card(
      { column_id: 999, title: 'Task' },
      10,
      1,
    );
    expect(res).toEqual({ error: 'Column not found' });
  });

  it('returns error when project belongs to another client', async () => {
    seedProject({ id: 1, clientId: 99 });
    seedColumn({ id: 1, projectId: 1 });
    const { projectHandlers } = await importModule();
    const res = await projectHandlers.create_project_card(
      { column_id: 1, title: 'Task' },
      10,
      1,
    );
    expect(res).toEqual({ error: 'Project not found or access denied' });
  });

  it('creates a card and returns cardId', async () => {
    seedProject({ id: 1, clientId: 10 });
    seedColumn({ id: 1, projectId: 1 });
    const { projectHandlers } = await importModule();
    const res = (await projectHandlers.create_project_card(
      { column_id: 1, title: 'My Task', priority: 'high' },
      10,
      3,
    )) as Record<string, unknown>;
    expect(res.success).toBe(true);
    expect(typeof res.cardId).toBe('number');
    expect(state.kanbanCards).toHaveLength(1);
    expect(state.kanbanCards[0]).toMatchObject({
      title: 'My Task',
      priority: 'high',
      columnId: 1,
      projectId: 1,
      createdBy: 3,
    });
  });

  it('defaults priority to medium when not supplied', async () => {
    seedProject({ id: 1, clientId: 10 });
    seedColumn({ id: 1, projectId: 1 });
    const { projectHandlers } = await importModule();
    await projectHandlers.create_project_card({ column_id: 1, title: 'Default Priority' }, 10, 1);
    expect(state.kanbanCards[0].priority).toBe('medium');
  });

  it('stores due_date as a Date when supplied', async () => {
    seedProject({ id: 1, clientId: 10 });
    seedColumn({ id: 1, projectId: 1 });
    const { projectHandlers } = await importModule();
    await projectHandlers.create_project_card(
      { column_id: 1, title: 'Dated', due_date: '2026-03-15' },
      10,
      1,
    );
    expect(state.kanbanCards[0].dueDate).toBeInstanceOf(Date);
  });
});

// ---------------------------------------------------------------------------
// update_project_card
// ---------------------------------------------------------------------------

describe('update_project_card', () => {
  it('returns error when card not found', async () => {
    const { projectHandlers } = await importModule();
    const res = await projectHandlers.update_project_card({ card_id: 999 }, 10, 1);
    expect(res).toEqual({ error: 'Card not found' });
  });

  it('returns error when project belongs to another client', async () => {
    seedProject({ id: 1, clientId: 99 });
    seedCard({ id: 1, projectId: 1 });
    const { projectHandlers } = await importModule();
    const res = await projectHandlers.update_project_card({ card_id: 1 }, 10, 1);
    expect(res).toEqual({ error: 'Access denied' });
  });

  it('updates only the supplied fields', async () => {
    seedProject({ id: 1, clientId: 10 });
    seedCard({ id: 1, projectId: 1, title: 'Old', priority: 'low' });
    const { projectHandlers } = await importModule();
    const res = (await projectHandlers.update_project_card(
      { card_id: 1, title: 'New' },
      10,
      1,
    )) as Record<string, unknown>;
    expect(res.success).toBe(true);
    const card = state.kanbanCards.find((c) => c.id === 1)!;
    expect(card.title).toBe('New');
    expect(card.priority).toBe('low');
  });

  it('updates priority and due_date when provided', async () => {
    seedProject({ id: 1, clientId: 10 });
    seedCard({ id: 1, projectId: 1, priority: 'low', dueDate: null });
    const { projectHandlers } = await importModule();
    await projectHandlers.update_project_card(
      { card_id: 1, priority: 'urgent', due_date: '2026-06-01' },
      10,
      1,
    );
    const card = state.kanbanCards.find((c) => c.id === 1)!;
    expect(card.priority).toBe('urgent');
    expect(card.dueDate).toBeInstanceOf(Date);
  });

  it('sets dueDate to null when due_date is an empty string', async () => {
    seedProject({ id: 1, clientId: 10 });
    seedCard({ id: 1, projectId: 1, dueDate: new Date('2026-01-01') });
    const { projectHandlers } = await importModule();
    await projectHandlers.update_project_card(
      { card_id: 1, due_date: '' },
      10,
      1,
    );
    const card = state.kanbanCards.find((c) => c.id === 1)!;
    expect(card.dueDate).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// move_project_card
// ---------------------------------------------------------------------------

describe('move_project_card', () => {
  it('returns error when card not found', async () => {
    const { projectHandlers } = await importModule();
    const res = await projectHandlers.move_project_card(
      { card_id: 999, column_id: 1 },
      10,
      1,
    );
    expect(res).toEqual({ error: 'Card not found' });
  });

  it('returns error when project belongs to another client', async () => {
    seedProject({ id: 1, clientId: 99 });
    seedCard({ id: 1, projectId: 1 });
    const { projectHandlers } = await importModule();
    const res = await projectHandlers.move_project_card(
      { card_id: 1, column_id: 2 },
      10,
      1,
    );
    expect(res).toEqual({ error: 'Access denied' });
  });

  it('moves card to destination column', async () => {
    seedProject({ id: 1, clientId: 10 });
    seedColumn({ id: 1, projectId: 1, name: 'To Do' });
    seedColumn({ id: 2, projectId: 1, name: 'Done' });
    seedCard({ id: 1, projectId: 1, columnId: 1 });
    const { projectHandlers } = await importModule();
    const res = (await projectHandlers.move_project_card(
      { card_id: 1, column_id: 2 },
      10,
      1,
    )) as Record<string, unknown>;
    expect(res.success).toBe(true);
    const card = state.kanbanCards.find((c) => c.id === 1)!;
    expect(card.columnId).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// pm_spawn_project_from_deal
// ---------------------------------------------------------------------------

describe('pm_spawn_project_from_deal', () => {
  it('returns error when deal not found', async () => {
    const { projectHandlers } = await importModule();
    const res = await projectHandlers.pm_spawn_project_from_deal(
      { deal_id: 999 },
      10,
      1,
    );
    expect(res).toEqual({ error: 'Deal not found in this account' });
  });

  it('returns error when deal belongs to another client', async () => {
    seedDeal({ id: 1, clientId: 99, title: 'Foreign Deal' });
    const { projectHandlers } = await importModule();
    const res = await projectHandlers.pm_spawn_project_from_deal({ deal_id: 1 }, 10, 1);
    expect(res).toEqual({ error: 'Deal not found in this account' });
  });

  it('creates a project from a deal and returns project metadata', async () => {
    seedDeal({ id: 1, clientId: 10, title: 'My Deal', companyId: null });
    const { projectHandlers } = await importModule();
    const res = (await projectHandlers.pm_spawn_project_from_deal(
      { deal_id: 1 },
      10,
      5,
    )) as Record<string, unknown>;
    expect(res.success).toBe(true);
    expect(typeof res.projectId).toBe('number');
    expect(res.dealId).toBe(1);
    expect(state.projects).toHaveLength(1);
    expect(state.projects[0].clientId).toBe(10);
    expect(state.projects[0].status).toBe('active');
  });

  it('uses companyName in project name when deal has companyId', async () => {
    seedCrmCompany({ id: 1, name: 'Big Corp' });
    seedDeal({ id: 1, clientId: 10, title: 'A Deal', companyId: 1 });
    const { projectHandlers } = await importModule();
    const res = (await projectHandlers.pm_spawn_project_from_deal(
      { deal_id: 1 },
      10,
      1,
    )) as Record<string, unknown>;
    expect(res.success).toBe(true);
    expect(res.companyName).toBe('Big Corp');
    expect((state.projects[0].name as string).includes('Big Corp')).toBe(true);
  });

  it('prepends name_prefix to project name when provided', async () => {
    seedDeal({ id: 1, clientId: 10, title: 'Solo Deal', companyId: null });
    const { projectHandlers } = await importModule();
    await projectHandlers.pm_spawn_project_from_deal(
      { deal_id: 1, name_prefix: 'Onboarding · ' },
      10,
      1,
    );
    expect((state.projects[0].name as string).startsWith('Onboarding · ')).toBe(true);
  });

  it('returns error when template_project_id references a foreign project', async () => {
    seedDeal({ id: 1, clientId: 10, title: 'Deal' });
    seedProject({ id: 99, clientId: 99, name: 'Foreign Template' });
    const { projectHandlers } = await importModule();
    const res = (await projectHandlers.pm_spawn_project_from_deal(
      { deal_id: 1, template_project_id: 99 },
      10,
      1,
    )) as Record<string, unknown>;
    expect(res.error).toBe('Template project not found in this account');
  });

  it('clones columns from a template project', async () => {
    // Use a high id for the template so it won't collide with the auto-inserted project.
    state.nextId.projects = 50;
    seedProject({ id: 50, clientId: 10, name: 'Template' });
    state.nextId.projects = 51; // advance past the seeded template
    seedColumn({ id: 10, projectId: 50, name: 'Backlog', order: 0 });
    seedColumn({ id: 11, projectId: 50, name: 'Done', order: 1 });
    state.nextId.projects = 100; // next inserted project will get id=100
    seedDeal({ id: 1, clientId: 10, title: 'Cloned Deal', companyId: null });
    const { projectHandlers } = await importModule();
    const res = (await projectHandlers.pm_spawn_project_from_deal(
      { deal_id: 1, template_project_id: 50 },
      10,
      1,
    )) as Record<string, unknown>;
    expect(res.success).toBe(true);
    expect(res.clonedFromProjectId).toBe(50);
    // New project's columns should have been inserted
    const newProjectId = res.projectId as number;
    const clonedCols = state.kanbanColumns.filter((c) => c.projectId === newProjectId);
    expect(clonedCols).toHaveLength(2);
    const colNames = clonedCols.map((c) => c.name).sort();
    expect(colNames).toEqual(['Backlog', 'Done']);
  });

  it('adds the creating user as project owner when userId is truthy', async () => {
    seedDeal({ id: 1, clientId: 10, title: 'User Deal', companyId: null });
    const { projectHandlers } = await importModule();
    await projectHandlers.pm_spawn_project_from_deal({ deal_id: 1 }, 10, 7);
    const member = state.projectMembers.find((m) => m.role === 'owner');
    expect(member).toBeDefined();
    expect(member?.userId).toBe(7);
  });
});
