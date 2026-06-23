// @vitest-environment node
/**
 * Unit tests for `lib/brain/topics.ts`.
 *
 * Strategy: mock `@/lib/db` with a fluent stub that records the SQL fragments
 * each helper hands it. We're not running real SQL — these tests exercise the
 * pure-logic guards:
 *
 *   - createTopic: builds path from parent.path + derived slug
 *   - moveTopic: cycle-guard rejects parenting under self / descendant
 *   - deleteTopic: refuses on has_children regardless of force
 *   - deleteTopic: refuses on has_entities without force
 *   - mergeTopic: refuses sourceId === targetId
 *   - attachTopics: idempotent skip of already-attached topic ids
 *
 * Round-trip + actual SQL is in tests/integration/api/brain/topics.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- DB mock --------------------------------------------------------------

interface CapturedInsert { values: Record<string, unknown> | Array<Record<string, unknown>> | null; }
interface CapturedUpdate { set: Record<string, unknown> | null; }

const captured = {
  inserts: [] as CapturedInsert[],
  updates: [] as CapturedUpdate[],
  selectRowsQueue: [] as Array<Array<Record<string, unknown>>>,
  insertReturning: [] as Array<Array<Record<string, unknown>>>,
  updateReturning: [] as Array<Array<Record<string, unknown>>>,
  deleteReturning: [] as Array<Array<Record<string, unknown>>>,
  txCalls: 0,
};

function resetCaptured() {
  captured.inserts.length = 0;
  captured.updates.length = 0;
  captured.selectRowsQueue.length = 0;
  captured.insertReturning.length = 0;
  captured.updateReturning.length = 0;
  captured.deleteReturning.length = 0;
  captured.txCalls = 0;
}

function nextSelectRows(): Array<Record<string, unknown>> {
  return captured.selectRowsQueue.length > 0 ? captured.selectRowsQueue.shift()! : [];
}

function makeSelectChain() {
  const chain: Record<string, unknown> = {};
  // .from().where().limit() → array | .from().where().orderBy() → array
  chain.from = () => chain;
  chain.where = () => chain;
  chain.orderBy = () => Promise.resolve(nextSelectRows());
  chain.limit = () => Promise.resolve(nextSelectRows());
  chain.groupBy = () => Promise.resolve(nextSelectRows());
  // Some helpers `await db.select(...).from(...).where(...)` directly — make
  // the chain a thenable so it resolves to the next-rows queue.
  chain.then = (onFulfilled: (v: unknown) => unknown) => Promise.resolve(nextSelectRows()).then(onFulfilled);
  return chain;
}

function makeInsertChain() {
  const chain: Record<string, unknown> = {};
  chain.values = (v: unknown) => {
    captured.inserts.push({ values: v as CapturedInsert['values'] });
    return chain;
  };
  chain.returning = () => Promise.resolve(captured.insertReturning.length > 0 ? captured.insertReturning.shift() : []);
  return chain;
}

function makeUpdateChain() {
  const chain: Record<string, unknown> = {};
  chain.set = (v: Record<string, unknown>) => {
    captured.updates.push({ set: v });
    return chain;
  };
  chain.where = () => chain;
  chain.returning = () => Promise.resolve(captured.updateReturning.length > 0 ? captured.updateReturning.shift() : []);
  // Some calls don't .returning() — make the chain thenable for direct await.
  chain.then = (onFulfilled: (v: unknown) => unknown) => Promise.resolve([]).then(onFulfilled);
  return chain;
}

function makeDeleteChain() {
  const chain: Record<string, unknown> = {};
  chain.where = () => chain;
  chain.returning = () => Promise.resolve(captured.deleteReturning.length > 0 ? captured.deleteReturning.shift() : []);
  chain.then = (onFulfilled: (v: unknown) => unknown) => Promise.resolve([]).then(onFulfilled);
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
  execute: async () => [],
  transaction: async (fn) => {
    captured.txCalls += 1;
    return fn(dbStub);
  },
};

vi.mock('@/lib/db', () => ({ db: dbStub }));

vi.mock('@/lib/db/schema', () => ({
  brainTopics: { id: { __col: 'id' }, clientId: { __col: 'client_id' }, parentId: { __col: 'parent_id' }, slug: { __col: 'slug' }, path: { __col: 'path' } },
  brainEntityTopics: { id: { __col: 'id' }, clientId: { __col: 'client_id' }, topicId: { __col: 'topic_id' }, entityType: { __col: 'entity_type' }, entityId: { __col: 'entity_id' } },
  brainAuditLogs: { id: { __col: 'id' }, clientId: { __col: 'client_id' }, action: { __col: 'action' }, entityType: { __col: 'entity_type' }, entityId: { __col: 'entity_id' } },
  brainNotes: { id: { __col: 'id' }, clientId: { __col: 'client_id' }, title: { __col: 'title' }, tags: { __col: 'tags' } },
  brainMeetings: { id: { __col: 'id' }, clientId: { __col: 'client_id' }, title: { __col: 'title' } },
  brainTasks: { id: { __col: 'id' }, clientId: { __col: 'client_id' }, title: { __col: 'title' } },
  brainDecisions: { id: { __col: 'id' }, clientId: { __col: 'client_id' }, title: { __col: 'title' } },
  brainRelationshipOverlays: { id: { __col: 'id' }, clientId: { __col: 'client_id' }, summary: { __col: 'summary' }, relationshipType: { __col: 'relationship_type' } },
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

// --- tests ---------------------------------------------------------------

describe('createTopic — path derivation', () => {
  beforeEach(resetCaptured);

  it('builds /slug for a root topic when parentId is null', async () => {
    // Slug-uniqueness check returns no collision; then INSERT returning the row.
    captured.selectRowsQueue.push([]); // uniqueSlugForClient: no collision
    captured.insertReturning.push([{ id: 1, name: 'Operations', slug: 'operations', path: '/operations', clientId: 7, parentId: null, sortOrder: 0 }]);

    const created = await topics.createTopic(7, 99, { name: 'Operations' });

    expect(captured.inserts.length).toBe(1);
    const inserted = captured.inserts[0].values as Record<string, unknown>;
    expect(inserted.clientId).toBe(7);
    expect(inserted.parentId).toBe(null);
    expect(inserted.slug).toBe('operations');
    expect(inserted.path).toBe('/operations');
    expect(created.path).toBe('/operations');
  });

  it('builds /parent/slug when a parent exists', async () => {
    // First select resolves the parent (and its path); second select is the
    // slug-uniqueness check (no collision); then insert.
    captured.selectRowsQueue.push([{ id: 1, path: '/operations' }]);
    captured.selectRowsQueue.push([]);
    captured.insertReturning.push([{ id: 2, name: 'Hiring', slug: 'hiring', path: '/operations/hiring', clientId: 7, parentId: 1, sortOrder: 0 }]);

    const created = await topics.createTopic(7, 99, { name: 'Hiring', parentId: 1 });

    const inserted = captured.inserts[0].values as Record<string, unknown>;
    expect(inserted.parentId).toBe(1);
    expect(inserted.path).toBe('/operations/hiring');
    expect(created.path).toBe('/operations/hiring');
  });

  it('throws when parent does not belong to client', async () => {
    captured.selectRowsQueue.push([]); // parent lookup returns nothing
    await expect(topics.createTopic(7, 99, { name: 'Orphan', parentId: 999 }))
      .rejects.toThrow(/parent 999 not found/);
  });

  it('refuses an empty name', async () => {
    await expect(topics.createTopic(7, 99, { name: '   ' }))
      .rejects.toThrow(/name is required/);
  });

  it('suffixes the slug on collision (-2, -3, …)', async () => {
    // First slug check: collision (returns [{id:1}]).
    captured.selectRowsQueue.push([{ id: 1 }]);
    // Second slug check: no collision.
    captured.selectRowsQueue.push([]);
    captured.insertReturning.push([{ id: 9, name: 'Operations', slug: 'operations-2', path: '/operations-2', clientId: 7, parentId: null }]);

    await topics.createTopic(7, 99, { name: 'Operations' });

    const inserted = captured.inserts[0].values as Record<string, unknown>;
    expect(inserted.slug).toBe('operations-2');
    expect(inserted.path).toBe('/operations-2');
  });
});

describe('moveTopic — cycle guard', () => {
  beforeEach(resetCaptured);

  it('refuses to parent a topic to itself', async () => {
    // node lookup
    captured.selectRowsQueue.push([{ id: 5, clientId: 7, slug: 'a', path: '/a', parentId: null }]);
    await expect(topics.moveTopic(7, 99, 5, 5)).rejects.toThrow(/itself/);
  });

  it('refuses to parent a topic under one of its own descendants', async () => {
    // node lookup
    captured.selectRowsQueue.push([{ id: 5, clientId: 7, slug: 'a', path: '/a', parentId: null }]);
    // parent lookup returns a topic whose path starts with /a/
    captured.selectRowsQueue.push([{ id: 6, clientId: 7, slug: 'b', path: '/a/b', parentId: 5 }]);
    await expect(topics.moveTopic(7, 99, 5, 6)).rejects.toThrow(/descendants/);
  });

  it('refuses if the new parent does not belong to the client', async () => {
    captured.selectRowsQueue.push([{ id: 5, clientId: 7, slug: 'a', path: '/a', parentId: null }]);
    captured.selectRowsQueue.push([]);  // parent not found
    await expect(topics.moveTopic(7, 99, 5, 999)).rejects.toThrow(/parent 999 not found/);
  });

  it('returns null when the node does not belong to the client', async () => {
    captured.selectRowsQueue.push([]);  // node not found
    const out = await topics.moveTopic(7, 99, 999, null);
    expect(out).toBe(null);
  });
});

describe('deleteTopic — refusal rules', () => {
  beforeEach(resetCaptured);

  it('returns not_found when topic does not exist for client', async () => {
    captured.selectRowsQueue.push([]);
    const out = await topics.deleteTopic(7, 99, 999);
    expect(out).toEqual({ deleted: false, reason: 'not_found' });
  });

  it('refuses on has_children regardless of force', async () => {
    // topic lookup
    captured.selectRowsQueue.push([{ id: 5, clientId: 7, slug: 'a', path: '/a' }]);
    // child lookup returns one
    captured.selectRowsQueue.push([{ id: 6 }]);
    const out = await topics.deleteTopic(7, 99, 5, { force: true });
    expect(out).toEqual({ deleted: false, reason: 'has_children' });
  });

  it('refuses on has_entities when force is false', async () => {
    captured.selectRowsQueue.push([{ id: 5, clientId: 7, slug: 'a', path: '/a' }]);
    captured.selectRowsQueue.push([]);  // no children
    captured.selectRowsQueue.push([{ id: 100 }]); // entity attached
    const out = await topics.deleteTopic(7, 99, 5);
    expect(out).toEqual({ deleted: false, reason: 'has_entities' });
  });

  it('proceeds when force=true and only entities are attached', async () => {
    captured.selectRowsQueue.push([{ id: 5, clientId: 7, slug: 'a', path: '/a' }]);
    captured.selectRowsQueue.push([]);  // no children
    captured.selectRowsQueue.push([{ id: 100 }]); // entity attached
    const out = await topics.deleteTopic(7, 99, 5, { force: true });
    expect(out).toEqual({ deleted: true });
    expect(captured.txCalls).toBe(1);
  });
});

describe('mergeTopic — self-merge guard', () => {
  it('rejects sourceId === targetId synchronously', async () => {
    await expect(topics.mergeTopic(7, 99, 5, 5)).rejects.toThrow(/same/);
  });
});

describe('attachTopics — idempotency', () => {
  beforeEach(resetCaptured);

  it('returns alreadyAttached when every requested topic is already linked', async () => {
    // Tenant-validation select: returns both ids as valid.
    captured.selectRowsQueue.push([{ id: 10 }, { id: 11 }]);
    // Existing-links select: both 10 and 11 already attached.
    captured.selectRowsQueue.push([{ topicId: 10 }, { topicId: 11 }]);

    const res = await topics.attachTopics(dbStub as never, {
      clientId: 7,
      actorId: 99,
      targetEntityType: 'note',
      targetEntityId: 42,
      topicIds: [10, 11],
    });

    expect(res.attached).toBe(0);
    expect(res.alreadyAttached).toBe(2);
    expect(res.insertedRowIds).toEqual([]);
    expect(captured.inserts.length).toBe(0); // no INSERT executed
  });

  it('only inserts the topic ids not already present', async () => {
    captured.selectRowsQueue.push([{ id: 10 }, { id: 11 }]);
    captured.selectRowsQueue.push([{ topicId: 10 }]); // only 10 already attached
    captured.insertReturning.push([{ id: 555 }]);     // insert for 11 returns row 555

    const res = await topics.attachTopics(dbStub as never, {
      clientId: 7,
      actorId: 99,
      targetEntityType: 'meeting',
      targetEntityId: 42,
      topicIds: [10, 11],
    });

    expect(res.attached).toBe(1);
    expect(res.alreadyAttached).toBe(1);
    expect(res.insertedRowIds).toEqual([555]);
    expect(captured.inserts.length).toBe(1);
  });

  it('drops cross-tenant topic ids (tenant-validation filter)', async () => {
    // Only id 10 is owned by this client; 11 is missing from the result.
    captured.selectRowsQueue.push([{ id: 10 }]);
    captured.selectRowsQueue.push([]);
    captured.insertReturning.push([{ id: 555 }]);

    const res = await topics.attachTopics(dbStub as never, {
      clientId: 7,
      actorId: 99,
      targetEntityType: 'task',
      targetEntityId: 42,
      topicIds: [10, 11],
    });

    expect(res.attached).toBe(1);
    expect(res.insertedRowIds).toEqual([555]);
    // The insert payload should only include id 10's row.
    const insertedRows = captured.inserts[0].values as Array<Record<string, unknown>>;
    expect(Array.isArray(insertedRows)).toBe(true);
    expect(insertedRows.length).toBe(1);
    expect(insertedRows[0].topicId).toBe(10);
  });

  it('returns the empty-result shape for an empty topicIds array', async () => {
    const res = await topics.attachTopics(dbStub as never, {
      clientId: 7,
      actorId: 99,
      targetEntityType: 'note',
      targetEntityId: 42,
      topicIds: [],
    });
    expect(res).toEqual({ attached: 0, alreadyAttached: 0, insertedRowIds: [] });
  });
});

// ─── deriveSlug — pure, no db ─────────────────────────────────────────────────

describe('deriveSlug @brain @topics @unit', () => {
  it('lowercases and collapses non-alphanum runs to dashes', () => {
    expect(topics.deriveSlug('Hello World')).toBe('hello-world');
    expect(topics.deriveSlug('Marketing / SEO & Ads')).toBe('marketing-seo-ads');
  });

  it('trims leading and trailing dashes', () => {
    expect(topics.deriveSlug('  --Hello--  ')).toBe('hello');
  });

  it('falls back to "topic" for blank or symbol-only input', () => {
    expect(topics.deriveSlug('   ')).toBe('topic');
    expect(topics.deriveSlug('---')).toBe('topic');
  });

  it('preserves digits', () => {
    expect(topics.deriveSlug('Q4 2025 Goals')).toBe('q4-2025-goals');
  });

  it('truncates at 150 characters', () => {
    expect(topics.deriveSlug('a'.repeat(200))).toHaveLength(150);
  });
});

// ─── listTopics ───────────────────────────────────────────────────────────────

describe('listTopics @brain @topics @unit', () => {
  beforeEach(resetCaptured);

  it('returns rows ordered by path for a given clientId', async () => {
    const rows = [
      { id: 1, clientId: 7, path: '/eng', slug: 'eng', name: 'Eng', parentId: null, sortOrder: 0 },
      { id: 2, clientId: 7, path: '/eng/backend', slug: 'backend', name: 'Backend', parentId: 1, sortOrder: 0 },
    ];
    captured.selectRowsQueue.push(rows);
    const result = await topics.listTopics(7);
    expect(result).toHaveLength(2);
    expect(result[0].slug).toBe('eng');
    expect(result[1].slug).toBe('backend');
  });

  it('returns an empty array when the client has no topics', async () => {
    captured.selectRowsQueue.push([]);
    expect(await topics.listTopics(99)).toEqual([]);
  });
});

// ─── getTopicTree ─────────────────────────────────────────────────────────────

describe('getTopicTree @brain @topics @unit', () => {
  beforeEach(resetCaptured);

  it('returns [] when client has no topics', async () => {
    captured.selectRowsQueue.push([]); // listTopics → empty
    expect(await topics.getTopicTree(7)).toEqual([]);
  });

  it('builds a root→child tree with correct childCount and entityCount', async () => {
    const parent = { id: 1, clientId: 7, parentId: null, name: 'Eng', slug: 'eng', path: '/eng', sortOrder: 0 };
    const child  = { id: 2, clientId: 7, parentId: 1, name: 'Backend', slug: 'backend', path: '/eng/backend', sortOrder: 0 };
    captured.selectRowsQueue.push([parent, child]); // listTopics
    // entity counts groupBy
    captured.selectRowsQueue.push([{ topicId: 1, count: 3 }, { topicId: 2, count: 1 }]);

    const tree = await topics.getTopicTree(7);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe(1);
    expect(tree[0].entityCount).toBe(3);
    expect(tree[0].childCount).toBe(1);
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].id).toBe(2);
    expect(tree[0].children[0].entityCount).toBe(1);
  });

  it('assigns entityCount=0 for nodes absent from the counts query', async () => {
    const root = { id: 5, clientId: 7, parentId: null, name: 'Ops', slug: 'ops', path: '/ops', sortOrder: 0 };
    captured.selectRowsQueue.push([root]);
    captured.selectRowsQueue.push([]); // no entity counts
    const tree = await topics.getTopicTree(7);
    expect(tree[0].entityCount).toBe(0);
  });

  it('sorts children by sortOrder then name', async () => {
    const parent = { id: 1, clientId: 7, parentId: null, name: 'Root', slug: 'root', path: '/root', sortOrder: 0 };
    const c1 = { id: 2, clientId: 7, parentId: 1, name: 'Zebra', slug: 'zebra', path: '/root/zebra', sortOrder: 1 };
    const c2 = { id: 3, clientId: 7, parentId: 1, name: 'Alpha', slug: 'alpha', path: '/root/alpha', sortOrder: 0 };
    captured.selectRowsQueue.push([parent, c1, c2]);
    captured.selectRowsQueue.push([]);
    const tree = await topics.getTopicTree(7);
    expect(tree[0].children.map((c) => c.slug)).toEqual(['alpha', 'zebra']);
  });
});

// ─── getTopicById ─────────────────────────────────────────────────────────────

describe('getTopicById @brain @topics @unit', () => {
  beforeEach(resetCaptured);

  it('returns null when topic is not found', async () => {
    captured.selectRowsQueue.push([]); // topic lookup → nothing
    expect(await topics.getTopicById(7, 999)).toBeNull();
  });

  it('returns topic with empty breadcrumb for a root topic', async () => {
    const root = { id: 1, clientId: 7, parentId: null, name: 'Eng', slug: 'eng', path: '/eng', sortOrder: 0 };
    captured.selectRowsQueue.push([root]); // topic fetch
    // parentId is null → no further selects
    const result = await topics.getTopicById(7, 1);
    expect(result).not.toBeNull();
    expect(result!.breadcrumb).toEqual([]);
  });

  it('builds a one-level breadcrumb for a child topic', async () => {
    const parent = { id: 1, clientId: 7, parentId: null, name: 'Eng', slug: 'eng', path: '/eng', sortOrder: 0 };
    const child  = { id: 2, clientId: 7, parentId: 1,    name: 'Backend', slug: 'backend', path: '/eng/backend', sortOrder: 0 };
    captured.selectRowsQueue.push([child]);  // initial fetch
    captured.selectRowsQueue.push([parent]); // breadcrumb walk — parent fetch
    // parent.parentId is null → loop exits
    const result = await topics.getTopicById(7, 2);
    expect(result!.breadcrumb).toHaveLength(1);
    expect(result!.breadcrumb[0].id).toBe(1);
  });

  it('stops breadcrumb walk when a parent row is missing (corrupt chain guard)', async () => {
    const orphan = { id: 3, clientId: 7, parentId: 999, name: 'X', slug: 'x', path: '/x', sortOrder: 0 };
    captured.selectRowsQueue.push([orphan]); // fetch topic
    captured.selectRowsQueue.push([]);       // parent 999 not found → break
    const result = await topics.getTopicById(7, 3);
    expect(result!.breadcrumb).toEqual([]);
  });
});

// ─── updateTopic ─────────────────────────────────────────────────────────────

describe('updateTopic @brain @topics @unit', () => {
  beforeEach(resetCaptured);

  it('returns null when topic is not found', async () => {
    captured.selectRowsQueue.push([]); // lookup → not found
    expect(await topics.updateTopic(7, 99, 999, { name: 'X' })).toBeNull();
  });

  it('returns the row unchanged when the patch is a no-op', async () => {
    const existing = { id: 1, clientId: 7, name: 'Eng', color: null, icon: null, description: null, sortOrder: 0 };
    captured.selectRowsQueue.push([existing]);
    // Same name → changedFields = [] → no update issued
    const result = await topics.updateTopic(7, 99, 1, { name: 'Eng' });
    expect(result).toEqual(existing);
    expect(captured.updates.length).toBe(0);
  });

  it('applies a name change via db.update', async () => {
    const before = { id: 1, clientId: 7, name: 'Eng', color: null, icon: null, description: null, sortOrder: 0 };
    const after  = { ...before, name: 'Platform Eng' };
    captured.selectRowsQueue.push([before]);
    captured.updateReturning.push([after]);
    const result = await topics.updateTopic(7, 99, 1, { name: 'Platform Eng' });
    expect(result!.name).toBe('Platform Eng');
    expect(captured.updates.length).toBe(1);
    expect(captured.updates[0].set).toMatchObject({ name: 'Platform Eng' });
  });

  it('applies color + icon patches', async () => {
    const before = { id: 1, clientId: 7, name: 'Eng', color: null, icon: null, description: null, sortOrder: 0 };
    const after  = { ...before, color: '#0ea5e9', icon: 'label' };
    captured.selectRowsQueue.push([before]);
    captured.updateReturning.push([after]);
    const result = await topics.updateTopic(7, 99, 1, { color: '#0ea5e9', icon: 'label' });
    expect(result!.color).toBe('#0ea5e9');
    expect(result!.icon).toBe('label');
    expect(captured.updates[0].set).toMatchObject({ color: '#0ea5e9', icon: 'label' });
  });

  it('clears description when patch.description=null', async () => {
    const before = { id: 1, clientId: 7, name: 'Eng', color: null, icon: null, description: 'old', sortOrder: 0 };
    const after  = { ...before, description: null };
    captured.selectRowsQueue.push([before]);
    captured.updateReturning.push([after]);
    const result = await topics.updateTopic(7, 99, 1, { description: null });
    expect(result!.description).toBeNull();
    expect(captured.updates[0].set).toMatchObject({ description: null });
  });

  it('skips fields that have not changed', async () => {
    const before = { id: 1, clientId: 7, name: 'Eng', color: '#fff', icon: null, description: null, sortOrder: 5 };
    const after  = { ...before, sortOrder: 10 };
    captured.selectRowsQueue.push([before]);
    captured.updateReturning.push([after]);
    // Only sortOrder differs
    await topics.updateTopic(7, 99, 1, { color: '#fff', sortOrder: 10 });
    // The set payload should include sortOrder but NOT color (unchanged)
    expect(captured.updates[0].set).toHaveProperty('sortOrder', 10);
    expect(captured.updates[0].set).not.toHaveProperty('color');
  });
});

// ─── detachTopics ─────────────────────────────────────────────────────────────

describe('detachTopics @brain @topics @unit', () => {
  beforeEach(resetCaptured);

  it('returns 0 immediately without hitting the DB when topicIds is empty', async () => {
    const result = await topics.detachTopics(7, null, {
      targetEntityType: 'note',
      targetEntityId: 1,
      topicIds: [],
    });
    expect(result).toEqual({ detached: 0 });
  });

  it('returns count of deleted rows', async () => {
    captured.deleteReturning.push([{ id: 11 }, { id: 12 }]);
    const result = await topics.detachTopics(7, null, {
      targetEntityType: 'note',
      targetEntityId: 1,
      topicIds: [1, 2],
    });
    expect(result).toEqual({ detached: 2 });
  });

  it('returns 0 when no matching rows exist', async () => {
    captured.deleteReturning.push([]);
    const result = await topics.detachTopics(7, null, {
      targetEntityType: 'decision',
      targetEntityId: 5,
      topicIds: [999],
    });
    expect(result).toEqual({ detached: 0 });
  });

  it('deduplicates topicIds before the delete', async () => {
    // Even with duplicated ids only one delete call happens
    captured.deleteReturning.push([{ id: 20 }]);
    const result = await topics.detachTopics(7, null, {
      targetEntityType: 'task',
      targetEntityId: 3,
      topicIds: [5, 5, 5],
    });
    expect(result).toEqual({ detached: 1 });
  });
});

// ─── moveTopic — happy paths via transaction stub ─────────────────────────────
//
// The transaction callback receives `dbStub` as `tx`, so the selectRowsQueue
// still drives responses. Sequence for a root→root no-new-parent move:
//   1. tx.select().limit()  → node
//   2. tx.update()          → node path (thenable, no return value needed)
//   3. tx.select()          → descendants (thenable, terminal .where())
//   4. tx.insert()          → txAudit (thenable)
//   5. tx.select().limit()  → final fetch of updated node

describe('moveTopic — happy paths @brain @topics @unit', () => {
  beforeEach(resetCaptured);

  it('is a no-op when path and parentId are already correct', async () => {
    // Moving topic 5 to root (null) when it's already at root with path /a
    const node = { id: 5, clientId: 7, slug: 'a', path: '/a', parentId: null };
    captured.selectRowsQueue.push([node]); // node fetch — newParentId=null so no parent fetch
    // oldPath === newPath AND parentId === newParentId → returns node immediately
    const out = await topics.moveTopic(7, 99, 5, null);
    expect(out).toEqual(node);
    // No update should have been issued
    expect(captured.updates.length).toBe(0);
  });

  it('re-parents to root (null) and rewrites path', async () => {
    // topic currently has parentId: 1, path: /parent/child
    const node = { id: 5, clientId: 7, slug: 'child', path: '/parent/child', parentId: 1 };
    const updated = { ...node, parentId: null, path: '/child' };
    // 1. node fetch
    captured.selectRowsQueue.push([node]);
    // 2. tx.update (thenable, resolves [])
    // 3. descendants select (thenable) → none
    captured.selectRowsQueue.push([]);
    // 4. txAudit insert (thenable, resolves [])
    // 5. final fetch
    captured.selectRowsQueue.push([updated]);

    const out = await topics.moveTopic(7, 99, 5, null);
    expect(out).not.toBeNull();
    expect(out!.path).toBe('/child');
    expect(out!.parentId).toBeNull();
    expect(captured.updates.length).toBe(1);
    expect(captured.updates[0].set).toMatchObject({ parentId: null, path: '/child' });
  });

  it('re-parents under a new parent and rewrites descendant paths', async () => {
    const node   = { id: 5, clientId: 7, slug: 'child', path: '/old/child', parentId: 2 };
    const parent = { id: 3, clientId: 7, slug: 'new', path: '/new', parentId: null };
    const desc   = { id: 6, clientId: 7, path: '/old/child/grandchild' };
    const updated = { ...node, parentId: 3, path: '/new/child' };

    // 1. node fetch
    captured.selectRowsQueue.push([node]);
    // 2. parent fetch (newParentId=3, not same as id=5, path '/new' doesn't start with '/old/child/')
    captured.selectRowsQueue.push([parent]);
    // 3. tx.update node (thenable)
    // 4. descendants select (thenable) → one descendant
    captured.selectRowsQueue.push([desc]);
    // 5. tx.update descendant (thenable)
    // 6. txAudit insert (thenable)
    // 7. final fetch
    captured.selectRowsQueue.push([updated]);

    const out = await topics.moveTopic(7, 99, 5, 3);
    expect(out!.path).toBe('/new/child');
    expect(out!.parentId).toBe(3);
    // Two updates: the node itself + the descendant
    expect(captured.updates.length).toBe(2);
    expect(captured.updates[1].set).toMatchObject({ path: '/new/child/grandchild' });
  });
});

// ─── listEntitiesForTopic ─────────────────────────────────────────────────────
//
// The function uses direct `.where()` termination (no .limit()) for the join
// query and per-type title fetches. The makeSelectChain thenable covers those.

describe('listEntitiesForTopic @brain @topics @unit', () => {
  beforeEach(resetCaptured);

  it('returns empty result when topic is not found (cross-tenant guard)', async () => {
    captured.selectRowsQueue.push([]); // tenancy check → not found
    const out = await topics.listEntitiesForTopic(7, 999);
    expect(out.items).toEqual([]);
    expect(out.byType.note).toEqual([]);
  });

  it('returns empty result when no join rows exist', async () => {
    captured.selectRowsQueue.push([{ id: 1 }]); // tenancy check → found
    captured.selectRowsQueue.push([]);           // joinRows → empty
    const out = await topics.listEntitiesForTopic(7, 1);
    expect(out.items).toEqual([]);
  });

  it('returns items for a note entity with title lookup', async () => {
    captured.selectRowsQueue.push([{ id: 1 }]); // tenancy check
    // joinRows: one note entity
    captured.selectRowsQueue.push([{ entityType: 'note', entityId: 10 }]);
    // notes title fetch
    captured.selectRowsQueue.push([{ id: 10, title: 'My Note' }]);

    const out = await topics.listEntitiesForTopic(7, 1);
    expect(out.items).toHaveLength(1);
    expect(out.items[0]).toEqual({ entityType: 'note', entityId: 10, title: 'My Note' });
    expect(out.byType.note).toHaveLength(1);
  });

  it('drops dangling join rows whose entity was deleted', async () => {
    captured.selectRowsQueue.push([{ id: 1 }]); // tenancy check
    // joinRows: note 10 + note 11
    captured.selectRowsQueue.push([
      { entityType: 'note', entityId: 10 },
      { entityType: 'note', entityId: 11 },
    ]);
    // notes title fetch: only 10 found (11 is dangling)
    captured.selectRowsQueue.push([{ id: 10, title: 'Existing Note' }]);

    const out = await topics.listEntitiesForTopic(7, 1);
    expect(out.items).toHaveLength(1);
    expect(out.items[0].entityId).toBe(10);
  });

  it('returns items across multiple entity types, sorted by type then title', async () => {
    captured.selectRowsQueue.push([{ id: 1 }]); // tenancy check
    captured.selectRowsQueue.push([
      { entityType: 'note',    entityId: 10 },
      { entityType: 'meeting', entityId: 20 },
      { entityType: 'note',    entityId: 11 },
    ]);
    // notes fetch (ids 10 + 11)
    captured.selectRowsQueue.push([
      { id: 10, title: 'Zebra Note' },
      { id: 11, title: 'Alpha Note' },
    ]);
    // meetings fetch (id 20)
    captured.selectRowsQueue.push([{ id: 20, title: 'Sprint Planning' }]);

    const out = await topics.listEntitiesForTopic(7, 1);
    // Sorted: meeting < note (lexicographic), then within note: Alpha < Zebra
    expect(out.items.map((i) => i.title)).toEqual(['Sprint Planning', 'Alpha Note', 'Zebra Note']);
    expect(out.byType.meeting).toHaveLength(1);
    expect(out.byType.note).toHaveLength(2);
  });

  it('uses fallback title for relationship_overlay with no summary', async () => {
    captured.selectRowsQueue.push([{ id: 1 }]);
    captured.selectRowsQueue.push([{ entityType: 'relationship_overlay', entityId: 5 }]);
    // relationship_overlay row: no summary
    captured.selectRowsQueue.push([{ id: 5, summary: null, relationshipType: 'reports_to' }]);

    const out = await topics.listEntitiesForTopic(7, 1);
    expect(out.items[0].title).toBe('Relationship #5 (reports_to)');
  });

  it('uses summary (sliced to 120) as title for relationship_overlay when summary exists', async () => {
    // The source does r.summary.slice(0, 120) — no trim on the output, only
    // .trim() for the truthiness check. Feed a clean summary string.
    captured.selectRowsQueue.push([{ id: 1 }]);
    captured.selectRowsQueue.push([{ entityType: 'relationship_overlay', entityId: 5 }]);
    captured.selectRowsQueue.push([{ id: 5, summary: 'Alice advises Bob', relationshipType: 'advisor' }]);

    const out = await topics.listEntitiesForTopic(7, 1);
    expect(out.items[0].title).toBe('Alice advises Bob');
  });

  it('returns task entity with title lookup', async () => {
    captured.selectRowsQueue.push([{ id: 1 }]);
    captured.selectRowsQueue.push([{ entityType: 'task', entityId: 30 }]);
    captured.selectRowsQueue.push([{ id: 30, title: 'Fix the bug' }]);

    const out = await topics.listEntitiesForTopic(7, 1);
    expect(out.items[0]).toEqual({ entityType: 'task', entityId: 30, title: 'Fix the bug' });
    expect(out.byType.task).toHaveLength(1);
  });

  it('returns decision entity with title lookup', async () => {
    captured.selectRowsQueue.push([{ id: 1 }]);
    captured.selectRowsQueue.push([{ entityType: 'decision', entityId: 40 }]);
    captured.selectRowsQueue.push([{ id: 40, title: 'Use PostgreSQL' }]);

    const out = await topics.listEntitiesForTopic(7, 1);
    expect(out.items[0]).toEqual({ entityType: 'decision', entityId: 40, title: 'Use PostgreSQL' });
  });

  it('returns initiative entity using name field as title', async () => {
    captured.selectRowsQueue.push([{ id: 1 }]);
    captured.selectRowsQueue.push([{ entityType: 'initiative', entityId: 50 }]);
    captured.selectRowsQueue.push([{ id: 50, name: 'Q4 Launch' }]);

    const out = await topics.listEntitiesForTopic(7, 1);
    expect(out.items[0]).toEqual({ entityType: 'initiative', entityId: 50, title: 'Q4 Launch' });
    expect(out.byType.initiative).toHaveLength(1);
  });

  it('returns person entity using fullName as title', async () => {
    captured.selectRowsQueue.push([{ id: 1 }]);
    captured.selectRowsQueue.push([{ entityType: 'person', entityId: 60 }]);
    captured.selectRowsQueue.push([{ id: 60, fullName: 'Ada Lovelace' }]);

    const out = await topics.listEntitiesForTopic(7, 1);
    expect(out.items[0]).toEqual({ entityType: 'person', entityId: 60, title: 'Ada Lovelace' });
    expect(out.byType.person).toHaveLength(1);
  });

  it('returns meeting entity with title lookup', async () => {
    captured.selectRowsQueue.push([{ id: 1 }]);
    captured.selectRowsQueue.push([{ entityType: 'meeting', entityId: 70 }]);
    captured.selectRowsQueue.push([{ id: 70, title: 'Sprint Retro' }]);

    const out = await topics.listEntitiesForTopic(7, 1);
    expect(out.items[0]).toEqual({ entityType: 'meeting', entityId: 70, title: 'Sprint Retro' });
    expect(out.byType.meeting).toHaveLength(1);
  });
});
