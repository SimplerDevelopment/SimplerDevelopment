// @vitest-environment node
/**
 * Unit tests for lib/brain/playbooks — pure-logic edges:
 *   - slugifyPlaybookName: normalization + fallbacks
 *   - updatePlaybook: refuses any status change (must go through activate/archive)
 *   - activatePlaybook: refuses if zero steps + propagates DAG errors
 *   - archivePlaybook: refuses if active runs exist (unless force=true)
 *   - deletePlaybook: refuses if any runs exist (unless force=true)
 *   - removeStep: cleans orphan nextStepKeys on sibling steps
 *   - reorderSteps: dedupe-input + tenant-scope checks
 *   - validatePlaybookDag: cycle detection, missing nextStepKey, no entry point
 *
 * The DB layer is stubbed. Real correlated-subquery behaviour for stepCount /
 * activeRunCount is covered in the integration spec (catches the ${table.col}
 * Drizzle pitfall).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── DB mock ────────────────────────────────────────────────────────────────
// Drizzle's fluent builders are chainable thenables. The chain awaits to
// whatever rows the test queue is currently advertising. We expose a queue
// per "kind" (select / update / insert / delete) so the lib's sequential
// reads can yield different rows on each await.

type ChainResult = unknown[];
type Queue = ChainResult[];

const state: {
  selectQueue: Queue;
  updateQueue: Queue;
  insertQueue: Queue;
  deleteQueue: Queue;
  auditCalls: Array<Record<string, unknown>>;
  txCalls: number;
} = {
  selectQueue: [],
  updateQueue: [],
  insertQueue: [],
  deleteQueue: [],
  auditCalls: [],
  txCalls: 0,
};

function nextRows(q: Queue): ChainResult {
  // If the queue has rows, shift the next batch; otherwise return [].
  return q.length > 0 ? (q.shift() as ChainResult) : [];
}

function makeChain(takeRows: () => ChainResult) {
  const node: Record<string, unknown> = {};
  const methods = [
    'select', 'from', 'where', 'orderBy', 'limit', 'offset',
    'innerJoin', 'leftJoin', 'set', 'values', 'returning',
    'onConflictDoNothing', 'onConflictDoUpdate',
  ];
  for (const m of methods) node[m] = vi.fn(() => node);
  (node as { then: (cb: (v: ChainResult) => unknown) => Promise<unknown> }).then =
    (cb) => Promise.resolve(cb(takeRows()));
  return node;
}

vi.mock('@/lib/db', () => {
  const selectChain = () => makeChain(() => nextRows(state.selectQueue));
  const updateChain = () => makeChain(() => nextRows(state.updateQueue));
  const insertChain = () => makeChain(() => nextRows(state.insertQueue));
  const deleteChain = () => makeChain(() => nextRows(state.deleteQueue));
  const db = {
    select: vi.fn(() => selectChain()),
    update: vi.fn(() => updateChain()),
    insert: vi.fn(() => insertChain()),
    delete: vi.fn(() => deleteChain()),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      state.txCalls += 1;
      const tx = {
        select: vi.fn(() => selectChain()),
        update: vi.fn(() => updateChain()),
        insert: vi.fn(() => insertChain()),
        delete: vi.fn(() => deleteChain()),
      };
      return fn(tx);
    }),
  };
  return { db };
});

vi.mock('@/lib/brain/audit', () => ({
  logAudit: vi.fn(async (args: Record<string, unknown>) => {
    state.auditCalls.push(args);
  }),
}));

// Import AFTER mocks register.
import {
  slugifyPlaybookName,
  updatePlaybook,
  activatePlaybook,
  archivePlaybook,
  deletePlaybook,
  removeStep,
  reorderSteps,
  validatePlaybookDag,
} from '@/lib/brain/playbooks';

beforeEach(() => {
  state.selectQueue = [];
  state.updateQueue = [];
  state.insertQueue = [];
  state.deleteQueue = [];
  state.auditCalls = [];
  state.txCalls = 0;
});

// ─── slugifyPlaybookName ────────────────────────────────────────────────────

describe('slugifyPlaybookName', () => {
  it('lowercases + dasherizes ASCII names', () => {
    expect(slugifyPlaybookName('New Hire Onboarding')).toBe('new-hire-onboarding');
  });
  it('collapses runs of non-alphanumerics', () => {
    expect(slugifyPlaybookName('  Foo!!  --  Bar??  ')).toBe('foo-bar');
  });
  it('caps at 180 chars', () => {
    expect(slugifyPlaybookName('a'.repeat(500)).length).toBeLessThanOrEqual(180);
  });
  it('falls back to "playbook" when no alphanumerics remain', () => {
    expect(slugifyPlaybookName('!!!')).toBe('playbook');
    expect(slugifyPlaybookName('')).toBe('playbook');
  });
});

// ─── updatePlaybook: status guard ───────────────────────────────────────────

describe('updatePlaybook — status changes are forbidden via this path', () => {
  it('throws when patch.status is present', async () => {
    await expect(
      updatePlaybook(1, null, 99, { status: 'active' }),
    ).rejects.toThrow(/activatePlaybook or archivePlaybook/);
    await expect(
      updatePlaybook(1, null, 99, { status: 'archived' }),
    ).rejects.toThrow(/activatePlaybook or archivePlaybook/);
  });

  it('returns null when the patch targets a row this client does not own', async () => {
    state.updateQueue = [[]]; // RETURNING is empty → not found
    const res = await updatePlaybook(1, null, 99, { name: 'x' });
    expect(res).toBeNull();
  });
});

// ─── activatePlaybook: zero-step + DAG guards ───────────────────────────────

describe('activatePlaybook — zero-step refuse', () => {
  it('throws when the playbook has no steps', async () => {
    state.selectQueue = [
      [{ id: 99, status: 'draft' }],   // initial fetch of playbook
      [],                              // step-count query: empty
    ];
    await expect(activatePlaybook(1, null, 99)).rejects.toThrow(/zero steps/);
  });

  it('propagates DAG validator errors', async () => {
    state.selectQueue = [
      [{ id: 99, status: 'draft' }],   // initial fetch
      [{ id: 1 }, { id: 2 }],          // step-count: 2 steps exist
      // validatePlaybookDag re-queries steps with key/nextStepKeys:
      [
        { id: 1, key: 'a', nextStepKeys: ['b'] },
        { id: 2, key: 'b', nextStepKeys: ['a'] }, // cycle a→b→a
      ],
    ];
    await expect(activatePlaybook(1, null, 99)).rejects.toThrow(/cycle/);
  });

  it('returns null when the playbook does not exist', async () => {
    state.selectQueue = [[]]; // initial fetch returns nothing
    const out = await activatePlaybook(1, null, 99);
    expect(out).toBeNull();
  });
});

// ─── archivePlaybook: active-runs guard ─────────────────────────────────────

describe('archivePlaybook — refuses while active runs exist', () => {
  it('throws when active runs exist and force is not set', async () => {
    state.selectQueue = [
      [{ id: 99, status: 'active' }],  // initial fetch
      [{ c: 3 }],                       // active-run count = 3
    ];
    await expect(archivePlaybook(1, null, 99)).rejects.toThrow(/3 active run/);
  });

  it('proceeds when force=true even with active runs', async () => {
    state.selectQueue = [
      [{ id: 99, status: 'active' }],
      // No active-run query — force=true skips it.
    ];
    state.updateQueue = [[{ id: 99, status: 'archived' }]];
    const out = await archivePlaybook(1, null, 99, { force: true });
    expect(out).toEqual({ id: 99, status: 'archived' });
  });

  it('returns null when playbook does not exist', async () => {
    state.selectQueue = [[]];
    const out = await archivePlaybook(1, null, 99);
    expect(out).toBeNull();
  });
});

// ─── deletePlaybook: any-runs guard ─────────────────────────────────────────

describe('deletePlaybook — refuses if any runs exist (unless force)', () => {
  it('throws when historical runs exist', async () => {
    state.selectQueue = [
      [{ id: 99 }],     // playbook exists
      [{ c: 1 }],       // 1 run exists
    ];
    await expect(deletePlaybook(1, null, 99)).rejects.toThrow(/1 run/);
  });

  it('cascades when force=true', async () => {
    state.selectQueue = [[{ id: 99 }]];
    state.deleteQueue = [[{ id: 99 }]];
    const ok = await deletePlaybook(1, null, 99, { force: true });
    expect(ok).toBe(true);
  });

  it('returns false when not found', async () => {
    state.selectQueue = [[]];
    const ok = await deletePlaybook(1, null, 99);
    expect(ok).toBe(false);
  });
});

// ─── removeStep: orphan-cleanup pass ────────────────────────────────────────

describe('removeStep — clears orphan nextStepKeys on siblings', () => {
  it('rewrites sibling nextStepKeys, removing the deleted step\'s key', async () => {
    // Queue layout for removeStep(101):
    //   1) initial step fetch → { id: 101, playbookId: 7, key: 'b' }
    //   2) run-step count → [{ c: 0 }]  (nothing referencing it)
    //   3) siblings fetch → 3 rows, two of which point at 'b'
    state.selectQueue = [
      [{ id: 101, playbookId: 7, key: 'b', clientId: 1, name: 'B', description: null,
         kind: 'task', config: {}, condition: null, nextStepKeys: ['c'], sortOrder: 1,
         createdAt: new Date(), updatedAt: new Date() }],
      [{ c: 0 }],
      [
        { id: 100, nextStepKeys: ['b'] },           // → must lose 'b'
        { id: 101, nextStepKeys: ['c'] },           // self → skipped
        { id: 102, nextStepKeys: ['b', 'c'] },      // → must lose 'b', keep 'c'
        { id: 103, nextStepKeys: ['c'] },           // already clean → no update
      ],
    ];
    // Update calls: 2 siblings need a write. Each returns a row but we don't
    // inspect; the queue just has to have something to consume.
    state.updateQueue = [[{ id: 100 }], [{ id: 102 }]];
    // Delete: row returned
    state.deleteQueue = [[{ id: 101 }]];

    const ok = await removeStep(1, null, 101);
    expect(ok).toBe(true);
    // 2 sibling updates only — sibling 103 already clean, sibling 101 is self
    expect(state.updateQueue.length).toBe(0); // both consumed
  });

  it('refuses when run-step rows reference the step', async () => {
    state.selectQueue = [
      [{ id: 101, playbookId: 7, key: 'b', clientId: 1, name: 'B', description: null,
         kind: 'task', config: {}, condition: null, nextStepKeys: [], sortOrder: 1,
         createdAt: new Date(), updatedAt: new Date() }],
      [{ c: 4 }], // 4 run-step rows reference it
    ];
    await expect(removeStep(1, null, 101)).rejects.toThrow(/4 run-step/);
  });

  it('returns false when step does not exist', async () => {
    state.selectQueue = [[]];
    const ok = await removeStep(1, null, 999);
    expect(ok).toBe(false);
  });
});

// ─── reorderSteps: input guards ─────────────────────────────────────────────

describe('reorderSteps — input + tenant-scope guards', () => {
  it('throws when orderedStepIds is empty', async () => {
    await expect(reorderSteps(1, null, 7, [])).rejects.toThrow(/empty/);
  });

  it('throws when orderedStepIds contains a duplicate', async () => {
    await expect(reorderSteps(1, null, 7, [1, 2, 1])).rejects.toThrow(/duplicate/);
  });

  it('throws when any id does not belong to the target playbook + tenant', async () => {
    // Tx open → owned-check returns only 2 of 3 ids
    state.selectQueue = [
      [{ id: 1 }, { id: 2 }], // owned check — missing 3
      [],                      // refreshed select (unused)
    ];
    await expect(reorderSteps(1, null, 7, [1, 2, 3])).rejects.toThrow(/do not belong/);
  });
});

// ─── validatePlaybookDag ────────────────────────────────────────────────────

describe('validatePlaybookDag', () => {
  it('flags zero-step playbooks as invalid', async () => {
    state.selectQueue = [[]];
    const res = await validatePlaybookDag(1, 7);
    expect(res.valid).toBe(false);
    expect(res.errors.join(' ')).toMatch(/no steps/);
  });

  it('flags a missing nextStepKey reference', async () => {
    state.selectQueue = [[
      { id: 1, key: 'a', nextStepKeys: ['ghost'] },
      { id: 2, key: 'b', nextStepKeys: [] },
    ]];
    const res = await validatePlaybookDag(1, 7);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes('ghost'))).toBe(true);
  });

  it('flags a graph with no entry point (every node has an incoming edge)', async () => {
    // a → b, b → a — both nodes have incoming. No root, plus a cycle.
    state.selectQueue = [[
      { id: 1, key: 'a', nextStepKeys: ['b'] },
      { id: 2, key: 'b', nextStepKeys: ['a'] },
    ]];
    const res = await validatePlaybookDag(1, 7);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => /no entry step/.test(e))).toBe(true);
  });

  it('detects a cycle (a → b → c → a)', async () => {
    state.selectQueue = [[
      { id: 1, key: 'a', nextStepKeys: ['b'] },
      { id: 2, key: 'b', nextStepKeys: ['c'] },
      { id: 3, key: 'c', nextStepKeys: ['a'] },
    ]];
    const res = await validatePlaybookDag(1, 7);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => /cycle/.test(e))).toBe(true);
  });

  it('passes a simple linear graph a → b → c', async () => {
    state.selectQueue = [[
      { id: 1, key: 'a', nextStepKeys: ['b'] },
      { id: 2, key: 'b', nextStepKeys: ['c'] },
      { id: 3, key: 'c', nextStepKeys: [] },
    ]];
    const res = await validatePlaybookDag(1, 7);
    expect(res.valid).toBe(true);
    expect(res.errors).toEqual([]);
  });

  it('passes a branching graph: a → b, a → c (b and c are terminal)', async () => {
    state.selectQueue = [[
      { id: 1, key: 'a', nextStepKeys: ['b', 'c'] },
      { id: 2, key: 'b', nextStepKeys: [] },
      { id: 3, key: 'c', nextStepKeys: [] },
    ]];
    const res = await validatePlaybookDag(1, 7);
    expect(res.valid).toBe(true);
  });
});
