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
