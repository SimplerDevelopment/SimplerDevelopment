// @vitest-environment node
/**
 * Unit tests for lib/brain/org-units — DB-function paths + pure helpers.
 *
 * Strategy: replaces the minimal `db: {}` stub from the original file with the
 * queue-based fluent stub from brain-topics.test.ts. This lets us exercise all
 * the exported DB-calling functions without a real database.
 *
 * Integration-layer tests (ON CONFLICT upsert semantics for addMember, real
 * transaction isolation) live in tests/integration/api/brain/org-units.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── DB stub ────────────────────────────────────────────────────────────────
//
// vi.mock factories are hoisted to the top of the file by Vitest, so any
// module-level `const` that the factory closure closes over must itself be
// hoisted via vi.hoisted(). Everything that needs to be shared between the
// factory and the test body is placed in the hoisted block.

interface CapturedInsert { values: Record<string, unknown> | Array<Record<string, unknown>> | null; }
interface CapturedUpdate { set: Record<string, unknown> | null; }
interface CapturedDelete { where: unknown; }

const { captured, dbStub } = vi.hoisted(() => {
  const captured = {
    inserts: [] as CapturedInsert[],
    updates: [] as CapturedUpdate[],
    deletes: [] as CapturedDelete[],
    selectRowsQueue: [] as Array<Array<Record<string, unknown>>>,
    insertReturning: [] as Array<Array<Record<string, unknown>>>,
    updateReturning: [] as Array<Array<Record<string, unknown>>>,
    deleteReturning: [] as Array<Array<Record<string, unknown>>>,
    txCalls: 0,
  };

  function nextSelectRows(): Array<Record<string, unknown>> {
    return captured.selectRowsQueue.length > 0 ? captured.selectRowsQueue.shift()! : [];
  }

  function makeSelectChain(): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    chain.from = () => chain;
    chain.where = () => chain;
    chain.orderBy = () => Promise.resolve(nextSelectRows());
    chain.limit = () => Promise.resolve(nextSelectRows());
    chain.groupBy = () => Promise.resolve(nextSelectRows());
    chain.innerJoin = () => chain;
    chain.then = (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve(nextSelectRows()).then(onFulfilled);
    return chain;
  }

  function makeInsertChain(): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    chain.values = (v: unknown) => {
      captured.inserts.push({ values: v as CapturedInsert['values'] });
      return chain;
    };
    chain.onConflictDoUpdate = () => chain;
    chain.returning = () =>
      Promise.resolve(
        captured.insertReturning.length > 0 ? captured.insertReturning.shift() : [],
      );
    chain.then = (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve([]).then(onFulfilled);
    return chain;
  }

  function makeUpdateChain(): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    chain.set = (v: Record<string, unknown>) => {
      captured.updates.push({ set: v });
      return chain;
    };
    chain.where = () => chain;
    chain.returning = () =>
      Promise.resolve(
        captured.updateReturning.length > 0 ? captured.updateReturning.shift() : [],
      );
    chain.then = (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve([]).then(onFulfilled);
    return chain;
  }

  function makeDeleteChain(): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    chain.where = (w: unknown) => {
      captured.deletes.push({ where: w });
      return chain;
    };
    chain.returning = () =>
      Promise.resolve(
        captured.deleteReturning.length > 0 ? captured.deleteReturning.shift() : [],
      );
    chain.then = (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve([]).then(onFulfilled);
    return chain;
  }

  const dbStub = {
    select: () => makeSelectChain(),
    insert: () => makeInsertChain(),
    update: () => makeUpdateChain(),
    delete: () => makeDeleteChain(),
    execute: async () => [] as unknown[],
    transaction: async (fn: (tx: typeof dbStub) => Promise<unknown>) => {
      captured.txCalls += 1;
      return fn(dbStub);
    },
  };

  return { captured, dbStub };
});

vi.mock('@/lib/db', () => ({ db: dbStub }));

function resetCaptured() {
  captured.inserts.length = 0;
  captured.updates.length = 0;
  captured.deletes.length = 0;
  captured.selectRowsQueue.length = 0;
  captured.insertReturning.length = 0;
  captured.updateReturning.length = 0;
  captured.deleteReturning.length = 0;
  captured.txCalls = 0;
}

vi.mock('@/lib/db/schema', () => ({
  brainOrgUnits: {
    id: { __col: 'id' },
    clientId: { __col: 'client_id' },
    parentId: { __col: 'parent_id' },
    slug: { __col: 'slug' },
    path: { __col: 'path' },
    name: { __col: 'name' },
    description: { __col: 'description' },
    leadPersonId: { __col: 'lead_person_id' },
    color: { __col: 'color' },
    icon: { __col: 'icon' },
    sortOrder: { __col: 'sort_order' },
    createdBy: { __col: 'created_by' },
    updatedAt: { __col: 'updated_at' },
  },
  brainPersonOrgUnits: {
    id: { __col: 'id' },
    clientId: { __col: 'client_id' },
    orgUnitId: { __col: 'org_unit_id' },
    personId: { __col: 'person_id' },
    primary: { __col: 'primary' },
    roleInUnit: { __col: 'role_in_unit' },
  },
  brainPeople: {
    id: { __col: 'id' },
    clientId: { __col: 'client_id' },
    fullName: { __col: 'full_name' },
    title: { __col: 'title' },
  },
}));

vi.mock('@/lib/brain/audit', () => ({ logAudit: vi.fn(async () => {}) }));
vi.mock('@/lib/brain/dashboard', () => ({ revalidateBrainStaticCounts: vi.fn(() => {}) }));

vi.mock('drizzle-orm', () => ({
  and: (...parts: unknown[]) => ({ kind: 'and', parts }),
  asc: (col: unknown) => ({ kind: 'asc', col }),
  desc: (col: unknown) => ({ kind: 'desc', col }),
  eq: (col: unknown, val: unknown) => ({ kind: 'eq', col, val }),
  ne: (col: unknown, val: unknown) => ({ kind: 'ne', col, val }),
  sql: Object.assign(
    (..._args: unknown[]) => ({ kind: 'sql' }),
    { raw: (s: string) => ({ kind: 'raw', s }) },
  ),
  inArray: (col: unknown, vals: unknown[]) => ({ kind: 'inArray', col, vals }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
}));

import {
  rewriteSubtreePath,
  wouldCreateCycle,
  slugifyName,
  nextAvailableSlug,
  buildPath,
  listOrgUnits,
  getOrgUnitTree,
  getOrgUnitById,
  createOrgUnit,
  updateOrgUnit,
  moveOrgUnit,
  deleteOrgUnit,
  addMember,
  removeMember,
  setPrimaryUnit,
} from '@/lib/brain/org-units';

// ─── Fixture helpers ─────────────────────────────────────────────────────────

function makeUnit(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    clientId: 7,
    parentId: null,
    name: 'Engineering',
    slug: 'engineering',
    path: '/engineering',
    description: null,
    leadPersonId: null,
    color: null,
    icon: null,
    sortOrder: 0,
    createdBy: null,
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

// ─── Original tests preserved ────────────────────────────────────────────────

describe('deleteOrgUnit — refuse-when-members rule', () => {
  it('refusal message references "force=true" (used by the API route)', () => {
    const sample = 'Org unit has 3 member(s) and 0 child unit(s). Pass force=true to cascade.';
    expect(sample).toMatch(/force=true/i);
  });
});

describe('moveOrgUnit cycle guard', () => {
  it('rejects moving a unit under itself', () => {
    expect(wouldCreateCycle(1, 1, [{ id: 1 }])).toBe(true);
  });
  it('rejects moving a unit under one of its descendants', () => {
    expect(wouldCreateCycle(1, 2, [{ id: 1 }, { id: 2 }, { id: 3 }])).toBe(true);
    expect(wouldCreateCycle(1, 3, [{ id: 1 }, { id: 2 }, { id: 3 }])).toBe(true);
  });
  it('allows moving under an unrelated parent', () => {
    expect(wouldCreateCycle(1, 99, [{ id: 1 }, { id: 2 }, { id: 3 }])).toBe(false);
  });
  it('allows promoting to root (parentId=null)', () => {
    expect(wouldCreateCycle(1, null, [{ id: 1 }, { id: 2 }])).toBe(false);
  });
});

describe('mergeOrgUnits descendant-guard math', () => {
  it('rewriteSubtreePath throws on unrelated path (caller bug shield)', () => {
    expect(() => rewriteSubtreePath('/unrelated', '/eng', '/infra')).toThrow();
  });
  it('rewrites every depth correctly for merge cases', () => {
    expect(rewriteSubtreePath('/eng', '/eng', '/infra')).toBe('/infra');
    expect(rewriteSubtreePath('/eng/platform', '/eng', '/infra')).toBe('/infra/platform');
    expect(rewriteSubtreePath('/eng/platform/runtime', '/eng', '/infra')).toBe('/infra/platform/runtime');
  });
});

describe('reattach-without-duplicates contract', () => {
  it('mergeOrgUnits is expected to dedupe on (personId, orgUnitId) — documented invariant', () => {
    const targetMemberIds = new Set([10, 11]);
    const sourceMembers = [
      { personId: 10 },
      { personId: 12 },
    ];
    const willReattach = sourceMembers.filter((m) => !targetMemberIds.has(m.personId));
    const willDrop = sourceMembers.filter((m) => targetMemberIds.has(m.personId));
    expect(willReattach.map((m) => m.personId)).toEqual([12]);
    expect(willDrop.map((m) => m.personId)).toEqual([10]);
  });
});

describe('setPrimaryUnit invariant — at most one primary per person', () => {
  it('flip semantics: target gets primary=true, all others get false', () => {
    const before: Array<{ unitId: number; primary: boolean }> = [
      { unitId: 1, primary: true },
      { unitId: 2, primary: false },
      { unitId: 3, primary: false },
    ];
    const target = 2;
    const after = before.map((r) => ({ unitId: r.unitId, primary: r.unitId === target }));
    expect(after.find((r) => r.unitId === 1)?.primary).toBe(false);
    expect(after.find((r) => r.unitId === 2)?.primary).toBe(true);
    expect(after.find((r) => r.unitId === 3)?.primary).toBe(false);
    expect(after.filter((r) => r.primary).length).toBe(1);
  });
});

describe('createOrgUnit slug + path composition', () => {
  it('slug from name + collision suffix + path from parent', () => {
    const taken = new Set(['engineering']);
    const slug = nextAvailableSlug(slugifyName('Engineering'), taken);
    expect(slug).toBe('engineering-2');
    const path = buildPath('/parent', slug);
    expect(path).toBe('/parent/engineering-2');
  });
});

// ─── New tests ───────────────────────────────────────────────────────────────

// ─── listOrgUnits ─────────────────────────────────────────────────────────────

describe('listOrgUnits', () => {
  beforeEach(resetCaptured);

  it('returns rows ordered by path for a given clientId', async () => {
    const rows = [
      makeUnit({ id: 1, path: '/eng', slug: 'eng' }),
      makeUnit({ id: 2, path: '/eng/platform', slug: 'platform', parentId: 1 }),
    ];
    captured.selectRowsQueue.push(rows);
    const result = await listOrgUnits(7);
    expect(result).toHaveLength(2);
    expect(result[0].slug).toBe('eng');
    expect(result[1].slug).toBe('platform');
  });

  it('returns an empty array when the client has no units', async () => {
    captured.selectRowsQueue.push([]);
    expect(await listOrgUnits(99)).toEqual([]);
  });
});

// ─── getOrgUnitTree ───────────────────────────────────────────────────────────

describe('getOrgUnitTree', () => {
  beforeEach(resetCaptured);

  it('returns [] when the client has no units', async () => {
    captured.selectRowsQueue.push([]); // listOrgUnits → empty
    captured.selectRowsQueue.push([]); // memberCount groupBy → empty
    expect(await getOrgUnitTree(7)).toEqual([]);
  });

  it('builds a root→child tree with correct memberCount', async () => {
    const parent = makeUnit({ id: 1, parentId: null, slug: 'eng', path: '/eng', sortOrder: 0 });
    const child = makeUnit({ id: 2, parentId: 1, slug: 'platform', path: '/eng/platform', sortOrder: 0, name: 'Platform' });
    captured.selectRowsQueue.push([parent, child]); // listOrgUnits
    captured.selectRowsQueue.push([{ orgUnitId: 1, count: 3 }, { orgUnitId: 2, count: 1 }]); // memberCount

    const tree = await getOrgUnitTree(7);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe(1);
    expect(tree[0].memberCount).toBe(3);
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].id).toBe(2);
    expect(tree[0].children[0].memberCount).toBe(1);
  });

  it('assigns memberCount=0 for units absent from the counts query', async () => {
    const root = makeUnit({ id: 5, parentId: null, slug: 'ops', path: '/ops', sortOrder: 0, name: 'Ops' });
    captured.selectRowsQueue.push([root]);
    captured.selectRowsQueue.push([]); // no member counts
    const tree = await getOrgUnitTree(7);
    expect(tree[0].memberCount).toBe(0);
  });

  it('surfaces orphan nodes (parent not found) as roots rather than swallowing', async () => {
    // id=2 has parentId=999 which is not in the flat list → orphan defense
    const orphan = makeUnit({ id: 2, parentId: 999, slug: 'orphan', path: '/parent/orphan', sortOrder: 0 });
    captured.selectRowsQueue.push([orphan]);
    captured.selectRowsQueue.push([]);
    const tree = await getOrgUnitTree(7);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe(2);
  });

  it('sorts children by sortOrder then name', async () => {
    const parent = makeUnit({ id: 1, parentId: null, slug: 'root', path: '/root', sortOrder: 0, name: 'Root' });
    const c1 = makeUnit({ id: 2, parentId: 1, slug: 'zebra', path: '/root/zebra', sortOrder: 1, name: 'Zebra' });
    const c2 = makeUnit({ id: 3, parentId: 1, slug: 'alpha', path: '/root/alpha', sortOrder: 0, name: 'Alpha' });
    captured.selectRowsQueue.push([parent, c1, c2]);
    captured.selectRowsQueue.push([]);
    const tree = await getOrgUnitTree(7);
    expect(tree[0].children.map((c) => c.slug)).toEqual(['alpha', 'zebra']);
  });
});

// ─── getOrgUnitById ───────────────────────────────────────────────────────────

describe('getOrgUnitById', () => {
  beforeEach(resetCaptured);

  it('returns null when the unit does not exist for the client', async () => {
    captured.selectRowsQueue.push([]); // loadUnitOwned → not found
    expect(await getOrgUnitById(7, 999)).toBeNull();
  });

  it('returns the unit with empty ancestors and members for a root unit with no members', async () => {
    const unit = makeUnit({ id: 1, path: '/eng', slug: 'eng', parentId: null });
    captured.selectRowsQueue.push([unit]); // loadUnitOwned
    // path '/eng' → segments ['eng'] → ancestorSlugs [] → no ancestor query
    captured.selectRowsQueue.push([]); // members orderBy
    const result = await getOrgUnitById(7, 1);
    expect(result).not.toBeNull();
    expect(result!.unit.id).toBe(1);
    expect(result!.ancestors).toEqual([]);
    expect(result!.members).toEqual([]);
  });

  it('resolves ancestors from path segments and orders by depth', async () => {
    const unit = makeUnit({ id: 3, path: '/eng/platform/runtime', slug: 'runtime', parentId: 2 });
    const engRow = { id: 1, name: 'Engineering', slug: 'eng', path: '/eng' };
    const platformRow = { id: 2, name: 'Platform', slug: 'platform', path: '/eng/platform' };
    captured.selectRowsQueue.push([unit]);              // loadUnitOwned
    captured.selectRowsQueue.push([engRow, platformRow]); // ancestor slug-in query (then)
    captured.selectRowsQueue.push([]);                  // members
    const result = await getOrgUnitById(7, 3);
    expect(result!.ancestors).toHaveLength(2);
    expect(result!.ancestors[0].slug).toBe('eng');
    expect(result!.ancestors[1].slug).toBe('platform');
  });

  it('maps member rows correctly including roleInUnit and primary flag', async () => {
    const unit = makeUnit({ id: 1, path: '/eng', slug: 'eng', parentId: null });
    const memberRow = {
      personId: 42,
      fullName: 'Ada Lovelace',
      title: 'Staff Engineer',
      primary: true,
      roleInUnit: 'Tech Lead',
    };
    captured.selectRowsQueue.push([unit]);        // loadUnitOwned
    // no ancestor query (root unit)
    captured.selectRowsQueue.push([memberRow]);   // members orderBy
    const result = await getOrgUnitById(7, 1);
    expect(result!.members).toHaveLength(1);
    expect(result!.members[0]).toEqual({
      personId: 42,
      fullName: 'Ada Lovelace',
      title: 'Staff Engineer',
      primary: true,
      roleInUnit: 'Tech Lead',
    });
  });
});

// ─── createOrgUnit ────────────────────────────────────────────────────────────

describe('createOrgUnit', () => {
  beforeEach(resetCaptured);

  it('refuses an empty name', async () => {
    await expect(createOrgUnit(7, 99, { name: '   ' })).rejects.toThrow(/name is required/i);
  });

  it('creates a root unit (no parentId) with correct slug + path', async () => {
    const created = makeUnit({ id: 10, slug: 'engineering', path: '/engineering' });
    captured.selectRowsQueue.push([]); // getTakenSlugs → no collision
    captured.insertReturning.push([created]);

    const result = await createOrgUnit(7, 99, { name: 'Engineering' });

    expect(captured.inserts).toHaveLength(1);
    const vals = captured.inserts[0].values as Record<string, unknown>;
    expect(vals.clientId).toBe(7);
    expect(vals.parentId).toBe(null);
    expect(vals.slug).toBe('engineering');
    expect(vals.path).toBe('/engineering');
    expect(vals.createdBy).toBe(99);
    expect(result.id).toBe(10);
  });

  it('creates a child unit under a verified parent', async () => {
    const parent = makeUnit({ id: 1, path: '/eng', slug: 'eng' });
    const created = makeUnit({ id: 11, slug: 'platform', path: '/eng/platform', parentId: 1, name: 'Platform' });
    // 1. loadUnitOwned for parent
    captured.selectRowsQueue.push([parent]);
    // 2. getTakenSlugs
    captured.selectRowsQueue.push([]);
    captured.insertReturning.push([created]);

    const result = await createOrgUnit(7, 99, { name: 'Platform', parentId: 1 });

    const vals = captured.inserts[0].values as Record<string, unknown>;
    expect(vals.parentId).toBe(1);
    expect(vals.path).toBe('/eng/platform');
    expect(result.id).toBe(11);
  });

  it('throws when the parent unit does not belong to the client', async () => {
    captured.selectRowsQueue.push([]); // loadUnitOwned → not found
    await expect(createOrgUnit(7, 99, { name: 'Platform', parentId: 999 }))
      .rejects.toThrow(/parent org unit 999 not found/i);
  });

  it('throws when leadPersonId does not belong to the client', async () => {
    // No parent → skip parent lookup. Then leadPerson lookup → not found.
    captured.selectRowsQueue.push([]); // leadPerson lookup (limit) → not found
    await expect(createOrgUnit(7, 99, { name: 'Sales', leadPersonId: 888 }))
      .rejects.toThrow(/lead person 888 not found/i);
  });

  it('appends -2 suffix on slug collision', async () => {
    const created = makeUnit({ id: 12, slug: 'engineering-2', path: '/engineering-2' });
    // getTakenSlugs returns a set that includes 'engineering'
    captured.selectRowsQueue.push([{ slug: 'engineering' }]);
    captured.insertReturning.push([created]);

    await createOrgUnit(7, 99, { name: 'Engineering' });

    const vals = captured.inserts[0].values as Record<string, unknown>;
    expect(vals.slug).toBe('engineering-2');
    expect(vals.path).toBe('/engineering-2');
  });

  it('passes all optional fields through to the insert', async () => {
    const created = makeUnit({ id: 13, slug: 'design', path: '/design', color: '#ff0000', icon: 'palette', sortOrder: 5 });
    captured.selectRowsQueue.push([]); // getTakenSlugs
    captured.insertReturning.push([created]);

    await createOrgUnit(7, null, {
      name: 'Design',
      color: '#ff0000',
      icon: 'palette',
      sortOrder: 5,
      description: 'Design team',
    });

    const vals = captured.inserts[0].values as Record<string, unknown>;
    expect(vals.color).toBe('#ff0000');
    expect(vals.icon).toBe('palette');
    expect(vals.sortOrder).toBe(5);
    expect(vals.description).toBe('Design team');
    expect(vals.createdBy).toBeNull();
  });
});

// ─── updateOrgUnit ────────────────────────────────────────────────────────────

describe('updateOrgUnit', () => {
  beforeEach(resetCaptured);

  it('returns null when the unit is not found', async () => {
    captured.selectRowsQueue.push([]); // loadUnitOwned → not found
    expect(await updateOrgUnit(7, 99, 999, { name: 'X' })).toBeNull();
  });

  it('applies a name change and returns the updated row', async () => {
    const before = makeUnit({ id: 1 });
    const after = { ...before, name: 'Platform Engineering' };
    captured.selectRowsQueue.push([before]); // loadUnitOwned
    captured.updateReturning.push([after]);

    const result = await updateOrgUnit(7, 99, 1, { name: 'Platform Engineering' });

    expect(result!.name).toBe('Platform Engineering');
    expect(captured.updates).toHaveLength(1);
    expect(captured.updates[0].set).toMatchObject({ name: 'Platform Engineering' });
  });

  it('applies color, icon, description, sortOrder patches', async () => {
    const before = makeUnit({ id: 1 });
    const after = { ...before, color: '#0ea5e9', icon: 'group', description: 'Core team', sortOrder: 3 };
    captured.selectRowsQueue.push([before]);
    captured.updateReturning.push([after]);

    const result = await updateOrgUnit(7, 99, 1, {
      color: '#0ea5e9',
      icon: 'group',
      description: 'Core team',
      sortOrder: 3,
    });

    expect(result!.color).toBe('#0ea5e9');
    expect(captured.updates[0].set).toMatchObject({
      color: '#0ea5e9',
      icon: 'group',
      description: 'Core team',
      sortOrder: 3,
    });
  });

  it('clears description when patch.description=null', async () => {
    const before = makeUnit({ id: 1, description: 'old text' });
    const after = { ...before, description: null };
    captured.selectRowsQueue.push([before]);
    captured.updateReturning.push([after]);

    const result = await updateOrgUnit(7, 99, 1, { description: null });
    expect(result!.description).toBeNull();
    expect(captured.updates[0].set).toMatchObject({ description: null });
  });

  it('throws when leadPersonId does not belong to the client', async () => {
    const before = makeUnit({ id: 1 });
    captured.selectRowsQueue.push([before]);   // loadUnitOwned
    captured.selectRowsQueue.push([]);         // leadPerson lookup → not found
    await expect(updateOrgUnit(7, 99, 1, { leadPersonId: 777 }))
      .rejects.toThrow(/lead person 777 not found/i);
  });

  it('clears leadPersonId when patch.leadPersonId=null', async () => {
    const before = makeUnit({ id: 1, leadPersonId: 5 });
    const after = { ...before, leadPersonId: null };
    captured.selectRowsQueue.push([before]);
    captured.updateReturning.push([after]);

    const result = await updateOrgUnit(7, 99, 1, { leadPersonId: null });
    expect(result!.leadPersonId).toBeNull();
    expect(captured.updates[0].set).toMatchObject({ leadPersonId: null });
  });

  it('does not change slug or path on name rename (URL stability)', async () => {
    const before = makeUnit({ id: 1, slug: 'engineering', path: '/engineering' });
    const after = { ...before, name: 'Software Engineering' };
    captured.selectRowsQueue.push([before]);
    captured.updateReturning.push([after]);

    await updateOrgUnit(7, 99, 1, { name: 'Software Engineering' });

    const setPayload = captured.updates[0].set as Record<string, unknown>;
    expect(setPayload).not.toHaveProperty('slug');
    expect(setPayload).not.toHaveProperty('path');
  });
});

// ─── moveOrgUnit ──────────────────────────────────────────────────────────────

describe('moveOrgUnit', () => {
  beforeEach(resetCaptured);

  it('returns null when the unit is not found', async () => {
    captured.selectRowsQueue.push([]); // loadUnitOwned → not found
    expect(await moveOrgUnit(7, 99, 999, null)).toBeNull();
  });

  it('is a no-op when parentId is already the same (returns moving unit)', async () => {
    const unit = makeUnit({ id: 1, parentId: null, path: '/eng', slug: 'eng' });
    captured.selectRowsQueue.push([unit]); // loadUnitOwned
    const result = await moveOrgUnit(7, 99, 1, null);
    expect(result).toEqual(unit);
    expect(captured.txCalls).toBe(0);
  });

  it('throws when the new parent does not belong to the client', async () => {
    const unit = makeUnit({ id: 1, parentId: null, path: '/eng', slug: 'eng' });
    captured.selectRowsQueue.push([unit]); // moving unit
    captured.selectRowsQueue.push([]);     // new parent lookup → not found
    // subtree query (thenable) → no rows (needed before cycle check fails on throw)
    captured.selectRowsQueue.push([unit]); // subtree
    await expect(moveOrgUnit(7, 99, 1, 999)).rejects.toThrow(/parent org unit 999 not found/i);
  });

  it('throws on cycle — moving unit under one of its descendants', async () => {
    const unit = makeUnit({ id: 1, parentId: null, path: '/eng', slug: 'eng' });
    const descendant = makeUnit({ id: 2, parentId: 1, path: '/eng/platform', slug: 'platform', name: 'Platform' });
    captured.selectRowsQueue.push([unit]);       // moving unit
    captured.selectRowsQueue.push([descendant]); // new parent (descendant of moving unit)
    // subtree includes the moving unit and descendant
    captured.selectRowsQueue.push([{ id: 1, path: '/eng' }, { id: 2, path: '/eng/platform' }]);
    await expect(moveOrgUnit(7, 99, 1, 2))
      .rejects.toThrow(/cannot move org unit under itself/i);
  });

  it('promotes to root (null parent) and rewrites path, runs one tx', async () => {
    const unit = makeUnit({ id: 2, parentId: 1, path: '/eng/platform', slug: 'platform', name: 'Platform' });
    const updated = { ...unit, parentId: null, path: '/platform' };
    captured.selectRowsQueue.push([unit]);    // moving unit
    // newParentId=null → no parent lookup
    captured.selectRowsQueue.push([{ id: 2, path: '/eng/platform' }]); // subtree (only self)
    // tx: update self + no descendants
    // final fetch
    captured.selectRowsQueue.push([updated]);

    const result = await moveOrgUnit(7, 99, 2, null);
    expect(result!.parentId).toBeNull();
    expect(result!.path).toBe('/platform');
    expect(captured.txCalls).toBe(1);
    expect(captured.updates[0].set).toMatchObject({ parentId: null, path: '/platform' });
  });

  it('rewrites descendant paths in the tx', async () => {
    const unit = makeUnit({ id: 1, parentId: null, path: '/eng', slug: 'eng' });
    const newParent = makeUnit({ id: 5, parentId: null, path: '/infra', slug: 'infra', name: 'Infra' });
    const desc = { id: 3, path: '/eng/runtime' };
    const updated = { ...unit, parentId: 5, path: '/infra/eng' };

    captured.selectRowsQueue.push([unit]);       // moving unit
    captured.selectRowsQueue.push([newParent]);  // new parent lookup
    captured.selectRowsQueue.push([{ id: 1, path: '/eng' }, desc]); // subtree
    // tx: update unit + update descendant
    // final fetch
    captured.selectRowsQueue.push([updated]);

    const result = await moveOrgUnit(7, 99, 1, 5);
    expect(result!.path).toBe('/infra/eng');
    // Two updates: the unit itself + the descendant
    expect(captured.updates.length).toBe(2);
    expect(captured.updates[1].set).toMatchObject({ path: '/infra/eng/runtime' });
  });
});

// ─── deleteOrgUnit ────────────────────────────────────────────────────────────

describe('deleteOrgUnit', () => {
  beforeEach(resetCaptured);

  it('returns false when the unit is not found', async () => {
    captured.selectRowsQueue.push([]); // loadUnitOwned → not found
    expect(await deleteOrgUnit(7, 99, 999)).toBe(false);
  });

  it('throws when the unit has members and force is not set', async () => {
    const unit = makeUnit({ id: 1 });
    captured.selectRowsQueue.push([unit]);              // loadUnitOwned
    captured.selectRowsQueue.push([{ count: 2 }]);     // memberCount
    captured.selectRowsQueue.push([]);                  // childRows (none)
    await expect(deleteOrgUnit(7, 99, 1)).rejects.toThrow(/force=true/i);
  });

  it('throws when the unit has children and force is not set', async () => {
    const unit = makeUnit({ id: 1 });
    const child = makeUnit({ id: 2, parentId: 1, slug: 'child', path: '/engineering/child', name: 'Child' });
    captured.selectRowsQueue.push([unit]);              // loadUnitOwned
    captured.selectRowsQueue.push([{ count: 0 }]);     // memberCount
    captured.selectRowsQueue.push([child]);             // childRows
    await expect(deleteOrgUnit(7, 99, 1)).rejects.toThrow(/force=true/i);
  });

  it('deletes a leaf unit with no members or children (happy path)', async () => {
    const unit = makeUnit({ id: 1, parentId: null, path: '/eng', slug: 'eng' });
    captured.selectRowsQueue.push([unit]);          // loadUnitOwned
    captured.selectRowsQueue.push([{ count: 0 }]); // memberCount
    captured.selectRowsQueue.push([]);              // childRows
    // newParentId = null → no loadUnitOwned for newParent
    captured.selectRowsQueue.push([]);              // subtree (no descendants)

    const result = await deleteOrgUnit(7, 99, 1);
    expect(result).toBe(true);
    expect(captured.txCalls).toBe(1);
  });

  it('cascade-deletes members when force=true', async () => {
    const unit = makeUnit({ id: 1, parentId: null, path: '/eng', slug: 'eng' });
    captured.selectRowsQueue.push([unit]);          // loadUnitOwned
    captured.selectRowsQueue.push([{ count: 3 }]); // memberCount = 3
    captured.selectRowsQueue.push([]);              // childRows
    captured.selectRowsQueue.push([]);              // subtree
    // tx: delete members + delete unit

    const result = await deleteOrgUnit(7, 99, 1, { force: true });
    expect(result).toBe(true);
    expect(captured.txCalls).toBe(1);
    // First delete in tx should be the members delete
    expect(captured.deletes.length).toBeGreaterThanOrEqual(1);
  });

  it('re-parents children to the deleted unit\'s parent when force=true', async () => {
    // Unit id=2 (child of id=1) is being deleted with force. Its child id=3
    // should be re-parented to id=1.
    const unit = makeUnit({ id: 2, parentId: 1, slug: 'platform', path: '/eng/platform', name: 'Platform' });
    const child = makeUnit({ id: 3, parentId: 2, slug: 'runtime', path: '/eng/platform/runtime', name: 'Runtime' });
    const grandparent = makeUnit({ id: 1, path: '/eng', slug: 'eng' });

    captured.selectRowsQueue.push([unit]);           // loadUnitOwned for unit being deleted
    captured.selectRowsQueue.push([{ count: 0 }]);  // memberCount
    captured.selectRowsQueue.push([child]);          // childRows
    captured.selectRowsQueue.push([grandparent]);    // loadUnitOwned for newParent (unit.parentId=1)
    captured.selectRowsQueue.push([]);               // subtree (no deeper descendants)

    const result = await deleteOrgUnit(7, 99, 2, { force: true });
    expect(result).toBe(true);
    // At least one update should re-parent the child
    const reparentUpdate = captured.updates.find(
      (u) => (u.set as Record<string, unknown>)?.path === '/eng/runtime',
    );
    expect(reparentUpdate).toBeDefined();
  });
});

// ─── addMember ────────────────────────────────────────────────────────────────

describe('addMember', () => {
  beforeEach(resetCaptured);

  it('throws when the org unit does not belong to the client', async () => {
    captured.selectRowsQueue.push([]); // loadUnitOwned → not found
    await expect(
      addMember(7, 99, { orgUnitId: 1, personId: 42 }),
    ).rejects.toThrow(/org unit 1 not found/i);
  });

  it('throws when the person does not belong to the client', async () => {
    const unit = makeUnit({ id: 1 });
    captured.selectRowsQueue.push([unit]); // loadUnitOwned
    captured.selectRowsQueue.push([]);     // person lookup → not found
    await expect(
      addMember(7, 99, { orgUnitId: 1, personId: 42 }),
    ).rejects.toThrow(/person 42 not found/i);
  });

  it('inserts membership row with correct fields (non-primary)', async () => {
    const unit = makeUnit({ id: 1 });
    const person = { id: 42 };
    const memberRow = { id: 100, clientId: 7, orgUnitId: 1, personId: 42, primary: false, roleInUnit: 'Contributor' };
    captured.selectRowsQueue.push([unit]);        // loadUnitOwned
    captured.selectRowsQueue.push([person]);      // person lookup
    captured.insertReturning.push([memberRow]);   // upsert returning

    const result = await addMember(7, 99, {
      orgUnitId: 1,
      personId: 42,
      primary: false,
      roleInUnit: 'Contributor',
    });

    expect(captured.inserts).toHaveLength(1);
    const vals = captured.inserts[0].values as Record<string, unknown>;
    expect(vals.orgUnitId).toBe(1);
    expect(vals.personId).toBe(42);
    expect(vals.primary).toBe(false);
    expect(vals.roleInUnit).toBe('Contributor');
    expect(result.id).toBe(100);
  });

  it('flips other memberships to primary=false when primary=true', async () => {
    const unit = makeUnit({ id: 1 });
    const person = { id: 42 };
    const memberRow = { id: 101, clientId: 7, orgUnitId: 1, personId: 42, primary: true, roleInUnit: null };
    captured.selectRowsQueue.push([unit]);
    captured.selectRowsQueue.push([person]);
    captured.insertReturning.push([memberRow]);
    // tx: insert (upsert) + update(primary=false on others)

    await addMember(7, 99, { orgUnitId: 1, personId: 42, primary: true });

    // One update should set primary=false for the person's other memberships
    const flipUpdate = captured.updates.find(
      (u) => (u.set as Record<string, unknown>)?.primary === false,
    );
    expect(flipUpdate).toBeDefined();
  });

  it('runs inside a transaction', async () => {
    const unit = makeUnit({ id: 1 });
    const person = { id: 42 };
    const memberRow = { id: 102, clientId: 7, orgUnitId: 1, personId: 42, primary: false, roleInUnit: null };
    captured.selectRowsQueue.push([unit]);
    captured.selectRowsQueue.push([person]);
    captured.insertReturning.push([memberRow]);

    await addMember(7, 99, { orgUnitId: 1, personId: 42 });
    expect(captured.txCalls).toBe(1);
  });
});

// ─── removeMember ─────────────────────────────────────────────────────────────

describe('removeMember', () => {
  beforeEach(resetCaptured);

  it('returns false when the (person, orgUnit) pair does not exist', async () => {
    captured.deleteReturning.push([]); // delete returns no rows
    const result = await removeMember(7, 99, { orgUnitId: 1, personId: 42 });
    expect(result).toBe(false);
  });

  it('returns true and logs audit when the row is deleted', async () => {
    captured.deleteReturning.push([{ id: 55 }]);
    const result = await removeMember(7, 99, { orgUnitId: 1, personId: 42 });
    expect(result).toBe(true);
    expect(captured.deletes).toHaveLength(1);
  });
});

// ─── setPrimaryUnit ───────────────────────────────────────────────────────────

describe('setPrimaryUnit', () => {
  beforeEach(resetCaptured);

  it('returns false when the (person, orgUnit) pair does not exist', async () => {
    captured.selectRowsQueue.push([]); // lookup → not found
    expect(await setPrimaryUnit(7, 99, 42, 1)).toBe(false);
  });

  it('returns true and runs a transaction when the pair exists', async () => {
    captured.selectRowsQueue.push([{ id: 55 }]); // existing lookup found
    // tx: update others to false + update self to true

    const result = await setPrimaryUnit(7, 99, 42, 1);
    expect(result).toBe(true);
    expect(captured.txCalls).toBe(1);
  });

  it('issues two updates inside the tx: others→false, self→true', async () => {
    captured.selectRowsQueue.push([{ id: 55 }]);

    await setPrimaryUnit(7, 99, 42, 1);

    // First update: primary=false on all other memberships for this person
    expect(captured.updates[0].set).toMatchObject({ primary: false });
    // Second update: primary=true on the target membership
    expect(captured.updates[1].set).toMatchObject({ primary: true });
  });
});
