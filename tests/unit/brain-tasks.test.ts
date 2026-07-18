// @vitest-environment node
/**
 * Unit tests for lib/brain/tasks.ts.
 *
 * Mocks `@/lib/db`, `@/lib/db/schema`, `drizzle-orm`, and `./audit` with a
 * chainable in-memory query builder. Each test seeds the state and reads it
 * back via the module under test.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface MockState {
  brainTasks: Array<Record<string, unknown>>;
  brainAuditLogs: Array<Record<string, unknown>>;
  projects: Array<Record<string, unknown>>;
  kanbanColumns: Array<Record<string, unknown>>;
  kanbanCards: Array<Record<string, unknown>>;
  /** Forced result for the `max()` aggregate select. */
  forcedMaxOrder: number | null;
  auditCalls: Array<Record<string, unknown>>;
}

const state: MockState = {
  brainTasks: [],
  brainAuditLogs: [],
  projects: [],
  kanbanColumns: [],
  kanbanCards: [],
  forcedMaxOrder: null,
  auditCalls: [],
};

vi.mock('@/lib/db/schema', () => {
  const wrap = (tableName: string) =>
    new Proxy(
      { __table: tableName },
      {
        get(_t, prop: string) {
          if (prop === '__table') return tableName;
          return { __col: prop, __table: tableName };
        },
      },
    );
  return new Proxy({
    brainTasks: wrap('brainTasks'),
    brainAuditLogs: wrap('brainAuditLogs'),
    projects: wrap('projects'),
    kanbanColumns: wrap('kanbanColumns'),
    kanbanCards: wrap('kanbanCards'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
  max: (a: unknown) => ({ op: 'max', a, __isMax: true }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
}));

vi.mock('@/lib/brain/audit', () => ({
  logAudit: vi.fn(async (args: Record<string, unknown>) => {
    state.auditCalls.push(args);
  }),
}));

function evalPredicate(filter: unknown, row: Record<string, unknown>): boolean {
  if (!filter) return true;
  if (typeof filter !== 'object') return true;
  const f = filter as { op?: string; a?: unknown; b?: unknown; list?: unknown[]; args?: unknown[] };
  switch (f.op) {
    case 'eq': {
      const col = f.a as { __col?: string } | undefined;
      if (!col?.__col) return true;
      return row[col.__col] === f.b;
    }
    case 'and':
      return (f.args ?? []).every((arg) => evalPredicate(arg, row));
    case 'or':
      return (f.args ?? []).some((arg) => evalPredicate(arg, row));
    case 'inArray': {
      const col = f.a as { __col?: string } | undefined;
      if (!col?.__col) return true;
      const list = (f.list ?? []) as unknown[];
      return list.includes(row[col.__col]);
    }
    default:
      return true;
  }
}

function projectRow(row: Record<string, unknown>, projection: Record<string, unknown> | null): Record<string, unknown> {
  if (!projection) return { ...row };
  const out: Record<string, unknown> = {};
  for (const [alias, ref] of Object.entries(projection)) {
    const r = ref as { __col?: string; __isMax?: boolean; a?: { __col?: string } } | undefined;
    if (r?.__isMax) {
      // The mock returns a single key — use the forcedMaxOrder fixture.
      out[alias] = state.forcedMaxOrder;
      continue;
    }
    out[alias] = r?.__col ? row[r.__col] : undefined;
  }
  return out;
}

function tableArray(name: string): Array<Record<string, unknown>> {
  return (state as unknown as Record<string, Array<Record<string, unknown>>>)[name] ?? [];
}

let idCounter = 1000;
function nextId(): number {
  return idCounter++;
}

vi.mock('@/lib/db', () => {
  function buildSelect(projection: Record<string, unknown> | null) {
    let activeTable: string | null = null;
    let filter: unknown = null;
    let limit: number | null = null;
    let offset: number | null = null;
    let isMaxQuery = false;
    if (projection) {
      for (const v of Object.values(projection)) {
        if ((v as { __isMax?: boolean } | undefined)?.__isMax) {
          isMaxQuery = true;
          break;
        }
      }
    }

    const chain: Record<string, unknown> = {
      from(table: { __table: string }) {
        activeTable = table.__table;
        return chain;
      },
      where(arg: unknown) {
        filter = arg;
        return chain;
      },
      orderBy() {
        return chain;
      },
      groupBy() {
        return chain;
      },
      limit(n: number) {
        limit = n;
        return chain;
      },
      offset(n: number) {
        offset = n;
        return runQuery();
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return runQuery().then(onFulfilled, onRejected);
      },
    };

    function runQuery(): Promise<Array<Record<string, unknown>>> {
      if (!activeTable) return Promise.resolve([]);

      if (isMaxQuery) {
        // Aggregate query — return one row containing the projected max alias.
        return Promise.resolve([projectRow({}, projection)]);
      }

      let rows = tableArray(activeTable).filter((r) => evalPredicate(filter, r));
      if (offset !== null) rows = rows.slice(offset);
      let out = rows.map((r) => projectRow(r, projection));
      if (limit !== null) out = out.slice(0, limit);
      return Promise.resolve(out);
    }

    return chain;
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(vals: Record<string, unknown> | Record<string, unknown>[]) {
        const arr = Array.isArray(vals) ? vals : [vals];
        const inserted = arr.map((v) => {
          const row = { ...v, id: nextId(), createdAt: new Date(), updatedAt: new Date() };
          tableArray(table.__table).push(row);
          return row;
        });
        return {
          returning() {
            return Promise.resolve(inserted);
          },
          then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
            return Promise.resolve(inserted).then(onFulfilled, onRejected);
          },
        };
      },
    };
  }

  function buildUpdate(table: { __table: string }) {
    return {
      set(patch: Record<string, unknown>) {
        return {
          where(filter: unknown) {
            const rows = tableArray(table.__table).filter((r) => evalPredicate(filter, r));
            for (const r of rows) Object.assign(r, patch);
            return {
              returning() {
                return Promise.resolve(rows.map((r) => ({ ...r })));
              },
              then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
                return Promise.resolve(rows.map((r) => ({ ...r }))).then(onFulfilled, onRejected);
              },
            };
          },
        };
      },
    };
  }

  function buildDelete(table: { __table: string }) {
    return {
      where(filter: unknown) {
        const all = tableArray(table.__table);
        const matched: Array<Record<string, unknown>> = [];
        const remaining: Array<Record<string, unknown>> = [];
        for (const r of all) {
          if (evalPredicate(filter, r)) matched.push(r);
          else remaining.push(r);
        }
        all.length = 0;
        all.push(...remaining);
        return {
          returning() {
            return Promise.resolve(matched.map((r) => ({ id: r.id })));
          },
        };
      },
    };
  }

  const dbObj = {
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
    delete(table: { __table: string }) {
      return buildDelete(table);
    },
    transaction<T>(fn: (tx: typeof dbObj) => Promise<T>): Promise<T> {
      return fn(dbObj);
    },
  };

  return { db: dbObj };
});

beforeEach(() => {
  state.brainTasks.length = 0;
  state.brainAuditLogs.length = 0;
  state.projects.length = 0;
  state.kanbanColumns.length = 0;
  state.kanbanCards.length = 0;
  state.auditCalls.length = 0;
  state.forcedMaxOrder = null;
  idCounter = 1000;
});

async function importModule() {
  return await import('@/lib/brain/tasks');
}

// ---------------------------------------------------------------------------
// listTasks
// ---------------------------------------------------------------------------

describe('listTasks', () => {
  it('returns [] when no tasks exist for the client', async () => {
    const { listTasks } = await importModule();
    const rows = await listTasks(1);
    expect(rows).toEqual([]);
  });

  it('returns only tasks for the requested client', async () => {
    state.brainTasks.push(
      { id: 1, clientId: 1, title: 'Mine', status: 'open' },
      { id: 2, clientId: 2, title: 'Theirs', status: 'open' },
    );
    const { listTasks } = await importModule();
    const rows = await listTasks(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(1);
  });

  it('filters by single status', async () => {
    state.brainTasks.push(
      { id: 1, clientId: 1, title: 'A', status: 'open' },
      { id: 2, clientId: 1, title: 'B', status: 'done' },
    );
    const { listTasks } = await importModule();
    const rows = await listTasks(1, { status: 'open' });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('open');
  });

  it('filters by status array (inArray branch)', async () => {
    state.brainTasks.push(
      { id: 1, clientId: 1, title: 'A', status: 'open' },
      { id: 2, clientId: 1, title: 'B', status: 'in_progress' },
      { id: 3, clientId: 1, title: 'C', status: 'done' },
    );
    const { listTasks } = await importModule();
    const rows = await listTasks(1, { status: ['open', 'in_progress'] as never });
    expect(rows).toHaveLength(2);
  });

  it('filters by ownerId', async () => {
    state.brainTasks.push(
      { id: 1, clientId: 1, ownerId: 7, status: 'open' },
      { id: 2, clientId: 1, ownerId: 8, status: 'open' },
    );
    const { listTasks } = await importModule();
    const rows = await listTasks(1, { ownerId: 7 });
    expect(rows).toHaveLength(1);
    expect(rows[0].ownerId).toBe(7);
  });

  it('filters by meetingId', async () => {
    state.brainTasks.push(
      { id: 1, clientId: 1, meetingId: 100, status: 'open' },
      { id: 2, clientId: 1, meetingId: 200, status: 'open' },
    );
    const { listTasks } = await importModule();
    const rows = await listTasks(1, { meetingId: 100 });
    expect(rows).toHaveLength(1);
    expect(rows[0].meetingId).toBe(100);
  });

  it('filters by needsReview', async () => {
    state.brainTasks.push(
      { id: 1, clientId: 1, needsReview: true, status: 'open' },
      { id: 2, clientId: 1, needsReview: false, status: 'open' },
    );
    const { listTasks } = await importModule();
    const rows = await listTasks(1, { needsReview: true });
    expect(rows).toHaveLength(1);
    expect(rows[0].needsReview).toBe(true);
  });

  it('respects the custom limit option', async () => {
    for (let i = 0; i < 5; i++) {
      state.brainTasks.push({ id: i + 1, clientId: 1, status: 'open', title: `T${i}` });
    }
    const { listTasks } = await importModule();
    const rows = await listTasks(1, { limit: 3 });
    expect(rows).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// getTask
// ---------------------------------------------------------------------------

describe('getTask', () => {
  it('returns null when no matching task exists', async () => {
    const { getTask } = await importModule();
    const res = await getTask(1, 999);
    expect(res).toBeNull();
  });

  it('returns the task when found within the client', async () => {
    state.brainTasks.push({ id: 7, clientId: 1, title: 'Found me', status: 'open' });
    const { getTask } = await importModule();
    const res = await getTask(1, 7);
    expect(res).not.toBeNull();
    expect(res!.title).toBe('Found me');
  });

  it('does not leak tasks across clients', async () => {
    state.brainTasks.push({ id: 7, clientId: 2, title: 'Other client', status: 'open' });
    const { getTask } = await importModule();
    const res = await getTask(1, 7);
    expect(res).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createTask
// ---------------------------------------------------------------------------

describe('createTask', () => {
  it('creates with sane defaults when only required fields supplied', async () => {
    const { createTask } = await importModule();
    const created = await createTask({ clientId: 1, title: 'Hello' });
    expect(created.title).toBe('Hello');
    expect(created.status).toBe('open');
    expect(created.priority).toBe('medium');
    expect(created.source).toBe('manual');
    expect(created.createdByAi).toBe(false);
    expect(created.needsReview).toBe(false);
    expect(created.complianceFlag).toBe(false);
    expect(created.ownerId).toBeNull();
    expect(created.meetingId).toBeNull();
    expect(created.dueDate).toBeNull();
    expect(created.createdBy).toBeNull();
    expect(state.brainTasks).toHaveLength(1);
  });

  it('honors fully-specified input fields', async () => {
    const due = new Date('2026-01-01');
    const { createTask } = await importModule();
    const created = await createTask({
      clientId: 1,
      meetingId: 99,
      title: 'Detailed',
      description: 'do the thing',
      ownerId: 5,
      status: 'in_progress' as never,
      priority: 'urgent',
      dueDate: due,
      source: 'ai_suggestion',
      createdByAi: true,
      needsReview: true,
      complianceFlag: true,
      createdBy: 42,
    });
    expect(created.meetingId).toBe(99);
    expect(created.ownerId).toBe(5);
    expect(created.status).toBe('in_progress');
    expect(created.priority).toBe('urgent');
    expect(created.dueDate).toBe(due);
    expect(created.source).toBe('ai_suggestion');
    expect(created.createdByAi).toBe(true);
    expect(created.needsReview).toBe(true);
    expect(created.complianceFlag).toBe(true);
    expect(created.createdBy).toBe(42);
    expect(created.description).toBe('do the thing');
  });

  it('truncates titles longer than 500 chars', async () => {
    const longTitle = 'x'.repeat(600);
    const { createTask } = await importModule();
    const created = await createTask({ clientId: 1, title: longTitle });
    expect((created.title as string).length).toBe(500);
  });

  it('uses the provided tx connection when opts.tx is set', async () => {
    const fakeTx = {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(async () => [{ id: 42, title: 'via tx' }]),
        })),
      })),
    };
    const { createTask } = await importModule();
    const created = await createTask({ clientId: 1, title: 'via tx' }, { tx: fakeTx as never });
    expect(fakeTx.insert).toHaveBeenCalledTimes(1);
    expect(created.title).toBe('via tx');
  });
});

// ---------------------------------------------------------------------------
// updateTask
// ---------------------------------------------------------------------------

describe('updateTask', () => {
  it('returns null when the task does not exist', async () => {
    const { updateTask } = await importModule();
    const res = await updateTask(1, 999, { title: 'nope' }, 2);
    expect(res).toBeNull();
    expect(state.auditCalls).toHaveLength(0);
  });

  it('updates fields and logs an audit entry with changed field names', async () => {
    state.brainTasks.push({
      id: 5,
      clientId: 1,
      title: 'old',
      description: 'old desc',
      priority: 'low',
      status: 'open',
    });
    const { updateTask } = await importModule();
    const res = await updateTask(
      1,
      5,
      { title: 'new', priority: 'high' },
      99,
    );
    expect(res).not.toBeNull();
    expect(res!.title).toBe('new');
    expect(res!.priority).toBe('high');
    expect(state.auditCalls).toHaveLength(1);
    const audit = state.auditCalls[0];
    expect(audit.action).toBe('task.updated');
    expect(audit.entityType).toBe('brain_task');
    expect(audit.entityId).toBe(5);
    const meta = audit.metadata as { changedFields: string[] };
    expect(meta.changedFields).toEqual(expect.arrayContaining(['title', 'priority']));
  });

  it('passes null actorId through to logAudit', async () => {
    state.brainTasks.push({ id: 6, clientId: 1, title: 'old', status: 'open' });
    const { updateTask } = await importModule();
    await updateTask(1, 6, { title: 'fresh' }, null);
    expect(state.auditCalls[0].actorId).toBeNull();
  });

  it('does not leak updates across clients', async () => {
    state.brainTasks.push({ id: 7, clientId: 2, title: 'other', status: 'open' });
    const { updateTask } = await importModule();
    const res = await updateTask(1, 7, { title: 'hijack' }, 99);
    expect(res).toBeNull();
    expect(state.brainTasks[0].title).toBe('other');
  });
});

// ---------------------------------------------------------------------------
// deleteTask
// ---------------------------------------------------------------------------

describe('deleteTask', () => {
  it('returns false when nothing was deleted (no audit log)', async () => {
    const { deleteTask } = await importModule();
    const ok = await deleteTask(1, 999, 2);
    expect(ok).toBe(false);
    expect(state.auditCalls).toHaveLength(0);
  });

  it('deletes the task and writes an audit entry', async () => {
    state.brainTasks.push({ id: 10, clientId: 1, title: 'goodbye' });
    const { deleteTask } = await importModule();
    const ok = await deleteTask(1, 10, 5);
    expect(ok).toBe(true);
    expect(state.brainTasks).toHaveLength(0);
    expect(state.auditCalls[0]).toMatchObject({
      action: 'task.deleted',
      entityType: 'brain_task',
      entityId: 10,
      actorId: 5,
    });
  });

  it('does not delete tasks belonging to another client', async () => {
    state.brainTasks.push({ id: 11, clientId: 2, title: 'theirs' });
    const { deleteTask } = await importModule();
    const ok = await deleteTask(1, 11, 5);
    expect(ok).toBe(false);
    expect(state.brainTasks).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// promoteTaskToKanban
// ---------------------------------------------------------------------------

describe('promoteTaskToKanban', () => {
  it('throws when the brain task is missing', async () => {
    const { promoteTaskToKanban } = await importModule();
    await expect(
      promoteTaskToKanban({ clientId: 1, taskId: 999, projectId: 1, actorId: 2 }),
    ).rejects.toThrow(/brain task not found/i);
  });

  it('throws when the project does not belong to the client', async () => {
    state.brainTasks.push({ id: 1, clientId: 1, title: 'T', priority: 'medium', description: null, dueDate: null });
    const { promoteTaskToKanban } = await importModule();
    await expect(
      promoteTaskToKanban({ clientId: 1, taskId: 1, projectId: 999, actorId: 2 }),
    ).rejects.toThrow(/project not found/i);
  });

  it('throws when the provided columnId is not in the project', async () => {
    state.brainTasks.push({ id: 1, clientId: 1, title: 'T', priority: 'medium', description: null, dueDate: null });
    state.projects.push({ id: 50, clientId: 1, name: 'P' });
    state.kanbanColumns.push({ id: 100, projectId: 999, order: 0, isDone: false, name: 'wrong project' });
    const { promoteTaskToKanban } = await importModule();
    await expect(
      promoteTaskToKanban({ clientId: 1, taskId: 1, projectId: 50, columnId: 100, actorId: 2 }),
    ).rejects.toThrow(/column not found/i);
  });

  it('throws when the project has no columns and none was provided', async () => {
    state.brainTasks.push({ id: 1, clientId: 1, title: 'T', priority: 'medium', description: null, dueDate: null });
    state.projects.push({ id: 50, clientId: 1, name: 'P' });
    const { promoteTaskToKanban } = await importModule();
    await expect(
      promoteTaskToKanban({ clientId: 1, taskId: 1, projectId: 50, actorId: 2 }),
    ).rejects.toThrow(/no kanban columns/i);
  });

  it('creates a kanban card, links the task, and writes an audit log', async () => {
    state.brainTasks.push({
      id: 1,
      clientId: 1,
      title: 'Ship it',
      description: 'desc',
      priority: 'high',
      dueDate: null,
      linkedKanbanCardId: null,
    });
    state.projects.push({ id: 50, clientId: 1, name: 'P' });
    state.kanbanColumns.push(
      { id: 100, projectId: 50, order: 0, isDone: false, name: 'Todo' },
      { id: 101, projectId: 50, order: 1, isDone: true, name: 'Done' },
    );
    state.forcedMaxOrder = 2;
    const { promoteTaskToKanban } = await importModule();
    const result = await promoteTaskToKanban({ clientId: 1, taskId: 1, projectId: 50, actorId: 9 });
    expect(result.projectId).toBe(50);
    expect(result.columnId).toBe(100); // first non-done column
    expect(state.kanbanCards).toHaveLength(1);
    expect(state.kanbanCards[0].title).toBe('Ship it');
    expect(state.kanbanCards[0].priority).toBe('high');
    expect(state.kanbanCards[0].order).toBe(3); // max(2) + 1
    expect(state.kanbanCards[0].createdBy).toBe(9);
    // Brain task got linked.
    expect(state.brainTasks[0].linkedKanbanCardId).toBe(result.cardId);
    // Audit log recorded.
    expect(state.brainAuditLogs.some((a) => a.action === 'task.promoted_to_kanban')).toBe(true);
  });

  it('falls back to order=0 when no cards yet exist in the column', async () => {
    state.brainTasks.push({
      id: 2,
      clientId: 1,
      title: 'Solo',
      description: null,
      priority: 'medium',
      dueDate: null,
      linkedKanbanCardId: null,
    });
    state.projects.push({ id: 51, clientId: 1, name: 'P2' });
    state.kanbanColumns.push({ id: 200, projectId: 51, order: 0, isDone: false, name: 'Todo' });
    state.forcedMaxOrder = null; // max() returns null when column is empty
    const { promoteTaskToKanban } = await importModule();
    const result = await promoteTaskToKanban({ clientId: 1, taskId: 2, projectId: 51, actorId: 9 });
    expect(state.kanbanCards[0].order).toBe(0); // -1 + 1
    expect(result.columnId).toBe(200);
  });

  it('uses the supplied columnId when valid', async () => {
    state.brainTasks.push({
      id: 3,
      clientId: 1,
      title: 'Targeted',
      description: null,
      priority: 'low',
      dueDate: null,
      linkedKanbanCardId: null,
    });
    state.projects.push({ id: 52, clientId: 1, name: 'P3' });
    state.kanbanColumns.push(
      { id: 300, projectId: 52, order: 0, isDone: false, name: 'Todo' },
      { id: 301, projectId: 52, order: 1, isDone: false, name: 'Doing' },
    );
    state.forcedMaxOrder = null;
    const { promoteTaskToKanban } = await importModule();
    const result = await promoteTaskToKanban({
      clientId: 1,
      taskId: 3,
      projectId: 52,
      columnId: 301,
      actorId: 9,
    });
    expect(result.columnId).toBe(301);
  });

  it('falls back to the first column when every column is done', async () => {
    state.brainTasks.push({
      id: 4,
      clientId: 1,
      title: 'AllDone',
      description: null,
      priority: 'medium',
      dueDate: null,
      linkedKanbanCardId: null,
    });
    state.projects.push({ id: 53, clientId: 1, name: 'P4' });
    state.kanbanColumns.push(
      { id: 400, projectId: 53, order: 0, isDone: true, name: 'Done1' },
      { id: 401, projectId: 53, order: 1, isDone: true, name: 'Done2' },
    );
    state.forcedMaxOrder = null;
    const { promoteTaskToKanban } = await importModule();
    const result = await promoteTaskToKanban({ clientId: 1, taskId: 4, projectId: 53, actorId: 9 });
    expect([400, 401]).toContain(result.columnId);
  });

  it('coerces an invalid priority to "medium" for the kanban card', async () => {
    state.brainTasks.push({
      id: 5,
      clientId: 1,
      title: 'Weird Prio',
      description: null,
      priority: 'gigantic', // not in allow-list
      dueDate: null,
      linkedKanbanCardId: null,
    });
    state.projects.push({ id: 54, clientId: 1, name: 'P5' });
    state.kanbanColumns.push({ id: 500, projectId: 54, order: 0, isDone: false, name: 'Todo' });
    state.forcedMaxOrder = null;
    const { promoteTaskToKanban } = await importModule();
    await promoteTaskToKanban({ clientId: 1, taskId: 5, projectId: 54, actorId: 9 });
    expect(state.kanbanCards[0].priority).toBe('medium');
  });

  it('is idempotent — returns the existing link when task is already promoted', async () => {
    state.brainTasks.push({
      id: 6,
      clientId: 1,
      title: 'Already linked',
      description: null,
      priority: 'medium',
      dueDate: null,
      linkedKanbanCardId: 777,
    });
    state.kanbanCards.push({ id: 777, projectId: 60, columnId: 600, title: 'pre-existing', order: 0 });
    // Project + column don't even need to exist for this branch — we exit early.
    state.projects.push({ id: 60, clientId: 1, name: 'P6' });
    const { promoteTaskToKanban } = await importModule();
    const result = await promoteTaskToKanban({ clientId: 1, taskId: 6, projectId: 60, actorId: 9 });
    expect(result.cardId).toBe(777);
    expect(result.projectId).toBe(60);
    expect(result.columnId).toBe(600);
    // No new card written.
    expect(state.kanbanCards).toHaveLength(1);
  });

  it('re-promotes when the linkedKanbanCardId is stale (card missing)', async () => {
    state.brainTasks.push({
      id: 7,
      clientId: 1,
      title: 'Stale link',
      description: null,
      priority: 'medium',
      dueDate: null,
      linkedKanbanCardId: 9999, // doesn't exist in kanbanCards
    });
    state.projects.push({ id: 70, clientId: 1, name: 'P7' });
    state.kanbanColumns.push({ id: 700, projectId: 70, order: 0, isDone: false, name: 'Todo' });
    state.forcedMaxOrder = null;
    const { promoteTaskToKanban } = await importModule();
    const result = await promoteTaskToKanban({ clientId: 1, taskId: 7, projectId: 70, actorId: 9 });
    expect(result.cardId).not.toBe(9999);
    expect(state.kanbanCards).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// listPromotionTargets
// ---------------------------------------------------------------------------

describe('listPromotionTargets', () => {
  it('returns [] when no projects exist', async () => {
    const { listPromotionTargets } = await importModule();
    const rows = await listPromotionTargets(1);
    expect(rows).toEqual([]);
  });

  it('returns active and paused projects with their columns inlined', async () => {
    state.projects.push(
      { id: 10, clientId: 1, name: 'Active P', projectKey: 'AP', status: 'active' },
      { id: 11, clientId: 1, name: 'Paused P', projectKey: null, status: 'paused' },
      { id: 12, clientId: 1, name: 'Archived', projectKey: 'AR', status: 'archived' }, // filtered out
      { id: 13, clientId: 2, name: 'Other client', projectKey: null, status: 'active' }, // wrong client
    );
    state.kanbanColumns.push(
      { id: 100, projectId: 10, name: 'Todo', isDone: false, order: 0 },
      { id: 101, projectId: 10, name: 'Done', isDone: true, order: 1 },
      { id: 102, projectId: 11, name: 'Backlog', isDone: false, order: 0 },
    );
    const { listPromotionTargets } = await importModule();
    const rows = await listPromotionTargets(1);
    expect(rows).toHaveLength(2);
    const active = rows.find((r) => r.id === 10)!;
    expect(active.name).toBe('Active P');
    expect(active.projectKey).toBe('AP');
    expect(active.columns).toEqual([
      { id: 100, name: 'Todo', isDone: false },
      { id: 101, name: 'Done', isDone: true },
    ]);
    const paused = rows.find((r) => r.id === 11)!;
    expect(paused.columns).toEqual([{ id: 102, name: 'Backlog', isDone: false }]);
  });

  it('returns projects with an empty columns array when there are no columns', async () => {
    state.projects.push({ id: 20, clientId: 1, name: 'Empty', projectKey: null, status: 'active' });
    const { listPromotionTargets } = await importModule();
    const rows = await listPromotionTargets(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].columns).toEqual([]);
  });
});
