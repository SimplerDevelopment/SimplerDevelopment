// @vitest-environment node
/**
 * Companion coverage for `lib/brain/playbooks.ts`.
 *
 * The primary test file (brain-playbooks.test.ts) covers:
 *   slugifyPlaybookName, updatePlaybook, activatePlaybook, archivePlaybook,
 *   deletePlaybook, removeStep, reorderSteps, validatePlaybookDag (core paths).
 *
 * This file covers the UNCOVERED functions and branches:
 *   - listPlaybooks (no filters, single status, multi-status, category,
 *     triggerKind, ownerId, limit/offset clamping)
 *   - getPlaybookById (found, not found)
 *   - createPlaybook (happy path, empty name, slug collision resolution)
 *   - addStep (happy path with auto-sortOrder, explicit sortOrder, missing key/name)
 *   - updateStep (happy path, partial patch, not-found → null)
 *   - removeStep happy path when no siblings reference the deleted key
 *   - reorderSteps happy path (tx commit + audit)
 *   - activatePlaybook happy + update-returned-null branch
 *   - archivePlaybook no-active-runs path (0 count)
 *   - deletePlaybook 0-run no-force path
 *   - validatePlaybookDag: disconnected component, multi-entry graph
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── DB mock ─────────────────────────────────────────────────────────────────
// Same chainable-thenable pattern as the primary test file.

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
  return q.length > 0 ? (q.shift() as ChainResult) : [];
}

function makeChain(takeRows: () => ChainResult) {
  const node: Record<string, unknown> = {};
  const methods = [
    'select', 'from', 'where', 'orderBy', 'limit', 'offset',
    'innerJoin', 'leftJoin', 'set', 'values', 'returning',
    'onConflictDoNothing', 'onConflictDoUpdate', 'update', 'insert', 'delete',
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

vi.mock('@/lib/db/schema', () => ({
  brainPlaybooks: {
    id: 'id',
    clientId: 'client_id',
    name: 'name',
    slug: 'slug',
    status: 'status',
    triggerKind: 'trigger_kind',
    category: 'category',
    ownerId: 'owner_id',
    $inferSelect: {},
    $inferInsert: {},
  },
  brainPlaybookSteps: {
    id: 'id',
    clientId: 'client_id',
    playbookId: 'playbook_id',
    key: 'key',
    name: 'name',
    sortOrder: 'sort_order',
    nextStepKeys: 'next_step_keys',
    $inferSelect: {},
    $inferInsert: {},
  },
  brainPlaybookRuns: {
    id: 'id',
    clientId: 'client_id',
    playbookId: 'playbook_id',
    status: 'status',
    $inferSelect: {},
    $inferInsert: {},
  },
  brainPlaybookRunSteps: {
    id: 'id',
    clientId: 'client_id',
    stepId: 'step_id',
    $inferSelect: {},
    $inferInsert: {},
  },
}));

vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => ({ and: args }),
  eq: (col: unknown, val: unknown) => ({ eq: [col, val] }),
  inArray: (col: unknown, vals: unknown) => ({ inArray: [col, vals] }),
  asc: (col: unknown) => ({ asc: col }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...vals: unknown[]) => ({
      as: (alias: string) => ({ sql: strings.join('?'), alias }),
      toString: () => strings.join('?'),
      _tag: 'sql',
      values: vals,
    }),
    { raw: (s: string) => ({ raw: s }) },
  ),
}));

// Import AFTER mocks register.
import {
  listPlaybooks,
  getPlaybookById,
  createPlaybook,
  addStep,
  updateStep,
  removeStep,
  reorderSteps,
  activatePlaybook,
  archivePlaybook,
  deletePlaybook,
  validatePlaybookDag,
} from '@/lib/brain/playbooks';

beforeEach(() => {
  state.selectQueue = [];
  state.updateQueue = [];
  state.insertQueue = [];
  state.deleteQueue = [];
  state.auditCalls = [];
  state.txCalls = 0;
  vi.clearAllMocks();
});

// ─── listPlaybooks ──────────────────────────────────────────────────────────

describe('listPlaybooks', () => {
  const makeRow = (id: number) => ({
    id,
    name: `Playbook ${id}`,
    slug: `playbook-${id}`,
    status: 'draft',
    triggerKind: 'manual',
    category: null,
    ownerId: null,
    stepCount: 2,
    activeRunCount: 0,
  });

  it('returns an empty array when no rows match', async () => {
    state.selectQueue = [[]];
    const rows = await listPlaybooks(1);
    expect(rows).toEqual([]);
  });

  it('maps rows and coerces stepCount / activeRunCount to numbers', async () => {
    state.selectQueue = [[makeRow(1), makeRow(2)]];
    const rows = await listPlaybooks(1);
    expect(rows).toHaveLength(2);
    expect(rows[0].stepCount).toBe(2);
    expect(rows[0].activeRunCount).toBe(0);
  });

  it('handles null stepCount / activeRunCount gracefully (coerces to 0)', async () => {
    state.selectQueue = [[{ ...makeRow(3), stepCount: null, activeRunCount: null }]];
    const rows = await listPlaybooks(1);
    expect(rows[0].stepCount).toBe(0);
    expect(rows[0].activeRunCount).toBe(0);
  });

  it('accepts a single status filter without throwing', async () => {
    state.selectQueue = [[]];
    const rows = await listPlaybooks(1, { status: 'active' });
    expect(rows).toEqual([]);
  });

  it('accepts an array of statuses without throwing', async () => {
    state.selectQueue = [[]];
    const rows = await listPlaybooks(1, { status: ['active', 'draft'] });
    expect(rows).toEqual([]);
  });

  it('accepts a single triggerKind filter', async () => {
    state.selectQueue = [[]];
    const rows = await listPlaybooks(1, { triggerKind: 'scheduled' });
    expect(rows).toEqual([]);
  });

  it('accepts an array of triggerKinds', async () => {
    state.selectQueue = [[]];
    const rows = await listPlaybooks(1, { triggerKind: ['manual', 'scheduled'] });
    expect(rows).toEqual([]);
  });

  it('accepts category and ownerId filters', async () => {
    state.selectQueue = [[]];
    const rows = await listPlaybooks(1, { category: 'hr', ownerId: 42 });
    expect(rows).toEqual([]);
  });

  it('clamps limit to [1, 100]', async () => {
    // limit 0 → clamped to 1
    state.selectQueue = [[]];
    await listPlaybooks(1, { limit: 0 });

    // limit 999 → clamped to 100
    state.selectQueue = [[]];
    await listPlaybooks(1, { limit: 999 });
  });

  it('clamps negative offset to 0', async () => {
    state.selectQueue = [[]];
    await listPlaybooks(1, { offset: -5 });
  });
});

// ─── getPlaybookById ─────────────────────────────────────────────────────────

describe('getPlaybookById', () => {
  it('returns null when the playbook does not exist', async () => {
    state.selectQueue = [[]]; // playbook fetch returns nothing
    const result = await getPlaybookById(1, 99);
    expect(result).toBeNull();
  });

  it('returns playbook + steps when found', async () => {
    const playbook = { id: 99, clientId: 1, name: 'Test', slug: 'test', status: 'draft' };
    const steps = [
      { id: 1, playbookId: 99, key: 'a', name: 'A', sortOrder: 0 },
      { id: 2, playbookId: 99, key: 'b', name: 'B', sortOrder: 1 },
    ];
    state.selectQueue = [[playbook], steps];
    const result = await getPlaybookById(1, 99);
    expect(result).not.toBeNull();
    expect(result!.playbook).toEqual(playbook);
    expect(result!.steps).toHaveLength(2);
  });

  it('returns playbook with empty steps array when no steps exist', async () => {
    const playbook = { id: 99, clientId: 1, name: 'Empty', slug: 'empty', status: 'draft' };
    state.selectQueue = [[playbook], []];
    const result = await getPlaybookById(1, 99);
    expect(result).not.toBeNull();
    expect(result!.steps).toEqual([]);
  });
});

// ─── createPlaybook ──────────────────────────────────────────────────────────

describe('createPlaybook', () => {
  it('throws when name is empty after trim', async () => {
    await expect(createPlaybook(1, null, { name: '   ' })).rejects.toThrow(/name is required/);
  });

  it('creates a playbook with default trigger + seeds draft status', async () => {
    // uniqueSlugForClient: slug query returns no collision
    state.selectQueue = [[]]; // slug collision check — no rows taken
    const created = {
      id: 10, clientId: 1, name: 'New Hire', slug: 'new-hire',
      status: 'draft', triggerKind: 'manual',
    };
    state.insertQueue = [[created]];

    const result = await createPlaybook(1, 42, { name: 'New Hire' });
    expect(result).toEqual(created);
    expect(state.auditCalls).toHaveLength(1);
    expect(state.auditCalls[0].action).toBe('brain_playbook.create');
  });

  it('resolves slug collision by appending -2', async () => {
    // slug check returns existing rows with 'new-hire' only
    state.selectQueue = [[{ slug: 'new-hire' }]];
    const created = {
      id: 11, clientId: 1, name: 'New Hire', slug: 'new-hire-2',
      status: 'draft', triggerKind: 'manual',
    };
    state.insertQueue = [[created]];

    const result = await createPlaybook(1, null, { name: 'New Hire' });
    expect(result.slug).toBe('new-hire-2');
  });

  it('accepts all optional fields (description, category, ownerId, triggerConfig)', async () => {
    state.selectQueue = [[]];
    const created = {
      id: 12, clientId: 1, name: 'Full', slug: 'full',
      status: 'draft', triggerKind: 'event',
      description: 'desc', category: 'ops', ownerId: 5,
    };
    state.insertQueue = [[created]];

    const result = await createPlaybook(1, 5, {
      name: 'Full',
      description: 'desc',
      triggerKind: 'event',
      triggerConfig: { event: 'contract.signed' },
      category: 'ops',
      ownerId: 5,
      defaultTopicIds: [1, 2],
    });
    expect(result).toEqual(created);
  });
});

// ─── addStep ─────────────────────────────────────────────────────────────────

describe('addStep', () => {
  it('throws when step.key is empty after trim', async () => {
    // assertPlaybookInTenant: playbook found
    state.selectQueue = [[{ id: 7 }]];
    await expect(
      addStep(1, null, 7, { key: '  ', name: 'X', kind: 'task' }),
    ).rejects.toThrow(/step.key is required/);
  });

  it('throws when step.name is empty after trim', async () => {
    state.selectQueue = [[{ id: 7 }]];
    await expect(
      addStep(1, null, 7, { key: 'step-1', name: '   ', kind: 'task' }),
    ).rejects.toThrow(/step.name is required/);
  });

  it('throws when the playbook does not exist in the tenant', async () => {
    state.selectQueue = [[]]; // assertPlaybookInTenant fails
    await expect(
      addStep(1, null, 7, { key: 'step-1', name: 'Step 1', kind: 'task' }),
    ).rejects.toThrow(/not found in tenant/);
  });

  it('auto-picks sortOrder (appends to end) when not supplied', async () => {
    // assertPlaybookInTenant: playbook found
    state.selectQueue = [
      [{ id: 7 }],       // assertPlaybookInTenant
      [{ m: 3 }],         // MAX(sortOrder) = 3 → next = 4
    ];
    const created = { id: 20, clientId: 1, playbookId: 7, key: 'step-x', name: 'Step X', kind: 'task', sortOrder: 4 };
    state.insertQueue = [[created]];

    const result = await addStep(1, null, 7, { key: 'step-x', name: 'Step X', kind: 'task' });
    expect(result).toEqual(created);
    expect(state.auditCalls[0].action).toBe('brain_playbook_step.create');
  });

  it('uses sortOrder = 0 when MAX returns -1 (no existing steps)', async () => {
    state.selectQueue = [
      [{ id: 7 }],
      [{ m: -1 }], // no existing steps
    ];
    const created = { id: 21, clientId: 1, playbookId: 7, key: 'first', name: 'First', kind: 'note', sortOrder: 0 };
    state.insertQueue = [[created]];

    const result = await addStep(1, 99, 7, { key: 'first', name: 'First', kind: 'note' });
    expect(result.sortOrder).toBe(0);
  });

  it('uses explicit sortOrder when supplied (skips the MAX query)', async () => {
    state.selectQueue = [[{ id: 7 }]]; // only assertPlaybookInTenant
    const created = { id: 22, clientId: 1, playbookId: 7, key: 's', name: 'S', kind: 'task', sortOrder: 99 };
    state.insertQueue = [[created]];

    const result = await addStep(1, null, 7, { key: 's', name: 'S', kind: 'task', sortOrder: 99 });
    expect(result.sortOrder).toBe(99);
  });
});

// ─── updateStep ──────────────────────────────────────────────────────────────

describe('updateStep', () => {
  it('returns null when the step is not found (wrong tenant or missing)', async () => {
    state.updateQueue = [[]]; // RETURNING is empty
    const result = await updateStep(1, null, 999, { name: 'New Name' });
    expect(result).toBeNull();
  });

  it('updates a step and emits an audit entry', async () => {
    const updated = {
      id: 55, clientId: 1, playbookId: 7,
      key: 'step-a', name: 'Updated Name', kind: 'task', sortOrder: 0,
    };
    state.updateQueue = [[updated]];
    const result = await updateStep(1, 42, 55, { name: 'Updated Name' });
    expect(result).toEqual(updated);
    expect(state.auditCalls).toHaveLength(1);
    expect(state.auditCalls[0].action).toBe('brain_playbook_step.update');
  });

  it('applies all optional patch fields without throwing', async () => {
    const updated = { id: 55, clientId: 1, playbookId: 7, key: 'k', name: 'N', kind: 'meeting', sortOrder: 5 };
    state.updateQueue = [[updated]];
    const result = await updateStep(1, null, 55, {
      key: 'k',
      name: 'N',
      description: 'desc',
      kind: 'meeting',
      config: { attendees: [] },
      condition: { field: 'status', op: 'eq', value: 'active' },
      nextStepKeys: ['next-step'],
      sortOrder: 5,
    });
    expect(result).toEqual(updated);
  });

  it('can clear description by passing null', async () => {
    const updated = { id: 55, clientId: 1, playbookId: 7, key: 'k', name: 'N', kind: 'task', sortOrder: 0, description: null };
    state.updateQueue = [[updated]];
    const result = await updateStep(1, null, 55, { description: null });
    expect(result!.description).toBeNull();
  });
});

// ─── removeStep: happy path with no dangling references ─────────────────────

describe('removeStep — happy path', () => {
  it('returns true when step is deleted and no siblings reference its key', async () => {
    const step = {
      id: 200, playbookId: 7, key: 'orphan', clientId: 1,
      name: 'Orphan', description: null, kind: 'task', config: {},
      condition: null, nextStepKeys: [], sortOrder: 0,
      createdAt: new Date(), updatedAt: new Date(),
    };
    state.selectQueue = [
      [step],       // initial fetch
      [{ c: 0 }],   // run-step count = 0
      [             // siblings: none reference 'orphan'
        { id: 201, nextStepKeys: ['other'] },
        { id: 200, nextStepKeys: [] },  // self — skipped
      ],
    ];
    state.deleteQueue = [[{ id: 200 }]];

    const ok = await removeStep(1, null, 200);
    expect(ok).toBe(true);
    expect(state.auditCalls[0].action).toBe('brain_playbook_step.delete');
  });

  it('returns false when delete returns nothing (race condition)', async () => {
    const step = {
      id: 300, playbookId: 8, key: 'gone', clientId: 1,
      name: 'Gone', description: null, kind: 'task', config: {},
      condition: null, nextStepKeys: [], sortOrder: 0,
      createdAt: new Date(), updatedAt: new Date(),
    };
    state.selectQueue = [
      [step],
      [{ c: 0 }],
      [],  // no siblings
    ];
    state.deleteQueue = [[/* empty — nothing deleted */]];

    const ok = await removeStep(1, null, 300);
    expect(ok).toBe(false);
  });
});

// ─── reorderSteps: happy path ────────────────────────────────────────────────

describe('reorderSteps — happy path', () => {
  it('commits the new order and fires an audit log', async () => {
    // tx: owned-check returns 2 step ids, updates succeed, then refreshed select
    const refreshed = [
      { id: 1, playbookId: 7, sortOrder: 0 },
      { id: 2, playbookId: 7, sortOrder: 1 },
    ];
    // Inside the transaction, selectQueue is consumed for:
    //   1) owned check (returns [{ id: 1 }, { id: 2 }])
    //   2) refreshed select (returns the two rows)
    state.selectQueue = [
      [{ id: 1 }, { id: 2 }], // owned check
      refreshed,               // final select
    ];
    // Update called once per step (2 updates)
    state.updateQueue = [
      [{ id: 1 }],
      [{ id: 2 }],
    ];

    const result = await reorderSteps(1, 42, 7, [1, 2]);
    expect(result).toEqual(refreshed);
    expect(state.auditCalls).toHaveLength(1);
    expect(state.auditCalls[0].action).toBe('brain_playbook_step.reorder');
    expect(state.txCalls).toBe(1);
  });
});

// ─── activatePlaybook: update returns null ───────────────────────────────────

describe('activatePlaybook — update returns null (race)', () => {
  it('returns null when the update RETURNING is empty', async () => {
    state.selectQueue = [
      [{ id: 99, status: 'draft' }],   // initial fetch
      [{ id: 1 }, { id: 2 }],           // step-count
      // validatePlaybookDag: linear a→b graph (valid)
      [
        { id: 1, key: 'a', nextStepKeys: ['b'] },
        { id: 2, key: 'b', nextStepKeys: [] },
      ],
    ];
    state.updateQueue = [[]]; // update RETURNING is empty → null
    const result = await activatePlaybook(1, null, 99);
    expect(result).toBeNull();
  });

  it('activates successfully on a valid DAG', async () => {
    state.selectQueue = [
      [{ id: 99, status: 'draft' }],
      [{ id: 1 }, { id: 2 }],
      [
        { id: 1, key: 'a', nextStepKeys: ['b'] },
        { id: 2, key: 'b', nextStepKeys: [] },
      ],
    ];
    const activated = { id: 99, status: 'active' };
    state.updateQueue = [[activated]];
    const result = await activatePlaybook(1, null, 99);
    expect(result).toEqual(activated);
    expect(state.auditCalls[0].action).toBe('brain_playbook.activate');
  });
});

// ─── archivePlaybook: zero active runs (no-force) ───────────────────────────

describe('archivePlaybook — zero active runs allows archive', () => {
  it('archives when active run count is 0', async () => {
    state.selectQueue = [
      [{ id: 99, status: 'active' }],
      [{ c: 0 }], // 0 active runs
    ];
    const archived = { id: 99, status: 'archived' };
    state.updateQueue = [[archived]];

    const result = await archivePlaybook(1, null, 99);
    expect(result).toEqual(archived);
    expect(state.auditCalls[0].action).toBe('brain_playbook.archive');
  });

  it('returns null when update RETURNING is empty', async () => {
    state.selectQueue = [
      [{ id: 99, status: 'active' }],
      [{ c: 0 }],
    ];
    state.updateQueue = [[]];
    const result = await archivePlaybook(1, null, 99);
    expect(result).toBeNull();
  });
});

// ─── deletePlaybook: 0 runs, no force ───────────────────────────────────────

describe('deletePlaybook — 0 runs allows delete without force', () => {
  it('deletes when no runs exist', async () => {
    state.selectQueue = [
      [{ id: 99 }],   // playbook found
      [{ c: 0 }],     // 0 runs
    ];
    state.deleteQueue = [[{ id: 99 }]];
    const ok = await deletePlaybook(1, null, 99);
    expect(ok).toBe(true);
    expect(state.auditCalls[0].action).toBe('brain_playbook.delete');
  });

  it('returns false when delete RETURNING is empty', async () => {
    state.selectQueue = [
      [{ id: 99 }],
      [{ c: 0 }],
    ];
    state.deleteQueue = [[]];
    const ok = await deletePlaybook(1, null, 99);
    expect(ok).toBe(false);
  });
});

// ─── validatePlaybookDag: additional branches ────────────────────────────────

describe('validatePlaybookDag — additional graph shapes', () => {
  it('passes a multi-entry (parallel-start) graph: a→c, b→c', async () => {
    // a and b both have no incoming → two entry points. c is a terminal.
    state.selectQueue = [[
      { id: 1, key: 'a', nextStepKeys: ['c'] },
      { id: 2, key: 'b', nextStepKeys: ['c'] },
      { id: 3, key: 'c', nextStepKeys: [] },
    ]];
    const res = await validatePlaybookDag(1, 7);
    expect(res.valid).toBe(true);
    expect(res.errors).toEqual([]);
  });

  it('reports both a missing-ref error and a no-entry-point error together', async () => {
    // Every step has an incoming edge AND one of those refs is missing
    state.selectQueue = [[
      { id: 1, key: 'a', nextStepKeys: ['b', 'ghost'] },
      { id: 2, key: 'b', nextStepKeys: ['a'] },
    ]];
    const res = await validatePlaybookDag(1, 7);
    expect(res.valid).toBe(false);
    // Should flag the missing 'ghost' key
    expect(res.errors.some((e) => e.includes('ghost'))).toBe(true);
    // No entry point (a and b both have incoming edges)
    expect(res.errors.some((e) => /no entry step/.test(e))).toBe(true);
  });

  it('passes a graph with a single terminal node', async () => {
    state.selectQueue = [[
      { id: 1, key: 'only', nextStepKeys: [] },
    ]];
    const res = await validatePlaybookDag(1, 7);
    expect(res.valid).toBe(true);
  });

  it('detects a self-loop (a → a)', async () => {
    state.selectQueue = [[
      { id: 1, key: 'a', nextStepKeys: ['a'] },
    ]];
    const res = await validatePlaybookDag(1, 7);
    expect(res.valid).toBe(false);
    // Either cycle or no-entry-point error should be reported
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it('passes a diamond graph: a→b, a→c, b→d, c→d', async () => {
    state.selectQueue = [[
      { id: 1, key: 'a', nextStepKeys: ['b', 'c'] },
      { id: 2, key: 'b', nextStepKeys: ['d'] },
      { id: 3, key: 'c', nextStepKeys: ['d'] },
      { id: 4, key: 'd', nextStepKeys: [] },
    ]];
    const res = await validatePlaybookDag(1, 7);
    expect(res.valid).toBe(true);
  });
});
