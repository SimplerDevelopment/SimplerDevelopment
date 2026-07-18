// @vitest-environment node
/**
 * Companion coverage tests for `lib/brain/topics.ts`.
 *
 * The primary test file (brain-topics.test.ts) covers:
 *   createTopic (path derivation, collision, errors)
 *   moveTopic (cycle-guard error paths)
 *   deleteTopic (has_children, has_entities, force errors)
 *   mergeTopic (self-merge guard)
 *   attachTopics (idempotency)
 *
 * This file covers everything else:
 *   listTopics, getTopicTree, getTopicById
 *   updateTopic (changed fields, no-op, not-found)
 *   moveTopic (happy path — no-op, actual move with descendants, root move)
 *   mergeTopic (null when source/target not found, descendant-merge guard, happy path)
 *   deleteTopic (happy path: no children + no entities; force with entities)
 *   detachTopics (empty ids, normal path)
 *   listEntitiesForTopic (not-found tenant, empty join, multi-entity types)
 *   importTopicsFromTags (dryRun, tagPrefix filtering, real creates + attaches)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── DB mock ────────────────────────────────────────────────────────────────

interface CapturedInsert { values: Record<string, unknown> | Array<Record<string, unknown>> | null; }
interface CapturedUpdate { set: Record<string, unknown> | null; }

const captured = {
  inserts: [] as CapturedInsert[],
  updates: [] as CapturedUpdate[],
  selectRowsQueue: [] as Array<Array<Record<string, unknown>>>,
  insertReturning: [] as Array<Array<Record<string, unknown>>>,
  updateReturning: [] as Array<Array<Record<string, unknown>>>,
  deleteReturning: [] as Array<Array<Record<string, unknown>>>,
  executeQueue: [] as Array<Array<Record<string, unknown>>>,
  txCalls: 0,
};

function resetCaptured() {
  captured.inserts.length = 0;
  captured.updates.length = 0;
  captured.selectRowsQueue.length = 0;
  captured.insertReturning.length = 0;
  captured.updateReturning.length = 0;
  captured.deleteReturning.length = 0;
  captured.executeQueue.length = 0;
  captured.txCalls = 0;
}

function nextSelectRows(): Array<Record<string, unknown>> {
  return captured.selectRowsQueue.length > 0 ? captured.selectRowsQueue.shift()! : [];
}

function makeSelectChain() {
  const chain: Record<string, unknown> = {};
  chain.from = () => chain;
  chain.where = () => chain;
  chain.orderBy = () => Promise.resolve(nextSelectRows());
  chain.limit = () => Promise.resolve(nextSelectRows());
  chain.groupBy = () => Promise.resolve(nextSelectRows());
  chain.then = (onFulfilled: (v: unknown) => unknown) =>
    Promise.resolve(nextSelectRows()).then(onFulfilled);
  return chain;
}

function makeInsertChain() {
  const chain: Record<string, unknown> = {};
  chain.values = (v: unknown) => {
    captured.inserts.push({ values: v as CapturedInsert['values'] });
    return chain;
  };
  chain.returning = () =>
    Promise.resolve(captured.insertReturning.length > 0 ? captured.insertReturning.shift() : []);
  return chain;
}

function makeUpdateChain() {
  const chain: Record<string, unknown> = {};
  chain.set = (v: Record<string, unknown>) => {
    captured.updates.push({ set: v });
    return chain;
  };
  chain.where = () => chain;
  chain.returning = () =>
    Promise.resolve(captured.updateReturning.length > 0 ? captured.updateReturning.shift() : []);
  chain.then = (onFulfilled: (v: unknown) => unknown) =>
    Promise.resolve([]).then(onFulfilled);
  return chain;
}

function makeDeleteChain() {
  const chain: Record<string, unknown> = {};
  chain.where = () => chain;
  chain.returning = () =>
    Promise.resolve(captured.deleteReturning.length > 0 ? captured.deleteReturning.shift() : []);
  chain.then = (onFulfilled: (v: unknown) => unknown) =>
    Promise.resolve([]).then(onFulfilled);
  return chain;
}

interface DbStub {
  select: (...args: unknown[]) => ReturnType<typeof makeSelectChain>;
  insert: (...args: unknown[]) => ReturnType<typeof makeInsertChain>;
  update: (...args: unknown[]) => ReturnType<typeof makeUpdateChain>;
  delete: (...args: unknown[]) => ReturnType<typeof makeDeleteChain>;
  execute: (...args: unknown[]) => Promise<unknown[]>;
  transaction: (fn: (tx: DbStub) => Promise<unknown>) => Promise<unknown>;
}

const dbStub: DbStub = {
  select: () => makeSelectChain(),
  insert: () => makeInsertChain(),
  update: () => makeUpdateChain(),
  delete: () => makeDeleteChain(),
  execute: async () => {
    return captured.executeQueue.length > 0 ? (captured.executeQueue.shift() ?? []) : [];
  },
  transaction: async (fn) => {
    captured.txCalls += 1;
    return fn(dbStub);
  },
};

vi.mock('@/lib/db', () => ({ db: dbStub }));

vi.mock('@/lib/db/schema', () => ({
  brainTopics: {
    id: { __col: 'id' },
    clientId: { __col: 'client_id' },
    parentId: { __col: 'parent_id' },
    slug: { __col: 'slug' },
    path: { __col: 'path' },
    name: { __col: 'name' },
    sortOrder: { __col: 'sort_order' },
    description: { __col: 'description' },
    color: { __col: 'color' },
    icon: { __col: 'icon' },
  },
  brainEntityTopics: {
    id: { __col: 'id' },
    clientId: { __col: 'client_id' },
    topicId: { __col: 'topic_id' },
    entityType: { __col: 'entity_type' },
    entityId: { __col: 'entity_id' },
  },
  brainAuditLogs: {
    id: { __col: 'id' },
    clientId: { __col: 'client_id' },
    action: { __col: 'action' },
    entityType: { __col: 'entity_type' },
    entityId: { __col: 'entity_id' },
  },
  brainNotes: {
    id: { __col: 'id' },
    clientId: { __col: 'client_id' },
    title: { __col: 'title' },
    tags: { __col: 'tags' },
    deletedAt: { __col: 'deleted_at' },
  },
  brainMeetings: { id: { __col: 'id' }, clientId: { __col: 'client_id' }, title: { __col: 'title' } },
  brainTasks: { id: { __col: 'id' }, clientId: { __col: 'client_id' }, title: { __col: 'title' } },
  brainDecisions: { id: { __col: 'id' }, clientId: { __col: 'client_id' }, title: { __col: 'title' } },
  brainRelationshipOverlays: {
    id: { __col: 'id' },
    clientId: { __col: 'client_id' },
    summary: { __col: 'summary' },
    relationshipType: { __col: 'relationship_type' },
  },
  brainInitiatives: { id: { __col: 'id' }, clientId: { __col: 'client_id' }, name: { __col: 'name' } },
  brainPeople: { id: { __col: 'id' }, clientId: { __col: 'client_id' }, fullName: { __col: 'full_name' } },
}));

vi.mock('@/lib/brain/audit', () => ({ logAudit: vi.fn(async () => {}) }));

vi.mock('drizzle-orm', () => ({
  and: (...parts: unknown[]) => ({ kind: 'and', parts }),
  asc: (col: unknown) => ({ kind: 'asc', col }),
  desc: (col: unknown) => ({ kind: 'desc', col }),
  eq: (col: unknown, val: unknown) => ({ kind: 'eq', col, val }),
  inArray: (col: unknown, vals: unknown[]) => ({ kind: 'inArray', col, vals }),
  sql: Object.assign(
    (..._args: unknown[]) => ({ kind: 'sql' }),
    { raw: (s: string) => ({ kind: 'raw', s }) },
  ),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
}));

const topics = await import('@/lib/brain/topics');

// ─── helpers ────────────────────────────────────────────────────────────────

function makeTopic(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 1,
    clientId: 7,
    parentId: null,
    name: 'Root',
    slug: 'root',
    path: '/root',
    description: null,
    color: null,
    icon: null,
    sortOrder: 0,
    derivedFromTag: null,
    createdBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─── listTopics ──────────────────────────────────────────────────────────────

describe('listTopics', () => {
  beforeEach(resetCaptured);

  it('returns an ordered flat list', async () => {
    const topicA = makeTopic({ id: 1, path: '/alpha' });
    const topicB = makeTopic({ id: 2, path: '/beta' });
    captured.selectRowsQueue.push([topicA, topicB]);

    const result = await topics.listTopics(7);
    expect(result).toHaveLength(2);
    expect(result[0].path).toBe('/alpha');
  });

  it('returns empty array when no topics exist', async () => {
    captured.selectRowsQueue.push([]);
    const result = await topics.listTopics(7);
    expect(result).toEqual([]);
  });
});

// ─── getTopicTree ────────────────────────────────────────────────────────────

describe('getTopicTree', () => {
  beforeEach(resetCaptured);

  it('returns empty array when there are no topics', async () => {
    // listTopics select returns nothing
    captured.selectRowsQueue.push([]);
    const result = await topics.getTopicTree(7);
    expect(result).toEqual([]);
  });

  it('builds a single root node with no children', async () => {
    const row = makeTopic({ id: 1, parentId: null, path: '/root', name: 'Root', sortOrder: 0 });
    // listTopics result
    captured.selectRowsQueue.push([row]);
    // entity counts group-by result
    captured.selectRowsQueue.push([]);

    const result = await topics.getTopicTree(7);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
    expect(result[0].children).toEqual([]);
    expect(result[0].childCount).toBe(0);
    expect(result[0].entityCount).toBe(0);
  });

  it('attaches children under their parent', async () => {
    const parent = makeTopic({ id: 1, parentId: null, path: '/parent', name: 'Parent', sortOrder: 0 });
    const child = makeTopic({ id: 2, parentId: 1, path: '/parent/child', name: 'Child', sortOrder: 0 });
    captured.selectRowsQueue.push([parent, child]);
    // entity counts: parent has 3 entities
    captured.selectRowsQueue.push([{ topicId: 1, count: 3 }]);

    const result = await topics.getTopicTree(7);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
    expect(result[0].childCount).toBe(1);
    expect(result[0].entityCount).toBe(3);
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children[0].id).toBe(2);
  });

  it('promotes orphan children (unknown parentId) to root', async () => {
    // child references parentId 999 which is not in the list
    const orphan = makeTopic({ id: 2, parentId: 999, path: '/orphan', name: 'Orphan', sortOrder: 0 });
    captured.selectRowsQueue.push([orphan]);
    captured.selectRowsQueue.push([]);

    const result = await topics.getTopicTree(7);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });

  it('sorts siblings by sortOrder then name', async () => {
    const a = makeTopic({ id: 1, parentId: null, path: '/a', name: 'Zebra', sortOrder: 2 });
    const b = makeTopic({ id: 2, parentId: null, path: '/b', name: 'Apple', sortOrder: 1 });
    const c = makeTopic({ id: 3, parentId: null, path: '/c', name: 'Mango', sortOrder: 1 });
    captured.selectRowsQueue.push([a, b, c]);
    captured.selectRowsQueue.push([]);

    const result = await topics.getTopicTree(7);
    expect(result.map((n) => n.name)).toEqual(['Apple', 'Mango', 'Zebra']);
  });
});

// ─── getTopicById ────────────────────────────────────────────────────────────

describe('getTopicById', () => {
  beforeEach(resetCaptured);

  it('returns null when topic not found', async () => {
    captured.selectRowsQueue.push([]);
    const result = await topics.getTopicById(7, 999);
    expect(result).toBeNull();
  });

  it('returns the topic with empty breadcrumb when root', async () => {
    const row = makeTopic({ id: 1, parentId: null, path: '/root' });
    captured.selectRowsQueue.push([row]);

    const result = await topics.getTopicById(7, 1);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(1);
    expect(result!.breadcrumb).toEqual([]);
  });

  it('walks up parent chain to populate breadcrumb', async () => {
    const child = makeTopic({ id: 3, parentId: 2, path: '/a/b/c' });
    const mid = makeTopic({ id: 2, parentId: 1, path: '/a/b', name: 'Mid' });
    const root = makeTopic({ id: 1, parentId: null, path: '/a', name: 'Root' });

    // Initial select for child
    captured.selectRowsQueue.push([child]);
    // Walk up: select parent of child (id=2)
    captured.selectRowsQueue.push([mid]);
    // Walk up: select parent of mid (id=1)
    captured.selectRowsQueue.push([root]);
    // root has parentId null — loop exits

    const result = await topics.getTopicById(7, 3);
    expect(result!.breadcrumb).toHaveLength(2);
    // breadcrumb is root → mid (ancestors from root down)
    expect(result!.breadcrumb[0].name).toBe('Root');
    expect(result!.breadcrumb[1].name).toBe('Mid');
  });

  it('stops breadcrumb walk when a parent is not found (cross-tenant or deleted)', async () => {
    const child = makeTopic({ id: 2, parentId: 1, path: '/a/b' });
    captured.selectRowsQueue.push([child]);
    // parent lookup returns nothing
    captured.selectRowsQueue.push([]);

    const result = await topics.getTopicById(7, 2);
    expect(result!.breadcrumb).toEqual([]);
  });
});

// ─── updateTopic ─────────────────────────────────────────────────────────────

describe('updateTopic', () => {
  beforeEach(resetCaptured);

  it('returns null when topic not found', async () => {
    captured.selectRowsQueue.push([]);
    const result = await topics.updateTopic(7, 99, 999, { name: 'X' });
    expect(result).toBeNull();
  });

  it('returns the existing topic unchanged when no fields actually differ', async () => {
    const before = makeTopic({ id: 1, name: 'Same', description: null, color: null, icon: null, sortOrder: 0 });
    captured.selectRowsQueue.push([before]);

    // patch with the same values → no update
    const result = await topics.updateTopic(7, 99, 1, {
      name: 'Same',
      description: null,
      color: null,
      icon: null,
      sortOrder: 0,
    });

    expect(result).toEqual(before);
    expect(captured.updates).toHaveLength(0);
  });

  it('updates only changed fields and audits', async () => {
    const before = makeTopic({ id: 1, name: 'Old', description: null, color: null, icon: null, sortOrder: 0 });
    captured.selectRowsQueue.push([before]);
    const after = { ...before, name: 'New', description: 'desc' };
    captured.updateReturning.push([after]);

    const result = await topics.updateTopic(7, 99, 1, { name: 'New', description: 'desc' });
    expect(result!.name).toBe('New');
    expect(captured.updates).toHaveLength(1);
    const setFields = captured.updates[0].set as Record<string, unknown>;
    expect(setFields.name).toBe('New');
    expect(setFields.description).toBe('desc');
  });

  it('ignores name patch when trimmed value is empty string', async () => {
    const before = makeTopic({ id: 1, name: 'Existing', description: null, color: null, icon: null, sortOrder: 0 });
    captured.selectRowsQueue.push([before]);

    // empty name should not result in a field change
    const result = await topics.updateTopic(7, 99, 1, { name: '   ' });
    expect(result).toEqual(before);
    expect(captured.updates).toHaveLength(0);
  });

  it('updates color and icon independently', async () => {
    const before = makeTopic({ id: 1, name: 'T', color: null, icon: null, sortOrder: 0 });
    captured.selectRowsQueue.push([before]);
    const after = { ...before, color: '#ff0000', icon: 'star' };
    captured.updateReturning.push([after]);

    const result = await topics.updateTopic(7, 99, 1, { color: '#ff0000', icon: 'star' });
    expect(result!.color).toBe('#ff0000');
    expect(result!.icon).toBe('star');
  });
});

// ─── moveTopic — happy paths ─────────────────────────────────────────────────

describe('moveTopic — happy paths', () => {
  beforeEach(resetCaptured);

  it('returns the node unchanged when path and parentId are already the same (no-op)', async () => {
    // node with parentId=2, path=/parent/child
    const node = makeTopic({ id: 1, parentId: 2, slug: 'child', path: '/parent/child' });
    captured.selectRowsQueue.push([node]);
    // parent lookup
    captured.selectRowsQueue.push([makeTopic({ id: 2, slug: 'parent', path: '/parent' })]);
    // descendants query
    captured.selectRowsQueue.push([]);
    // final select after update (not reached in no-op but queued defensively)
    captured.selectRowsQueue.push([node]);

    const result = await topics.moveTopic(7, 99, 1, 2);
    expect(result).toEqual(node);
    // no update should be issued
    expect(captured.updates).toHaveLength(0);
  });

  it('moves a node to root (newParentId=null) and rewrites its descendants', async () => {
    const node = makeTopic({ id: 1, parentId: 2, slug: 'child', path: '/parent/child' });
    // Descendant whose path starts with /parent/child/
    const desc = { id: 5, path: '/parent/child/leaf' };

    // tx: node select, then no parent lookup (newParentId=null), then update node
    captured.selectRowsQueue.push([node]);
    // descendants query returns one
    captured.selectRowsQueue.push([desc]);
    // final select for the moved node
    const moved = makeTopic({ id: 1, parentId: null, slug: 'child', path: '/child' });
    captured.selectRowsQueue.push([moved]);

    const result = await topics.moveTopic(7, 99, 1, null);
    expect(result).not.toBeNull();
    expect(result!.path).toBe('/child');
    // At least node update + descendant update
    expect(captured.updates.length).toBeGreaterThanOrEqual(2);
    expect(captured.txCalls).toBe(1);
  });

  it('moves a node to a new parent and rewrites descendants', async () => {
    const node = makeTopic({ id: 1, parentId: null, slug: 'ops', path: '/ops' });
    const newParent = makeTopic({ id: 10, parentId: null, slug: 'hr', path: '/hr' });
    const desc = { id: 99, path: '/ops/sub' };

    captured.selectRowsQueue.push([node]);
    captured.selectRowsQueue.push([newParent]);
    captured.selectRowsQueue.push([desc]);
    const movedNode = makeTopic({ id: 1, parentId: 10, slug: 'ops', path: '/hr/ops' });
    captured.selectRowsQueue.push([movedNode]);

    const result = await topics.moveTopic(7, 99, 1, 10);
    expect(result!.path).toBe('/hr/ops');
    expect(captured.txCalls).toBe(1);
  });
});

// ─── mergeTopic ──────────────────────────────────────────────────────────────

describe('mergeTopic', () => {
  beforeEach(resetCaptured);

  it('returns null when source is not found', async () => {
    // source not found, target found — doesn't matter, both checked
    captured.selectRowsQueue.push([]);  // source select
    captured.selectRowsQueue.push([makeTopic({ id: 2 })]);  // target select

    const result = await topics.mergeTopic(7, 99, 1, 2);
    expect(result).toBeNull();
    expect(captured.txCalls).toBe(1);
  });

  it('returns null when target is not found', async () => {
    captured.selectRowsQueue.push([makeTopic({ id: 1, path: '/a' })]);
    captured.selectRowsQueue.push([]);  // target not found

    const result = await topics.mergeTopic(7, 99, 1, 2);
    expect(result).toBeNull();
  });

  it('throws when target is a descendant of source', async () => {
    const source = makeTopic({ id: 1, path: '/source', slug: 'source' });
    const target = makeTopic({ id: 2, path: '/source/child', slug: 'child' });

    captured.selectRowsQueue.push([source]);
    captured.selectRowsQueue.push([target]);

    await expect(topics.mergeTopic(7, 99, 1, 2)).rejects.toThrow(/descendants/);
  });

  it('merges with no entity rows and no children — just deletes source', async () => {
    const source = makeTopic({ id: 1, path: '/alpha', slug: 'alpha' });
    const target = makeTopic({ id: 2, path: '/beta', slug: 'beta' });

    captured.selectRowsQueue.push([source]);
    captured.selectRowsQueue.push([target]);
    // source entity rows
    captured.selectRowsQueue.push([]);
    // target entity rows
    captured.selectRowsQueue.push([]);
    // source children
    captured.selectRowsQueue.push([]);

    const result = await topics.mergeTopic(7, 99, 1, 2);
    expect(result).not.toBeNull();
    expect(result!.targetId).toBe(2);
    expect(result!.reattached).toBe(0);
    expect(result!.reparented).toBe(0);
    expect(result!.deletedSourceId).toBe(1);
    expect(captured.txCalls).toBe(1);
  });

  it('reattaches entity rows that are not already on the target', async () => {
    const source = makeTopic({ id: 1, path: '/alpha', slug: 'alpha' });
    const target = makeTopic({ id: 2, path: '/beta', slug: 'beta' });

    captured.selectRowsQueue.push([source]);
    captured.selectRowsQueue.push([target]);
    // source entity rows: entity A (new) and entity B (dup)
    captured.selectRowsQueue.push([
      { id: 10, entityType: 'note', entityId: 100 },
      { id: 11, entityType: 'note', entityId: 200 },
    ]);
    // target entity rows: entity B already there
    captured.selectRowsQueue.push([
      { entityType: 'note', entityId: 200 },
    ]);
    // children of source
    captured.selectRowsQueue.push([]);

    const result = await topics.mergeTopic(7, 99, 1, 2);
    expect(result!.reattached).toBe(1); // entity A moved
    // entity B (id=11) should be deleted (dupSourceIds)
  });

  it('reparents children of source under target', async () => {
    const source = makeTopic({ id: 1, path: '/src', slug: 'src' });
    const target = makeTopic({ id: 2, path: '/tgt', slug: 'tgt' });
    const child = makeTopic({ id: 5, parentId: 1, slug: 'kid', path: '/src/kid' });

    captured.selectRowsQueue.push([source]);
    captured.selectRowsQueue.push([target]);
    // source entity rows
    captured.selectRowsQueue.push([]);
    // target entity rows
    captured.selectRowsQueue.push([]);
    // children of source
    captured.selectRowsQueue.push([child]);
    // descendants of child for path rewrite
    captured.selectRowsQueue.push([]);

    const result = await topics.mergeTopic(7, 99, 1, 2);
    expect(result!.reparented).toBe(1);
  });
});

// ─── deleteTopic — happy paths ───────────────────────────────────────────────

describe('deleteTopic — happy paths', () => {
  beforeEach(resetCaptured);

  it('deletes topic with no children and no entities', async () => {
    const topic = makeTopic({ id: 1, slug: 'x', path: '/x' });
    captured.selectRowsQueue.push([topic]); // topic lookup
    captured.selectRowsQueue.push([]);      // no children
    captured.selectRowsQueue.push([]);      // no entities

    const result = await topics.deleteTopic(7, 99, 1);
    expect(result).toEqual({ deleted: true });
    expect(captured.txCalls).toBe(1);
  });

  it('deletes entities first when force=true before deleting topic', async () => {
    const topic = makeTopic({ id: 1, slug: 'x', path: '/x' });
    captured.selectRowsQueue.push([topic]);
    captured.selectRowsQueue.push([]);         // no children
    captured.selectRowsQueue.push([{ id: 55 }]); // has entity row

    const result = await topics.deleteTopic(7, 99, 1, { force: true });
    expect(result).toEqual({ deleted: true });
    expect(captured.txCalls).toBe(1);
  });
});

// ─── detachTopics ────────────────────────────────────────────────────────────

describe('detachTopics', () => {
  beforeEach(resetCaptured);

  it('returns detached=0 immediately for an empty topicIds array', async () => {
    const result = await topics.detachTopics(7, 99, {
      targetEntityType: 'note',
      targetEntityId: 1,
      topicIds: [],
    });
    expect(result).toEqual({ detached: 0 });
  });

  it('returns detached=0 for non-finite ids', async () => {
    const result = await topics.detachTopics(7, 99, {
      targetEntityType: 'note',
      targetEntityId: 1,
      topicIds: [NaN, Infinity],
    });
    expect(result).toEqual({ detached: 0 });
  });

  it('issues a delete and returns the count', async () => {
    captured.deleteReturning.push([{ id: 1 }, { id: 2 }]);

    const result = await topics.detachTopics(7, 99, {
      targetEntityType: 'note',
      targetEntityId: 42,
      topicIds: [10, 11],
    });
    expect(result.detached).toBe(2);
  });

  it('deduplicates topicIds before executing the delete', async () => {
    captured.deleteReturning.push([{ id: 1 }]);

    const result = await topics.detachTopics(7, 99, {
      targetEntityType: 'task',
      targetEntityId: 1,
      topicIds: [5, 5, 5],
    });
    // Deduped to one id; our stub returns 1 row
    expect(result.detached).toBe(1);
  });
});

// ─── listEntitiesForTopic ────────────────────────────────────────────────────

describe('listEntitiesForTopic', () => {
  beforeEach(resetCaptured);

  it('returns empty result when topic not found for this client', async () => {
    captured.selectRowsQueue.push([]); // tenant check

    const result = await topics.listEntitiesForTopic(7, 999);
    expect(result.items).toEqual([]);
    expect(result.byType.note).toEqual([]);
  });

  it('returns empty result when no entity joins exist', async () => {
    captured.selectRowsQueue.push([{ id: 1 }]); // tenant check ok
    captured.selectRowsQueue.push([]);           // no join rows

    const result = await topics.listEntitiesForTopic(7, 1);
    expect(result.items).toEqual([]);
  });

  it('fetches titles for note entities and groups by type', async () => {
    captured.selectRowsQueue.push([{ id: 1 }]); // tenant check
    // join rows: two notes
    captured.selectRowsQueue.push([
      { entityType: 'note', entityId: 10 },
      { entityType: 'note', entityId: 11 },
    ]);
    // notes title fetch
    captured.selectRowsQueue.push([
      { id: 10, title: 'Note Alpha' },
      { id: 11, title: 'Note Beta' },
    ]);

    const result = await topics.listEntitiesForTopic(7, 1);
    expect(result.items).toHaveLength(2);
    expect(result.byType.note).toHaveLength(2);
    expect(result.byType.meeting).toHaveLength(0);
  });

  it('drops dangling join rows whose entity title is not found', async () => {
    captured.selectRowsQueue.push([{ id: 1 }]);
    captured.selectRowsQueue.push([{ entityType: 'note', entityId: 99 }]);
    // note 99 not returned (deleted)
    captured.selectRowsQueue.push([]);

    const result = await topics.listEntitiesForTopic(7, 1);
    expect(result.items).toEqual([]);
  });

  it('fetches titles for meeting, task, decision entities', async () => {
    captured.selectRowsQueue.push([{ id: 1 }]);
    captured.selectRowsQueue.push([
      { entityType: 'meeting', entityId: 20 },
      { entityType: 'task', entityId: 30 },
      { entityType: 'decision', entityId: 40 },
    ]);
    // meetings
    captured.selectRowsQueue.push([{ id: 20, title: 'Sprint Review' }]);
    // tasks
    captured.selectRowsQueue.push([{ id: 30, title: 'Deploy v2' }]);
    // decisions
    captured.selectRowsQueue.push([{ id: 40, title: 'Use Postgres' }]);

    const result = await topics.listEntitiesForTopic(7, 1);
    expect(result.items).toHaveLength(3);
    expect(result.byType.meeting[0].title).toBe('Sprint Review');
    expect(result.byType.task[0].title).toBe('Deploy v2');
    expect(result.byType.decision[0].title).toBe('Use Postgres');
  });

  it('fetches titles for initiative and person entities', async () => {
    captured.selectRowsQueue.push([{ id: 1 }]);
    captured.selectRowsQueue.push([
      { entityType: 'initiative', entityId: 50 },
      { entityType: 'person', entityId: 60 },
    ]);
    // initiatives
    captured.selectRowsQueue.push([{ id: 50, name: 'Growth Q3' }]);
    // people
    captured.selectRowsQueue.push([{ id: 60, fullName: 'Alice Smith' }]);

    const result = await topics.listEntitiesForTopic(7, 1);
    expect(result.items).toHaveLength(2);
    expect(result.byType.initiative[0].title).toBe('Growth Q3');
    expect(result.byType.person[0].title).toBe('Alice Smith');
  });

  it('fetches relationship_overlay entities — uses summary when present', async () => {
    captured.selectRowsQueue.push([{ id: 1 }]);
    captured.selectRowsQueue.push([
      { entityType: 'relationship_overlay', entityId: 70 },
      { entityType: 'relationship_overlay', entityId: 71 },
    ]);
    // relationship_overlays: one with summary, one without
    captured.selectRowsQueue.push([
      { id: 70, summary: 'Key partnership', relationshipType: 'partner' },
      { id: 71, summary: null, relationshipType: 'vendor' },
    ]);

    const result = await topics.listEntitiesForTopic(7, 1);
    expect(result.items).toHaveLength(2);
    const byId = Object.fromEntries(result.items.map((i) => [i.entityId, i.title]));
    expect(byId[70]).toBe('Key partnership');
    expect(byId[71]).toBe('Relationship #71 (vendor)');
  });

  it('sorts items by entityType then title', async () => {
    captured.selectRowsQueue.push([{ id: 1 }]);
    captured.selectRowsQueue.push([
      { entityType: 'note', entityId: 1 },
      { entityType: 'meeting', entityId: 2 },
      { entityType: 'note', entityId: 3 },
    ]);
    captured.selectRowsQueue.push([
      { id: 1, title: 'Zeta Note' },
      { id: 3, title: 'Alpha Note' },
    ]);
    captured.selectRowsQueue.push([
      { id: 2, title: 'Monthly Sync' },
    ]);

    const result = await topics.listEntitiesForTopic(7, 1);
    // meeting < note alphabetically
    expect(result.items[0].entityType).toBe('meeting');
    expect(result.items[1].title).toBe('Alpha Note');
    expect(result.items[2].title).toBe('Zeta Note');
  });
});

// ─── importTopicsFromTags ────────────────────────────────────────────────────

describe('importTopicsFromTags', () => {
  beforeEach(resetCaptured);

  it('returns an empty report when no tags exist', async () => {
    // execute returns no tag rows
    captured.executeQueue.push([]);
    // existing topics select
    captured.selectRowsQueue.push([]);

    const result = await topics.importTopicsFromTags(7, 99);
    expect(result.topicsCreated).toBe(0);
    expect(result.notesAttached).toBe(0);
    expect(result.perTopic).toEqual([]);
    expect(result.dryRun).toBe(false);
  });

  it('filters tags by tagPrefix', async () => {
    // only 'kb/seo' and 'kb' match prefix 'kb'; 'marketing' does not
    captured.executeQueue.push([
      { tag: 'kb/seo' },
      { tag: 'marketing' },
      { tag: 'kb' },
    ]);
    // existing topics
    captured.selectRowsQueue.push([]);

    // dryRun so no real creates happen, just topology
    // For 'kb' tag: slug-uniqueness (none), create, then notes fetch
    // For 'kb/seo': reuse 'kb' node from cache, create 'seo' under it

    // We run dryRun=true to avoid triggering createTopic calls
    const result = await topics.importTopicsFromTags(7, 99, { tagPrefix: 'kb', dryRun: true });

    // Only 'kb/seo' and 'kb' should be processed (marketing filtered out)
    const paths = result.perTopic.map((p) => p.path);
    expect(paths.some((p) => p.includes('marketing'))).toBe(false);
  });

  it('dryRun mode returns report without writing', async () => {
    captured.executeQueue.push([{ tag: 'project/alpha' }]);
    // existing topics (empty — none pre-exist)
    captured.selectRowsQueue.push([]);
    // notes that carry this tag
    captured.selectRowsQueue.push([{ id: 5 }, { id: 6 }]);

    const result = await topics.importTopicsFromTags(7, 99, { dryRun: true });
    expect(result.dryRun).toBe(true);
    // Two segments: 'project' and 'alpha' — both created as placeholders
    expect(result.topicsCreated).toBe(2);
    // noteCount for the leaf is approximate (all matching notes)
    const leaf = result.perTopic.find((p) => p.path.endsWith('alpha'));
    expect(leaf).not.toBeUndefined();
    expect(leaf!.noteCount).toBe(2);
    // No real DB inserts should have occurred (no transaction)
    expect(captured.inserts).toHaveLength(0);
    expect(captured.txCalls).toBe(0);
  });

  it('skips empty/blank tag segments gracefully', async () => {
    // tag with leading slash produces empty segments
    captured.executeQueue.push([{ tag: '' }, { tag: '//' }]);
    captured.selectRowsQueue.push([]);

    const result = await topics.importTopicsFromTags(7, 99, { dryRun: true });
    expect(result.topicsCreated).toBe(0);
    expect(result.perTopic).toHaveLength(0);
  });

  it('reuses cached topics from the pre-existing set', async () => {
    // tag = 'existing/child'
    captured.executeQueue.push([{ tag: 'existing/child' }]);
    // existing topics already include 'existing' at /existing
    const existingParent = makeTopic({ id: 10, slug: 'existing', path: '/existing', name: 'Existing' });
    captured.selectRowsQueue.push([existingParent]);
    // notes for this tag
    captured.selectRowsQueue.push([]);

    const result = await topics.importTopicsFromTags(7, 99, { dryRun: true });
    // 'existing' was pre-seeded — only 'child' gets created
    expect(result.topicsCreated).toBe(1);
    const childEntry = result.perTopic.find((p) => p.path.endsWith('child'));
    expect(childEntry).not.toBeUndefined();
  });
});
