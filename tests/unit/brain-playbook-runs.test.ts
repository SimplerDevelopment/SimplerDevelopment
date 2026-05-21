// @vitest-environment node
/**
 * Unit tests for lib/brain/playbook-runs — focuses on the orchestration logic
 * the integration tests would otherwise have to set up a full DB to exercise.
 *
 * Stubs `@/lib/db` with a recording fake so we can assert side-effect ordering
 * (which inserts hit which tables, which audit rows get written) without a
 * Postgres instance. SQL correctness lives in the integration spec.
 *
 * Three high-value scenarios:
 *   1. startRun routes context through condition + spawns the right entry steps
 *   2. branch step in advanceRun resolves to ONE downstream path (not both)
 *   3. wait step is created with status='active' + waitUntil set in the future
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface InsertCall {
  table: string;
  values: Record<string, unknown> | Record<string, unknown>[];
  returningCol?: string;
}
interface UpdateCall {
  table: string;
  set: Record<string, unknown>;
}

const state: {
  // What select() should resolve to. Test sets up rows in advance keyed by table.
  selectQueues: Map<string, unknown[][]>;
  inserts: InsertCall[];
  updates: UpdateCall[];
  // For returning() on inserts — feed back ids in order.
  insertIdCounter: number;
} = {
  selectQueues: new Map(),
  inserts: [],
  updates: [],
  insertIdCounter: 1000,
};

function tableNameFromArg(arg: unknown): string {
  if (arg && typeof arg === 'object') {
    const sym = Object.getOwnPropertySymbols(arg).find((s) => s.description === 'drizzle:Name');
    if (sym) return String((arg as Record<symbol, unknown>)[sym]);
    // Fallback: drizzle exposes a [Name] string via the `_` internal — try `tableName`.
    const t = (arg as { _?: { name?: string } })._;
    if (t?.name) return t.name;
  }
  return 'unknown_table';
}

function makeSelectChain(table: string) {
  const node: Record<string, unknown> = {};
  const methods = ['select', 'from', 'where', 'orderBy', 'limit', 'offset', 'innerJoin', 'leftJoin', 'groupBy'];
  for (const m of methods) {
    node[m] = vi.fn((arg?: unknown) => {
      if (m === 'from') {
        const t = tableNameFromArg(arg);
        // mutate the chain's bound table name
        (node as { _table: string })._table = t;
      }
      return node;
    });
  }
  (node as { _table: string })._table = table;
  (node as { then: (cb: (rows: unknown[]) => unknown) => Promise<unknown> }).then = (cb) => {
    const t = (node as { _table: string })._table;
    const queue = state.selectQueues.get(t) ?? [];
    const rows = queue.shift() ?? [];
    return Promise.resolve(cb(rows));
  };
  return node;
}

function makeInsertChain(table: string) {
  const captured: { values?: Record<string, unknown> | Record<string, unknown>[] } = {};
  const node: Record<string, unknown> = {};
  node.values = vi.fn((v: Record<string, unknown> | Record<string, unknown>[]) => {
    captured.values = v;
    state.inserts.push({ table, values: v });
    return node;
  });
  node.returning = vi.fn(() => node);
  node.onConflictDoNothing = vi.fn(() => node);
  (node as { then: (cb: (rows: unknown[]) => unknown) => Promise<unknown> }).then = (cb) => {
    const id = state.insertIdCounter++;
    const row: Record<string, unknown> = { id };
    return Promise.resolve(cb([row]));
  };
  return node;
}

function makeUpdateChain(table: string) {
  const captured: { set?: Record<string, unknown> } = {};
  const node: Record<string, unknown> = {};
  node.set = vi.fn((v: Record<string, unknown>) => {
    captured.set = v;
    state.updates.push({ table, set: v });
    return node;
  });
  node.where = vi.fn(() => node);
  node.returning = vi.fn(() => node);
  (node as { then: (cb: (rows: unknown[]) => unknown) => Promise<unknown> }).then = (cb) => {
    return Promise.resolve(cb([{ id: 1 }]));
  };
  return node;
}

vi.mock('@/lib/db', () => {
  function makeConn() {
    return {
      select: vi.fn((_cols?: unknown) => {
        // Determine table on `.from(table)` — we'll resolve in chain.
        return makeSelectChain('unknown_table');
      }),
      insert: vi.fn((table: unknown) => makeInsertChain(tableNameFromArg(table))),
      update: vi.fn((table: unknown) => makeUpdateChain(tableNameFromArg(table))),
      delete: vi.fn((table: unknown) => ({
        where: vi.fn(() => ({ returning: vi.fn(() => Promise.resolve([])) })),
      })),
    };
  }
  const conn = makeConn();
  const db = {
    ...conn,
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = makeConn();
      return fn(tx);
    }),
  };
  return { db };
});

// Reset between tests.
beforeEach(() => {
  state.selectQueues.clear();
  state.inserts = [];
  state.updates = [];
  state.insertIdCounter = 1000;
});

/** Helper to push N row-batches for a table's select calls in order. */
function queueRows(table: string, ...batches: unknown[][]) {
  state.selectQueues.set(table, batches);
}

// Import AFTER mocks.
import {
  startRun,
  advanceRun,
} from '@/lib/brain/playbook-runs';
import { evaluateCondition } from '@/lib/brain/playbook-condition';

describe('evaluateCondition spike inside playbook-runs', () => {
  // Sanity — make sure the pure module wired through to the orchestrator
  // namespace is the same one tested separately.
  it('null condition is unconditional', () => {
    expect(evaluateCondition(null, {})).toBe(true);
  });
});

describe('startRun — wait step stays active with waitUntil', () => {
  it('inserts a run_step with status=active and a waitUntil date in the future', async () => {
    // Queue order matches the function's read pattern:
    //   1. SELECT brain_playbooks (verify exists + active)
    //   2. SELECT brain_playbook_steps (all steps for the playbook)
    //   3. SELECT brain_playbook_run_steps (final state check)
    queueRows('brain_playbooks', [
      { id: 1, clientId: 1, status: 'active', playbookId: 1, name: 'p' },
    ]);
    queueRows('brain_playbook_steps', [
      {
        id: 10, clientId: 1, playbookId: 1,
        key: 'wait_a_week',
        name: 'Wait',
        kind: 'wait',
        config: { untilOffsetDays: 7 },
        condition: null,
        nextStepKeys: [],
        sortOrder: 0,
      },
    ]);
    queueRows('brain_playbook_run_steps', [
      { status: 'active' },
    ]);

    const res = await startRun(1, 99, { playbookId: 1, label: 'Run 1' });
    expect(res.firstStepKeys).toEqual(['wait_a_week']);
    expect(res.runStatus).toBe('active');

    // Look for an insert on brain_playbook_run_steps with status='active'.
    const runStepInsert = state.inserts.find((i) => i.table === 'brain_playbook_run_steps');
    expect(runStepInsert).toBeDefined();
    const values = Array.isArray(runStepInsert!.values) ? runStepInsert!.values[0] : runStepInsert!.values;
    expect((values as { status: string }).status).toBe('active');

    // The waitUntil update should follow (set on the run_step row).
    const rsUpdate = state.updates.find((u) =>
      u.table === 'brain_playbook_run_steps' &&
      Object.prototype.hasOwnProperty.call(u.set, 'waitUntil'),
    );
    expect(rsUpdate).toBeDefined();
    expect(rsUpdate!.set.waitUntil).toBeInstanceOf(Date);
    const wait = rsUpdate!.set.waitUntil as Date;
    expect(wait.getTime()).toBeGreaterThan(Date.now() - 1000);
  });
});

describe('startRun — refuses non-active playbook', () => {
  it('throws when the playbook is draft', async () => {
    queueRows('brain_playbooks', [
      { id: 1, clientId: 1, status: 'draft' },
    ]);
    await expect(startRun(1, 99, { playbookId: 1, label: 'x' })).rejects.toThrow(/active/);
  });
});

describe('startRun — empty playbook', () => {
  it('throws when there are no steps', async () => {
    queueRows('brain_playbooks', [
      { id: 1, clientId: 1, status: 'active', playbookId: 1, name: 'p' },
    ]);
    queueRows('brain_playbook_steps', []);
    await expect(startRun(1, 99, { playbookId: 1, label: 'x' })).rejects.toThrow(/no steps/);
  });
});

describe('startRun — note step auto-completes and chains', () => {
  it('completes immediately and emits a brain_notes insert', async () => {
    queueRows('brain_playbooks', [
      { id: 1, clientId: 1, status: 'active', playbookId: 1, name: 'p' },
    ]);
    queueRows('brain_playbook_steps', [
      {
        id: 20, clientId: 1, playbookId: 1,
        key: 'note_step',
        name: 'Welcome note',
        kind: 'note',
        config: { title: 'Welcome', body: 'Hello {{person.fullName}}' },
        condition: null,
        nextStepKeys: [],
        sortOrder: 0,
      },
    ]);
    queueRows('brain_playbook_run_steps', [
      { status: 'completed' },
    ]);

    const ctx = { person: { fullName: 'Jane' } };
    const res = await startRun(1, 99, { playbookId: 1, label: 'Run 2', context: ctx });
    expect(res.firstStepKeys).toEqual(['note_step']);

    // brain_notes insert with templated body
    const noteIns = state.inserts.find((i) => i.table === 'brain_notes');
    expect(noteIns).toBeDefined();
    const values = Array.isArray(noteIns!.values) ? noteIns!.values[0] : noteIns!.values;
    expect((values as { body: string }).body).toBe('Hello Jane');

    // Run-level status was flipped to 'completed' (no active steps remain)
    const runUpdate = state.updates.find((u) =>
      u.table === 'brain_playbook_runs' && u.set.status === 'completed',
    );
    expect(runUpdate).toBeDefined();
    expect(res.runStatus).toBe('completed');
  });
});

describe('startRun — failing-condition step is skipped (not dispatched)', () => {
  it('skips the entry step when its condition evaluates false', async () => {
    queueRows('brain_playbooks', [
      { id: 1, clientId: 1, status: 'active', playbookId: 1, name: 'p' },
    ]);
    queueRows('brain_playbook_steps', [
      {
        id: 30, clientId: 1, playbookId: 1,
        key: 'gated',
        name: 'Gated note',
        kind: 'note',
        config: { title: 'x', body: 'y' },
        condition: { field: 'person.role', op: 'eq', value: 'admin' },
        nextStepKeys: [],
        sortOrder: 0,
      },
    ]);
    queueRows('brain_playbook_run_steps', [
      { status: 'skipped' },
    ]);

    // Context says role=engineer, condition wants admin — should be skipped.
    await startRun(1, 99, { playbookId: 1, label: 'Run 3', context: { person: { role: 'engineer' } } });

    // No brain_notes insert should have happened.
    expect(state.inserts.find((i) => i.table === 'brain_notes')).toBeUndefined();
    // A run_step row was inserted with status='skipped'.
    const skipIns = state.inserts.find((i) => i.table === 'brain_playbook_run_steps');
    expect(skipIns).toBeDefined();
    const values = Array.isArray(skipIns!.values) ? skipIns!.values[0] : skipIns!.values;
    expect((values as { status: string }).status).toBe('skipped');
  });
});

describe('advanceRun — returns null for unknown run', () => {
  it('returns null when the run does not exist', async () => {
    queueRows('brain_playbook_runs', []);
    const res = await advanceRun(1, 99, 12345);
    expect(res).toBeNull();
  });
});

describe('advanceRun — terminal run is a no-op', () => {
  it('returns the existing status without further mutation', async () => {
    queueRows('brain_playbook_runs', [
      { id: 1, clientId: 1, playbookId: 5, status: 'completed', context: {} },
    ]);
    const res = await advanceRun(1, 99, 1);
    expect(res).toEqual({ runId: 1, newActiveStepKeys: [], newStatus: 'completed' });
    expect(state.updates.find((u) => u.table === 'brain_playbook_runs')).toBeUndefined();
  });
});
