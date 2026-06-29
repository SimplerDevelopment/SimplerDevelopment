// @vitest-environment node
/**
 * Unit tests for lib/ai/portal-tools/projects.ts.
 *
 * The module defines AI-tool handler functions that read/write project/kanban
 * state (projects, columns, cards, sprints, files, comments). We mock
 * `@/lib/db`, `@/lib/db/schema`, and `drizzle-orm` with in-memory state —
 * same pattern as `portal-tools-cms.test.ts`.
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

function seedSprint(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: state.nextId.sprints++,
    projectId: 1,
    name: 'Sprint 1',
    goal: null,
    status: 'active',
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-01-14'),
    order: 1,
    ...overrides,
  };
  state.sprints.push(row);
  return row;
}

function seedFile(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: state.nextId.kanbanCardFiles++,
    projectId: 1,
    cardId: 1,
    originalName: 'doc.pdf',
    mimeType: 'application/pdf',
    fileSize: 2048,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
  state.kanbanCardFiles.push(row);
  return row;
}

// ---------------------------------------------------------------------------
// projectTools schema
// ---------------------------------------------------------------------------

describe('projectTools schema', () => {
  it('exposes 10 tools with stable names', async () => {
    const { projectTools } = await importModule();
    const names = projectTools.map((t) => t.name).sort();
    expect(names).toEqual([
      'add_card_comment',
      'create_project_card',
      'get_my_projects',
      'get_project_board',
      'get_project_cards',
      'get_project_files',
      'get_sprint_progress',
      'move_project_card',
      'pm_spawn_project_from_deal',
      'update_project_card',
    ]);
  });

  it('every tool has a non-empty description and an object input_schema', async () => {
    const { projectTools } = await importModule();
    for (const t of projectTools) {
      expect(typeof t.description).toBe('string');
      expect((t.description as string).length).toBeGreaterThan(0);
      expect(t.input_schema.type).toBe('object');
    }
  });

  it('projectHandlers exposes exactly one handler per tool name, each with arity 3', async () => {
    const { projectTools, projectHandlers } = await importModule();
    for (const t of projectTools) {
      expect(typeof projectHandlers[t.name], `handler for ${t.name}`).toBe('function');
      expect(projectHandlers[t.name].length, `arity of ${t.name}`).toBe(3);
    }
  });
});

// ---------------------------------------------------------------------------
// get_my_projects
// ---------------------------------------------------------------------------

describe('get_my_projects', () => {
  it('returns empty array when client has no projects', async () => {
    const { projectHandlers } = await importModule();
    const res = await projectHandlers.get_my_projects({}, 10, 1);
    expect(res).toEqual([]);
  });

  it('does not return projects owned by other clients', async () => {
    seedProject({ id: 1, clientId: 10, name: 'Mine' });
    seedProject({ id: 2, clientId: 99, name: 'Theirs' });
    const { projectHandlers } = await importModule();
    const res = (await projectHandlers.get_my_projects({}, 10, 1)) as Array<
      Record<string, unknown>
    >;
    expect(res).toHaveLength(1);
    expect(res[0].name).toBe('Mine');
  });

  it('returns projected fields (id, name, description, status, startDate, dueDate)', async () => {
    seedProject({ id: 1, clientId: 10, name: 'P', status: 'active' });
    const { projectHandlers } = await importModule();
    const res = (await projectHandlers.get_my_projects({}, 10, 1)) as Array<
      Record<string, unknown>
    >;
    expect(res[0]).toMatchObject({ id: 1, name: 'P', status: 'active' });
    expect('description' in res[0]).toBe(true);
    expect('startDate' in res[0]).toBe(true);
    expect('dueDate' in res[0]).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// get_project_board
// ---------------------------------------------------------------------------

describe('get_project_board', () => {
  it('returns error when project not found', async () => {
    const { projectHandlers } = await importModule();
    const res = await projectHandlers.get_project_board({ project_id: 999 }, 10, 1);
    expect(res).toEqual({ error: 'Project not found' });
  });

  it('returns error when project belongs to another client', async () => {
    seedProject({ id: 1, clientId: 99 });
    const { projectHandlers } = await importModule();
    const res = await projectHandlers.get_project_board({ project_id: 1 }, 10, 1);
    expect(res).toEqual({ error: 'Project not found' });
  });

  it('returns board shape with columns and card counts', async () => {
    seedProject({ id: 1, clientId: 10, name: 'Board Project', status: 'active' });
    seedColumn({ id: 1, projectId: 1, name: 'To Do', order: 0 });
    seedColumn({ id: 2, projectId: 1, name: 'Done', order: 1 });
    seedCard({ id: 1, projectId: 1, columnId: 1 });
    seedCard({ id: 2, projectId: 1, columnId: 1 });
    seedCard({ id: 3, projectId: 1, columnId: 2 });
    const { projectHandlers } = await importModule();
    const res = (await projectHandlers.get_project_board({ project_id: 1 }, 10, 1)) as {
      project: Record<string, unknown>;
      columns: Array<Record<string, unknown>>;
      totalCards: number;
    };
    expect(res.project.name).toBe('Board Project');
    expect(res.totalCards).toBe(3);
    expect(res.columns).toHaveLength(2);
    const todoCol = res.columns.find((c) => c.name === 'To Do');
    const doneCol = res.columns.find((c) => c.name === 'Done');
    expect(todoCol?.cardCount).toBe(2);
    expect(doneCol?.cardCount).toBe(1);
  });

  it('returns 0 card count for empty columns', async () => {
    seedProject({ id: 1, clientId: 10, name: 'Empty' });
    seedColumn({ id: 1, projectId: 1, name: 'Backlog', order: 0 });
    const { projectHandlers } = await importModule();
    const res = (await projectHandlers.get_project_board({ project_id: 1 }, 10, 1)) as {
      columns: Array<Record<string, unknown>>;
      totalCards: number;
    };
    expect(res.totalCards).toBe(0);
    expect(res.columns[0].cardCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// get_project_cards
// ---------------------------------------------------------------------------

describe('get_project_cards', () => {
  it('returns error when project not found', async () => {
    const { projectHandlers } = await importModule();
    const res = await projectHandlers.get_project_cards({ project_id: 999 }, 10, 1);
    expect(res).toEqual({ error: 'Project not found' });
  });

  it('returns error when project belongs to another client', async () => {
    seedProject({ id: 1, clientId: 99 });
    const { projectHandlers } = await importModule();
    const res = await projectHandlers.get_project_cards({ project_id: 1 }, 10, 1);
    expect(res).toEqual({ error: 'Project not found' });
  });

  it('returns cards with column names and empty assignees when none set', async () => {
    seedProject({ id: 1, clientId: 10, name: 'Proj' });
    seedColumn({ id: 1, projectId: 1, name: 'In Progress' });
    seedCard({ id: 1, projectId: 1, columnId: 1, title: 'Fix bug' });
    const { projectHandlers } = await importModule();
    const res = (await projectHandlers.get_project_cards({ project_id: 1 }, 10, 1)) as Array<
      Record<string, unknown>
    >;
    expect(res).toHaveLength(1);
    expect(res[0].title).toBe('Fix bug');
    expect(res[0].column).toBe('In Progress');
    expect(res[0].assignees).toEqual([]);
  });

  it('returns empty array when project has no cards', async () => {
    seedProject({ id: 1, clientId: 10 });
    const { projectHandlers } = await importModule();
    const res = (await projectHandlers.get_project_cards({ project_id: 1 }, 10, 1)) as Array<
      Record<string, unknown>
    >;
    expect(res).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// get_sprint_progress
// ---------------------------------------------------------------------------

describe('get_sprint_progress', () => {
  it('returns error when project not found', async () => {
    const { projectHandlers } = await importModule();
    const res = await projectHandlers.get_sprint_progress({ project_id: 999 }, 10, 1);
    expect(res).toEqual({ error: 'Project not found' });
  });

  it('returns no-sprints message when project has no sprints', async () => {
    seedProject({ id: 1, clientId: 10 });
    const { projectHandlers } = await importModule();
    const res = await projectHandlers.get_sprint_progress({ project_id: 1 }, 10, 1);
    expect((res as Record<string, unknown>).message).toContain('No sprints');
  });

  it('returns sprint progress shape for active sprint', async () => {
    seedProject({ id: 1, clientId: 10, name: 'Sprint Proj' });
    seedColumn({ id: 1, projectId: 1, name: 'Done', order: 0, isDone: true });
    seedSprint({ id: 1, projectId: 1, status: 'active', name: 'Sprint 1' });
    seedCard({ id: 1, projectId: 1, columnId: 1, sprintId: 1 });
    seedCard({ id: 2, projectId: 1, columnId: 1, sprintId: 1 });
    const { projectHandlers } = await importModule();
    const res = (await projectHandlers.get_sprint_progress({ project_id: 1 }, 10, 1)) as {
      sprint: Record<string, unknown>;
      totalCards: number;
      doneCards: number;
      remainingCards: number;
    };
    expect(res.sprint.name).toBe('Sprint 1');
    expect(res.totalCards).toBe(2);
  });

  it('falls back to last sprint when no active sprint', async () => {
    seedProject({ id: 1, clientId: 10 });
    seedColumn({ id: 1, projectId: 1, name: 'Col', order: 0 });
    seedSprint({ id: 1, projectId: 1, status: 'completed', name: 'Past Sprint', order: 1 });
    const { projectHandlers } = await importModule();
    const res = (await projectHandlers.get_sprint_progress({ project_id: 1 }, 10, 1)) as {
      sprint: Record<string, unknown>;
    };
    expect(res.sprint.name).toBe('Past Sprint');
  });
});

// ---------------------------------------------------------------------------
// get_project_files
// ---------------------------------------------------------------------------

describe('get_project_files', () => {
  it('returns error when project not found', async () => {
    const { projectHandlers } = await importModule();
    const res = await projectHandlers.get_project_files({ project_id: 999 }, 10, 1);
    expect(res).toEqual({ error: 'Project not found' });
  });

  it('returns files scoped to project', async () => {
    seedProject({ id: 1, clientId: 10, name: 'Files Proj' });
    seedFile({ id: 1, projectId: 1, originalName: 'a.pdf' });
    seedFile({ id: 2, projectId: 2, originalName: 'b.pdf' });
    const { projectHandlers } = await importModule();
    const res = (await projectHandlers.get_project_files({ project_id: 1 }, 10, 1)) as {
      project: string;
      fileCount: number;
      files: Array<Record<string, unknown>>;
    };
    expect(res.project).toBe('Files Proj');
    expect(res.fileCount).toBe(1);
    expect(res.files[0].originalName).toBe('a.pdf');
  });

  it('returns fileCount=0 when no files', async () => {
    seedProject({ id: 1, clientId: 10, name: 'Empty Proj' });
    const { projectHandlers } = await importModule();
    const res = (await projectHandlers.get_project_files({ project_id: 1 }, 10, 1)) as {
      fileCount: number;
    };
    expect(res.fileCount).toBe(0);
  });
});

