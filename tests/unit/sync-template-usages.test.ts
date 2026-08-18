// @vitest-environment node
/**
 * Unit tests for lib/sites/sync-template-usages.ts (ITM-012 unit 1).
 *
 * block_template_usages was designed to track which posts embed which block
 * templates, but nothing ever wrote rows to it — the template-deletion
 * guards (lib/sites/publish-block-template.ts, DELETE
 * /api/block-templates/[id]) always saw usageCount 0. This is the first
 * writer: `syncTemplateUsages(postId, content)`, called from the portal post
 * save route after a successful `posts.content` write.
 *
 * Mocks @/lib/db (chainable Proxy builder, same pattern as
 * tests/unit/lib-sites-publish-nav.test.ts) + @/lib/db/schema + drizzle-orm.
 * Exercises:
 *   - inserts a usage row per newly-stamped block, top-level and nested,
 *     with syncedVersion snapshotted from the template's current version
 *   - deletes usage rows whose blockPath no longer appears in the content
 *   - leaves an unchanged (same path, same template) row alone — does not
 *     re-stamp syncedVersion
 *   - re-points a row (update, not delete+insert) when the block at a path
 *     now carries a different templateId
 *   - drops a templateId that no longer resolves to a real block_templates
 *     row (stale reference after a hard delete) instead of inserting it
 *   - accepts the raw posts.content JSON string shape ({ blocks, version })
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Shared mock state
// ---------------------------------------------------------------------------

interface MockState {
  /** Rows returned by SELECT queries, one array per call, FIFO. */
  selectQueues: unknown[][];
  /** Payloads passed to insert().values(). */
  insertedValues: Array<Record<string, unknown>>;
  /** { id, patch } captured from update().set(patch).where(eq(..., id)). */
  updateCalls: Array<{ id: unknown; patch: Record<string, unknown> }>;
  /** Ids captured from delete().where(inArray(..., ids)). */
  deletedIds: unknown[];
}

const state: MockState = {
  selectQueues: [],
  insertedValues: [],
  updateCalls: [],
  deletedIds: [],
};

function reset() {
  state.selectQueues = [];
  state.insertedValues = [];
  state.updateCalls = [];
  state.deletedIds = [];
}

// ---------------------------------------------------------------------------
// Mocks — must be hoisted before any imports of the module under test
// ---------------------------------------------------------------------------

vi.mock('drizzle-orm', () => ({
  eq: (col: unknown, val: unknown) => ({ op: 'eq', col, val }),
  inArray: (col: unknown, vals: unknown) => ({ op: 'inArray', col, vals }),
}));

vi.mock('@/lib/db/schema', () => {
  const wrap = (name: string) =>
    new Proxy(
      { __table: name },
      {
        get(_t, prop: string) {
          if (prop === '__table') return name;
          return { __col: prop, __table: name };
        },
      },
    );
  return {
    blockTemplateUsages: wrap('block_template_usages'),
    blockTemplates: wrap('block_templates'),
  };
});

vi.mock('@/lib/db', () => {
  const makeSelect = () => {
    let resolved = false;
    const proxy: Record<string, unknown> = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === 'then') {
          if (resolved) return undefined;
          resolved = true;
          return (onFulfilled: (v: unknown) => void) => {
            const rows = state.selectQueues.shift() ?? [];
            return Promise.resolve(rows).then(onFulfilled);
          };
        }
        return (..._args: unknown[]) => proxy;
      },
    });
    return proxy;
  };

  // insert(table).values(payload) — awaited directly, no .returning().
  const makeInsert = () => {
    const proxy: Record<string, unknown> = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === 'then') return undefined;
        if (prop === 'values') {
          return (payload: Record<string, unknown>) => {
            state.insertedValues.push(payload);
            return Promise.resolve();
          };
        }
        return (..._args: unknown[]) => proxy;
      },
    });
    return proxy;
  };

  // update(table).set(patch).where(eq(col, id)) — awaited directly.
  const makeUpdate = () => {
    let capturedPatch: Record<string, unknown> | null = null;
    const proxy: Record<string, unknown> = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === 'then') return undefined;
        if (prop === 'set') {
          return (patch: Record<string, unknown>) => {
            capturedPatch = patch;
            return proxy;
          };
        }
        if (prop === 'where') {
          return (cond: { val?: unknown }) => {
            state.updateCalls.push({ id: cond.val, patch: capturedPatch ?? {} });
            return Promise.resolve();
          };
        }
        return (..._args: unknown[]) => proxy;
      },
    });
    return proxy;
  };

  // delete(table).where(inArray(col, ids)) — awaited directly.
  const makeDelete = () => {
    const proxy: Record<string, unknown> = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === 'then') return undefined;
        if (prop === 'where') {
          return (cond: { vals?: unknown }) => {
            if (Array.isArray(cond.vals)) state.deletedIds.push(...cond.vals);
            return Promise.resolve();
          };
        }
        return (..._args: unknown[]) => proxy;
      },
    });
    return proxy;
  };

  return {
    db: {
      select: () => makeSelect(),
      insert: (_table: unknown) => makeInsert(),
      update: (_table: unknown) => makeUpdate(),
      delete: (_table: unknown) => makeDelete(),
    },
  };
});

// ---------------------------------------------------------------------------
// Import module under test AFTER mocks
// ---------------------------------------------------------------------------

import { syncTemplateUsages } from '@/lib/sites/sync-template-usages';

describe('syncTemplateUsages', () => {
  beforeEach(reset);

  it('inserts a usage row per newly-stamped block, top-level and nested, snapshotting the current template version', async () => {
    const blocks = [
      { id: 'a', type: 'text', templateId: 5 }, // top-level index 0
      {
        id: 'b',
        type: 'columns',
        columns: [{ id: 'c1', blocks: [{ id: 'd', type: 'text', templateId: 9 }] }],
      }, // nested at 1.0.0
    ];
    state.selectQueues.push([{ id: 5, version: 3 }, { id: 9, version: 1 }]); // template lookup
    state.selectQueues.push([]); // existing usages for this post — none

    await syncTemplateUsages(100, blocks);

    expect(state.insertedValues).toHaveLength(2);
    expect(state.insertedValues).toContainEqual({
      templateId: 5,
      postId: 100,
      blockPath: '0',
      syncedVersion: 3,
    });
    expect(state.insertedValues).toContainEqual({
      templateId: 9,
      postId: 100,
      blockPath: '1.0.0',
      syncedVersion: 1,
    });
    expect(state.updateCalls).toHaveLength(0);
    expect(state.deletedIds).toHaveLength(0);
  });

  it('deletes usage rows whose blockPath no longer appears in the saved content', async () => {
    const blocks = [{ id: 'a', type: 'text' }]; // no templateId anywhere → found = []
    state.selectQueues.push([{ id: 1, blockPath: '0', templateId: 5 }, { id: 2, blockPath: '2', templateId: 7 }]); // existing usages

    await syncTemplateUsages(200, blocks);

    expect(state.deletedIds.sort()).toEqual([1, 2]);
    expect(state.insertedValues).toHaveLength(0);
    expect(state.updateCalls).toHaveLength(0);
  });

  it('leaves an unchanged usage row alone (same path, same template) — does not re-stamp syncedVersion', async () => {
    const blocks = [{ id: 'a', type: 'text', templateId: 5 }];
    state.selectQueues.push([{ id: 5, version: 2 }]); // template lookup
    state.selectQueues.push([{ id: 10, blockPath: '0', templateId: 5 }]); // existing, matches exactly

    await syncTemplateUsages(300, blocks);

    expect(state.insertedValues).toHaveLength(0);
    expect(state.updateCalls).toHaveLength(0);
    expect(state.deletedIds).toHaveLength(0);
  });

  it('re-points a usage row (update, not delete+insert) when the block at a path now carries a different templateId', async () => {
    const blocks = [{ id: 'a', type: 'text', templateId: 8 }];
    state.selectQueues.push([{ id: 8, version: 4 }]); // template lookup
    state.selectQueues.push([{ id: 11, blockPath: '0', templateId: 5 }]); // existing, same path, old template

    await syncTemplateUsages(400, blocks);

    expect(state.updateCalls).toHaveLength(1);
    expect(state.updateCalls[0]).toEqual({ id: 11, patch: { templateId: 8, syncedVersion: 4 } });
    expect(state.insertedValues).toHaveLength(0);
    expect(state.deletedIds).toHaveLength(0);
  });

  it('drops a templateId that no longer resolves to an existing block_templates row', async () => {
    const blocks = [{ id: 'a', type: 'text', templateId: 999 }];
    state.selectQueues.push([]); // template lookup — 999 not found (hard-deleted)
    state.selectQueues.push([]); // existing usages — none

    await syncTemplateUsages(500, blocks);

    expect(state.insertedValues).toHaveLength(0);
    expect(state.updateCalls).toHaveLength(0);
    expect(state.deletedIds).toHaveLength(0);
  });

  it('accepts the raw posts.content JSON string shape ({ blocks, version })', async () => {
    const content = JSON.stringify({
      blocks: [{ id: 'a', type: 'text', templateId: 5 }],
      version: '1.0',
    });
    state.selectQueues.push([{ id: 5, version: 1 }]);
    state.selectQueues.push([]);

    await syncTemplateUsages(600, content);

    expect(state.insertedValues).toHaveLength(1);
    expect(state.insertedValues[0]).toEqual({
      templateId: 5,
      postId: 600,
      blockPath: '0',
      syncedVersion: 1,
    });
  });
});
