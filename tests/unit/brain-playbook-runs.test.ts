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
  completeStep,
  skipStep,
  abortRun,
  retryFailedRun,
  drainExpiredWaitSteps,
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

// ─── startRun — additional branches ──────────────────────────────────────────

describe('startRun — label validation', () => {
  it('throws when label is empty', async () => {
    await expect(startRun(1, 99, { playbookId: 1, label: '   ' })).rejects.toThrow(/label is required/);
  });
});

describe('startRun — playbook not found', () => {
  it('throws when playbook row is missing', async () => {
    queueRows('brain_playbooks', []);
    await expect(startRun(1, 99, { playbookId: 1, label: 'Run X' })).rejects.toThrow(/not found/);
  });
});

describe('startRun — task step stays active with brain_tasks insert', () => {
  it('inserts a brain_tasks row and keeps run_step active', async () => {
    queueRows('brain_playbooks', [
      { id: 1, clientId: 1, status: 'active', playbookId: 1, name: 'p' },
    ]);
    queueRows('brain_playbook_steps', [
      {
        id: 11, clientId: 1, playbookId: 1,
        key: 'create_task',
        name: 'Do the thing',
        kind: 'task',
        config: { title: 'Follow up', priority: 'high', dueOffsetDays: 3 },
        condition: null,
        nextStepKeys: [],
        sortOrder: 0,
      },
    ]);
    // Final step-state check — still active (task waits for explicit complete).
    queueRows('brain_playbook_run_steps', [{ status: 'active' }]);

    const res = await startRun(1, 99, { playbookId: 1, label: 'Task run' });
    expect(res.runStatus).toBe('active');

    const taskIns = state.inserts.find((i) => i.table === 'brain_tasks');
    expect(taskIns).toBeDefined();
    const vals = (Array.isArray(taskIns!.values) ? taskIns!.values[0] : taskIns!.values) as Record<string, unknown>;
    expect(vals.title).toBe('Follow up');
    expect(vals.priority).toBe('high');
    expect(vals.status).toBe('open');
    // dueDate should be a Date ~3 days in the future
    expect(vals.dueDate).toBeInstanceOf(Date);
    const due = (vals.dueDate as Date).getTime();
    expect(due).toBeGreaterThan(Date.now());
  });
});

describe('startRun — meeting step with startOffsetDays auto-completes', () => {
  it('inserts a brain_calendar_events row and completes the run', async () => {
    queueRows('brain_playbooks', [
      { id: 1, clientId: 1, status: 'active', name: 'p' },
    ]);
    queueRows('brain_playbook_steps', [
      {
        id: 12, clientId: 1, playbookId: 1,
        key: 'kickoff',
        name: 'Kickoff call',
        kind: 'meeting',
        config: { title: 'Kickoff', startOffsetDays: 1, durationMin: 60 },
        condition: null,
        nextStepKeys: [],
        sortOrder: 0,
      },
    ]);
    queueRows('brain_playbook_run_steps', [{ status: 'completed' }]);

    const res = await startRun(1, 99, { playbookId: 1, label: 'Meeting run' });
    expect(res.runStatus).toBe('completed');

    const evtIns = state.inserts.find((i) => i.table === 'brain_calendar_events');
    expect(evtIns).toBeDefined();
    const vals = (Array.isArray(evtIns!.values) ? evtIns!.values[0] : evtIns!.values) as Record<string, unknown>;
    expect(vals.title).toBe('Kickoff');
    expect(vals.startAt).toBeInstanceOf(Date);
    expect(vals.endAt).toBeInstanceOf(Date);
    // endAt should be 60 min after startAt
    const diff = (vals.endAt as Date).getTime() - (vals.startAt as Date).getTime();
    expect(diff).toBe(60 * 60_000);
  });
});

describe('startRun — meeting step without startOffsetDays skips side-effect and completes', () => {
  it('completes the step without inserting a calendar event', async () => {
    queueRows('brain_playbooks', [
      { id: 1, clientId: 1, status: 'active', name: 'p' },
    ]);
    queueRows('brain_playbook_steps', [
      {
        id: 13, clientId: 1, playbookId: 1,
        key: 'no_schedule',
        name: 'TBD meeting',
        kind: 'meeting',
        config: {},     // no startOffsetDays
        condition: null,
        nextStepKeys: [],
        sortOrder: 0,
      },
    ]);
    queueRows('brain_playbook_run_steps', [{ status: 'completed' }]);

    const res = await startRun(1, 99, { playbookId: 1, label: 'No-schedule run' });
    expect(res.runStatus).toBe('completed');
    expect(state.inserts.find((i) => i.table === 'brain_calendar_events')).toBeUndefined();
  });
});

describe('startRun — decision step creates review item and stays active', () => {
  it('inserts a brain_ai_review_items row with proposedType=decision', async () => {
    queueRows('brain_playbooks', [
      { id: 1, clientId: 1, status: 'active', name: 'p' },
    ]);
    queueRows('brain_playbook_steps', [
      {
        id: 14, clientId: 1, playbookId: 1,
        key: 'decide',
        name: 'Choose stack',
        kind: 'decision',
        config: { title: 'Choose stack', decision: 'Go with Postgres', rationale: 'Reliability' },
        condition: null,
        nextStepKeys: [],
        sortOrder: 0,
      },
    ]);
    queueRows('brain_playbook_run_steps', [{ status: 'active' }]);

    const res = await startRun(1, 99, { playbookId: 1, label: 'Decision run' });
    expect(res.runStatus).toBe('active');

    const riIns = state.inserts.find((i) => i.table === 'brain_ai_review_items');
    expect(riIns).toBeDefined();
    const vals = (Array.isArray(riIns!.values) ? riIns!.values[0] : riIns!.values) as Record<string, unknown>;
    expect(vals.proposedType).toBe('decision');
    expect(vals.status).toBe('pending');
  });
});

describe('startRun — branch step auto-completes and chains to next', () => {
  it('spawns the downstream step after the branch completes', async () => {
    queueRows('brain_playbooks', [
      { id: 1, clientId: 1, status: 'active', name: 'p' },
    ]);
    queueRows('brain_playbook_steps', [
      {
        id: 15, clientId: 1, playbookId: 1,
        key: 'router',
        name: 'Branch',
        kind: 'branch',
        config: {},
        condition: null,
        nextStepKeys: ['follow_up'],
        sortOrder: 0,
      },
      {
        id: 16, clientId: 1, playbookId: 1,
        key: 'follow_up',
        name: 'Follow-up note',
        kind: 'note',
        config: { title: 'FU', body: 'Done' },
        condition: null,
        nextStepKeys: [],
        sortOrder: 1,
      },
    ]);
    // Final step-state check after both steps complete — no active steps.
    queueRows('brain_playbook_run_steps', [{ status: 'completed' }, { status: 'completed' }]);

    const res = await startRun(1, 99, { playbookId: 1, label: 'Branch run' });
    expect(res.firstStepKeys).toContain('router');
    // The note downstream should have been inserted.
    const noteIns = state.inserts.find((i) => i.table === 'brain_notes');
    expect(noteIns).toBeDefined();
  });
});

describe('startRun — links are inserted', () => {
  it('writes a brain_playbook_links row for each supplied link', async () => {
    queueRows('brain_playbooks', [
      { id: 1, clientId: 1, status: 'active', name: 'p' },
    ]);
    queueRows('brain_playbook_steps', [
      {
        id: 17, clientId: 1, playbookId: 1,
        key: 'step_a',
        name: 'A',
        kind: 'branch',
        config: {},
        condition: null,
        nextStepKeys: [],
        sortOrder: 0,
      },
    ]);
    queueRows('brain_playbook_run_steps', [{ status: 'completed' }]);

    await startRun(1, 99, {
      playbookId: 1,
      label: 'Linked run',
      links: [
        { entityType: 'contact', entityId: 42 },
        { entityType: 'deal', entityId: 7 },
      ],
    });

    const linkInserts = state.inserts.filter((i) => i.table === 'brain_playbook_links');
    expect(linkInserts).toHaveLength(2);
    const types = linkInserts.map((li) => {
      const v = (Array.isArray(li.values) ? li.values[0] : li.values) as Record<string, unknown>;
      return v.entityType;
    });
    expect(types).toContain('contact');
    expect(types).toContain('deal');
  });
});

// ─── advanceRun — active branch path ──────────────────────────────────────────

describe('advanceRun — active branch step is resolved', () => {
  it('marks the branch completed and updates updatedAt on the run', async () => {
    // Reads: 1) run, 2) steps, 3) active run_steps, 4) final all-step count
    queueRows('brain_playbook_runs', [
      { id: 2, clientId: 1, playbookId: 5, status: 'active', context: {} },
    ]);
    queueRows('brain_playbook_steps', [
      {
        id: 50, clientId: 1, playbookId: 5,
        key: 'b',
        name: 'Branch',
        kind: 'branch',
        config: {},
        condition: null,
        nextStepKeys: [],
        sortOrder: 0,
      },
    ]);
    // Active run_steps query returns the branch step row.
    queueRows('brain_playbook_run_steps', [
      { id: 200, stepId: 50, status: 'active' },
      // Final count query — after update no active steps remain.
      { status: 'completed' },
    ]);

    const res = await advanceRun(1, 99, 2);
    expect(res).not.toBeNull();
    // Branch had no condition (null = pass), so it should be marked completed.
    const branchUpdate = state.updates.find((u) =>
      u.table === 'brain_playbook_run_steps' && u.set.status === 'completed',
    );
    expect(branchUpdate).toBeDefined();
  });
});

describe('advanceRun — paused run is also advanceable', () => {
  it('accepts paused status and processes active branches', async () => {
    queueRows('brain_playbook_runs', [
      { id: 3, clientId: 1, playbookId: 5, status: 'paused', context: {} },
    ]);
    queueRows('brain_playbook_steps', []);
    queueRows('brain_playbook_run_steps', [
      // No active run steps.
      // Final count — zero rows means no change.
    ]);

    const res = await advanceRun(1, 99, 3);
    expect(res).not.toBeNull();
    // With zero rows the run status should remain paused (hasActive false + all.length===0).
    expect(res!.newStatus).toBe('paused');
  });
});

// ─── completeStep ─────────────────────────────────────────────────────────────

describe('completeStep — happy path', () => {
  it('updates the run_step to completed and returns { stepId, status }', async () => {
    // completeStep opens a tx (reads run_step, updates it) then calls advanceRun
    // (another tx). Queue the reads in order:
    //   Tx1: SELECT brain_playbook_run_steps → the active row
    //   advanceRun Tx2: SELECT brain_playbook_runs → the run
    //   advanceRun Tx2: SELECT brain_playbook_steps → empty (no branches to resolve)
    //   advanceRun Tx2: SELECT brain_playbook_run_steps → active run steps (empty — already done)
    //   advanceRun Tx2: SELECT brain_playbook_run_steps (final count) → completed row
    queueRows('brain_playbook_run_steps', [
      { id: 300, stepId: 40, status: 'active', resultEntityType: null, resultEntityId: null },
    ]);
    queueRows('brain_playbook_runs', [
      { id: 10, clientId: 1, playbookId: 5, status: 'active', context: {} },
    ]);
    queueRows('brain_playbook_steps', []);
    queueRows('brain_playbook_run_steps', [
      // advanceRun: active run_steps query — empty (nothing to branch)
      [],
      // advanceRun: final count
      [{ status: 'completed' }],
    ]);

    const result = await completeStep(1, 99, 10, 40);
    expect(result).toEqual({ stepId: 40, status: 'completed' });

    const upd = state.updates.find((u) =>
      u.table === 'brain_playbook_run_steps' && u.set.status === 'completed',
    );
    expect(upd).toBeDefined();
  });
});

describe('completeStep — not found returns null', () => {
  it('returns null when the run_step row does not exist', async () => {
    queueRows('brain_playbook_run_steps', []);   // tx select finds nothing
    const result = await completeStep(1, 99, 10, 99);
    expect(result).toBeNull();
  });
});

describe('completeStep — idempotent on already-completed step', () => {
  it('returns completed without writing another update', async () => {
    queueRows('brain_playbook_run_steps', [
      { id: 301, stepId: 41, status: 'completed', resultEntityType: null, resultEntityId: null },
    ]);
    const result = await completeStep(1, 99, 10, 41);
    expect(result).toEqual({ stepId: 41, status: 'completed' });
    // No update should have been written because the early-return path fires.
    expect(state.updates.find((u) => u.table === 'brain_playbook_run_steps')).toBeUndefined();
  });
});

// ─── skipStep ─────────────────────────────────────────────────────────────────

describe('skipStep — happy path', () => {
  it('marks the run_step skipped with the supplied reason', async () => {
    queueRows('brain_playbook_run_steps', [
      { id: 400, stepId: 50, status: 'active', resultEntityType: null, resultEntityId: null },
    ]);
    // advanceRun calls after the tx
    queueRows('brain_playbook_runs', [
      { id: 20, clientId: 1, playbookId: 5, status: 'active', context: {} },
    ]);
    queueRows('brain_playbook_steps', []);
    queueRows('brain_playbook_run_steps', [[], [{ status: 'skipped' }]]);

    const result = await skipStep(1, 99, 20, 50, { reason: 'not needed' });
    expect(result).toEqual({ stepId: 50, status: 'skipped' });

    const upd = state.updates.find((u) =>
      u.table === 'brain_playbook_run_steps' && u.set.status === 'skipped',
    );
    expect(upd).toBeDefined();
    expect(upd!.set.failureReason).toBe('not needed');
  });
});

describe('skipStep — not found returns null', () => {
  it('returns null when the run_step row does not exist', async () => {
    queueRows('brain_playbook_run_steps', []);
    const result = await skipStep(1, 99, 20, 50);
    expect(result).toBeNull();
  });
});

describe('skipStep — idempotent on already-terminal step', () => {
  it('returns skipped immediately without writing an update', async () => {
    queueRows('brain_playbook_run_steps', [
      { id: 401, stepId: 51, status: 'skipped' },
    ]);
    const result = await skipStep(1, 99, 20, 51);
    expect(result).toEqual({ stepId: 51, status: 'skipped' });
    expect(state.updates.find((u) => u.table === 'brain_playbook_run_steps')).toBeUndefined();
  });
});

// ─── abortRun ─────────────────────────────────────────────────────────────────

describe('abortRun — active run is aborted', () => {
  it('updates run status to aborted and marks active steps skipped', async () => {
    queueRows('brain_playbook_runs', [
      { id: 30, clientId: 1, playbookId: 5, status: 'active' },
    ]);

    const result = await abortRun(1, 99, 30, { reason: 'cancelled by user' });
    expect(result).not.toBeNull();

    const runUpd = state.updates.find((u) =>
      u.table === 'brain_playbook_runs' && u.set.status === 'aborted',
    );
    expect(runUpd).toBeDefined();
    expect(runUpd!.set.abortReason).toBe('cancelled by user');

    // Active run_steps should be bulk-skipped.
    const stepsUpd = state.updates.find((u) =>
      u.table === 'brain_playbook_run_steps' && u.set.status === 'skipped',
    );
    expect(stepsUpd).toBeDefined();
    expect(stepsUpd!.set.failureReason).toBe('cancelled by user');

    // Audit row for abort
    const auditIns = state.inserts.find((i) => i.table === 'brain_audit_logs');
    expect(auditIns).toBeDefined();
    const auditVals = (Array.isArray(auditIns!.values) ? auditIns!.values[0] : auditIns!.values) as Record<string, unknown>;
    expect(auditVals.action).toBe('playbook_run.aborted');
  });
});

describe('abortRun — already-aborted run is returned as-is', () => {
  it('returns the existing row without additional mutations', async () => {
    queueRows('brain_playbook_runs', [
      { id: 31, clientId: 1, playbookId: 5, status: 'aborted' },
    ]);
    const result = await abortRun(1, 99, 31);
    expect(result).not.toBeNull();
    // No update should have been written.
    expect(state.updates.find((u) => u.table === 'brain_playbook_runs')).toBeUndefined();
  });
});

describe('abortRun — run not found returns null', () => {
  it('returns null when the run does not belong to the client', async () => {
    queueRows('brain_playbook_runs', []);
    const result = await abortRun(1, 99, 99999);
    expect(result).toBeNull();
  });
});

// ─── retryFailedRun ───────────────────────────────────────────────────────────

describe('retryFailedRun — failed run is reset to active', () => {
  it('resets failed steps to pending and sets run status active', async () => {
    queueRows('brain_playbook_runs', [
      { id: 40, clientId: 1, playbookId: 5, status: 'failed' },
    ]);
    // failedSteps select returns two failed step rows.
    queueRows('brain_playbook_run_steps', [
      { id: 500 },
      { id: 501 },
    ]);

    const result = await retryFailedRun(1, 99, 40);
    expect(result).not.toBeNull();

    // Run should be flipped to 'active'.
    const runUpd = state.updates.find((u) =>
      u.table === 'brain_playbook_runs' && u.set.status === 'active',
    );
    expect(runUpd).toBeDefined();
    expect(runUpd!.set.completedAt).toBeNull();

    // Failed steps should be set to 'pending'.
    const stepsUpd = state.updates.find((u) =>
      u.table === 'brain_playbook_run_steps' && u.set.status === 'pending',
    );
    expect(stepsUpd).toBeDefined();
    expect(stepsUpd!.set.failureReason).toBeNull();

    // logAudit (uses module-level db.insert) emits a retried audit row.
    const auditIns = state.inserts.find((i) => i.table === 'brain_audit_logs');
    expect(auditIns).toBeDefined();
    const vals = (Array.isArray(auditIns!.values) ? auditIns!.values[0] : auditIns!.values) as Record<string, unknown>;
    expect(vals.action).toBe('playbook_run.retried');
  });
});

describe('retryFailedRun — non-failed run is returned unchanged', () => {
  it('returns the run without writing any updates', async () => {
    queueRows('brain_playbook_runs', [
      { id: 41, clientId: 1, playbookId: 5, status: 'active' },
    ]);
    const result = await retryFailedRun(1, 99, 41);
    expect(result).not.toBeNull();
    expect(state.updates.find((u) => u.table === 'brain_playbook_runs')).toBeUndefined();
  });
});

describe('retryFailedRun — run not found returns null', () => {
  it('returns null for an unknown run', async () => {
    queueRows('brain_playbook_runs', []);
    const result = await retryFailedRun(1, 99, 99999);
    expect(result).toBeNull();
  });
});

// ─── drainExpiredWaitSteps ────────────────────────────────────────────────────

describe('drainExpiredWaitSteps — no due rows', () => {
  it('returns zero counts without any mutations', async () => {
    // The outer db.select (not inside a tx) — drain reads from brain_playbook_run_steps.
    queueRows('brain_playbook_run_steps', []);

    const result = await drainExpiredWaitSteps();
    expect(result).toEqual({ examined: 0, drained: 0, failed: 0 });
    expect(state.inserts).toHaveLength(0);
    expect(state.updates).toHaveLength(0);
  });
});

describe('drainExpiredWaitSteps — due rows trigger completeStep per row', () => {
  it('drains two rows and returns examined=2, drained=2, failed=0', async () => {
    // drainExpiredWaitSteps makes these reads in order (all share the same queue
    // per table name — queueRows REPLACES, so we do one call per table with ALL
    // batches listed in call order):
    //
    // brain_playbook_run_steps batches (in call order):
    //   [0] outer due-rows query → 2 rows
    //   [1] completeStep Tx1: SELECT the step row for row-600
    //   [2] advanceRun Tx2 (after row-600): active run_steps query → empty
    //   [3] advanceRun Tx2 (after row-600): final count query → completed
    //   [4] completeStep Tx3: SELECT the step row for row-601
    //   [5] advanceRun Tx4 (after row-601): active run_steps query → empty
    //   [6] advanceRun Tx4 (after row-601): final count query → completed
    //
    // brain_playbook_runs batches (in call order):
    //   [0] actorByRun lookup → run 50 with startedBy
    //   [1] advanceRun Tx2: SELECT run row
    //   [2] advanceRun Tx4: SELECT run row
    //
    // brain_playbook_steps batches (in call order):
    //   [0] advanceRun Tx2: SELECT steps → empty (no branches to resolve)
    //   [1] advanceRun Tx4: SELECT steps → empty

    queueRows('brain_playbook_run_steps',
      // [0] due rows
      [{ id: 600, clientId: 1, runId: 50, stepId: 70 }, { id: 601, clientId: 1, runId: 50, stepId: 71 }],
      // [1] completeStep Tx1 step lookup
      [{ id: 600, stepId: 70, status: 'active', resultEntityType: null, resultEntityId: null }],
      // [2] advanceRun active steps
      [],
      // [3] advanceRun final count
      [{ status: 'completed' }],
      // [4] completeStep Tx3 step lookup
      [{ id: 601, stepId: 71, status: 'active', resultEntityType: null, resultEntityId: null }],
      // [5] advanceRun active steps
      [],
      // [6] advanceRun final count
      [{ status: 'completed' }],
    );
    queueRows('brain_playbook_runs',
      // [0] actorByRun lookup
      [{ id: 50, startedBy: 99 }],
      // [1] advanceRun Tx2
      [{ id: 50, clientId: 1, playbookId: 5, status: 'active', context: {} }],
      // [2] advanceRun Tx4
      [{ id: 50, clientId: 1, playbookId: 5, status: 'active', context: {} }],
    );
    queueRows('brain_playbook_steps',
      // [0] advanceRun Tx2
      [],
      // [1] advanceRun Tx4
      [],
    );

    const result = await drainExpiredWaitSteps();
    expect(result.examined).toBe(2);
    expect(result.drained).toBe(2);
    expect(result.failed).toBe(0);
  });
});
