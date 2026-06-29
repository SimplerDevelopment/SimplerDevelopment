// @vitest-environment node
/**
 * Unit tests for lib/sites/publish-nav.ts
 *
 * Mocks @/lib/db (chainable builder) and @/lib/db/schema + drizzle-orm.
 * Exercises:
 *   publishNavItem:
 *     - nav row not found → throws 'Nav item not found'
 *     - no draft (null) → returns { id, noop: true }
 *     - draft.pendingDelete → deletes row, returns { id, deleted: true }
 *     - draft with fields → updates live columns, clears draft, returns { id, published, row }
 *     - all optional draft fields applied (label/href/parentId/sortOrder/openInNewTab/
 *       isButton/description/icon/featuredImage/columnGroup)
 *
 *   publishAllNavDrafts:
 *     - no rows with draft → returns zeros
 *     - all pendingDelete rows → returns correct deleted count
 *     - mixed rows (delete + publish) → correct tallies
 *     - draft null guard in loop (should continue)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Shared mock state
// ---------------------------------------------------------------------------

interface MockState {
  /** Rows returned by the SELECT query (one array per .select() call, FIFO). */
  selectQueues: unknown[][];
  /** Payloads captured by .update().set() calls. */
  updateSets: Array<Record<string, unknown>>;
  /** Ids captured by delete calls. */
  deletedIds: number[];
  /** Rows returned by .returning() on update (FIFO). */
  returningQueues: unknown[][];
}

const state: MockState = {
  selectQueues: [],
  updateSets: [],
  deletedIds: [],
  returningQueues: [],
};

function reset() {
  state.selectQueues = [];
  state.updateSets = [];
  state.deletedIds = [];
  state.returningQueues = [];
}

// ---------------------------------------------------------------------------
// Mocks — must be hoisted before any imports of the module under test
// ---------------------------------------------------------------------------

vi.mock('drizzle-orm', () => ({
  eq: (col: unknown, val: unknown) => ({ op: 'eq', col, val }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  sql: new Proxy(
    (strings: TemplateStringsArray, ...vals: unknown[]) => ({ op: 'sql', strings, vals }),
    {
      get(_t, prop: string) {
        // sql`...` tag is accessed directly; also proxy any property lookups
        if (prop === Symbol.toPrimitive as unknown as string) return undefined;
        return { __col: prop };
      },
    },
  ),
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
    siteNavigation: wrap('site_navigation'),
  };
});

vi.mock('@/lib/db', () => {
  // Chainable builder that dequeues from state arrays when terminal methods are awaited.
  const makeChain = (): Record<string, unknown> => {
    const chain: Record<string, (...args: unknown[]) => unknown> = {};
    const proxy = new Proxy(chain, {
      get(_t, prop: string) {
        if (prop === 'then') return undefined; // not a Promise itself
        return (..._args: unknown[]) => proxy;
      },
    });
    return proxy;
  };

  // select → from → where → limit resolves to next selectQueue entry.
  // When .limit() is not called (publishAllNavDrafts uses .where() as terminal),
  // the proxy itself is awaited — so it must be a thenable that resolves.
  const makeSelect = () => {
    let resolved = false;
    const proxy: Record<string, unknown> = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === 'then') {
          // Only resolve once — first `await` consumes the promise
          if (resolved) return undefined;
          resolved = true;
          return (onFulfilled: (v: unknown) => void) => {
            const rows = state.selectQueues.shift() ?? [];
            return Promise.resolve(rows).then(onFulfilled);
          };
        }
        if (prop === 'limit') {
          return (_n: number) => {
            const rows = state.selectQueues.shift() ?? [];
            return Promise.resolve(rows);
          };
        }
        return (..._args: unknown[]) => proxy;
      },
    });
    return proxy;
  };

  // update → set → where → returning resolves to next returningQueue entry
  const makeUpdate = () => {
    let capturedSet: Record<string, unknown> | null = null;
    const proxy: Record<string, unknown> = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === 'then') return undefined;
        if (prop === 'set') {
          return (patch: Record<string, unknown>) => {
            capturedSet = patch;
            state.updateSets.push(patch);
            return proxy;
          };
        }
        if (prop === 'returning') {
          return () => {
            const rows = state.returningQueues.shift() ?? [];
            return Promise.resolve(rows);
          };
        }
        return (..._args: unknown[]) => proxy;
      },
    });
    return proxy;
  };

  // delete → where resolves to void
  const makeDelete = () => {
    const proxy: Record<string, unknown> = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === 'then') return undefined;
        if (prop === 'where') {
          return (cond: { col?: { __col?: string }; val?: unknown }) => {
            // Extract id from the eq condition
            const val = (cond as { val?: unknown }).val;
            if (typeof val === 'number') state.deletedIds.push(val);
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
      update: (_table: unknown) => makeUpdate(),
      delete: (_table: unknown) => makeDelete(),
    },
  };
});

// ---------------------------------------------------------------------------
// Import module under test AFTER mocks
// ---------------------------------------------------------------------------

import { publishNavItem, publishAllNavDrafts } from '@/lib/sites/publish-nav';
import type { SiteNavigationDraft } from '@/lib/db/schema';

// ---------------------------------------------------------------------------
// publishNavItem
// ---------------------------------------------------------------------------

describe('publishNavItem', () => {
  beforeEach(reset);

  it('throws when nav row is not found', async () => {
    state.selectQueues.push([]); // empty result
    await expect(publishNavItem(42)).rejects.toThrow('Nav item not found');
  });

  it('returns noop when draft is null', async () => {
    state.selectQueues.push([{ id: 1, draft: null }]);
    const result = await publishNavItem(1);
    expect(result).toEqual({ id: 1, noop: true });
  });

  it('deletes the row when draft.pendingDelete is true', async () => {
    const draft: SiteNavigationDraft = { pendingDelete: true };
    state.selectQueues.push([{ id: 7, draft }]);
    const result = await publishNavItem(7);
    expect(result).toEqual({ id: 7, deleted: true });
  });

  it('updates live columns and clears draft, returning published result', async () => {
    const draft: SiteNavigationDraft = {
      label: 'New Label',
      href: '/new',
    };
    const updatedRow = { id: 5, label: 'New Label', href: '/new', draft: null };
    state.selectQueues.push([{ id: 5, draft }]);
    state.returningQueues.push([updatedRow]);
    const result = await publishNavItem(5);
    expect(result).toEqual({ id: 5, published: true, row: updatedRow });
    expect(state.updateSets).toHaveLength(1);
    const patch = state.updateSets[0];
    expect(patch.label).toBe('New Label');
    expect(patch.href).toBe('/new');
    expect(patch.draft).toBeNull();
  });

  it('applies all optional draft fields to the patch', async () => {
    const draft: SiteNavigationDraft = {
      label: 'L',
      href: '/h',
      parentId: 3,
      sortOrder: 10,
      openInNewTab: true,
      isButton: true,
      description: 'desc',
      icon: 'home',
      featuredImage: '/img.png',
      columnGroup: 2,
    };
    state.selectQueues.push([{ id: 9, draft }]);
    state.returningQueues.push([{ id: 9, ...draft, draft: null }]);
    await publishNavItem(9);
    const patch = state.updateSets[0];
    expect(patch.label).toBe('L');
    expect(patch.href).toBe('/h');
    expect(patch.parentId).toBe(3);
    expect(patch.sortOrder).toBe(10);
    expect(patch.openInNewTab).toBe(true);
    expect(patch.isButton).toBe(true);
    expect(patch.description).toBe('desc');
    expect(patch.icon).toBe('home');
    expect(patch.featuredImage).toBe('/img.png');
    expect(patch.columnGroup).toBe(2);
  });

  it('does not set undefined draft fields in the patch', async () => {
    const draft: SiteNavigationDraft = { label: 'Only label' };
    state.selectQueues.push([{ id: 2, draft }]);
    state.returningQueues.push([{ id: 2, draft: null }]);
    await publishNavItem(2);
    const patch = state.updateSets[0];
    expect('href' in patch).toBe(false);
    expect('parentId' in patch).toBe(false);
    expect('sortOrder' in patch).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// publishAllNavDrafts
// ---------------------------------------------------------------------------

describe('publishAllNavDrafts', () => {
  beforeEach(reset);

  it('returns zero totals when no rows have drafts', async () => {
    // SELECT returns empty array
    state.selectQueues.push([]);
    const result = await publishAllNavDrafts(1);
    expect(result).toEqual({ websiteId: 1, total: 0, deleted: 0, published: 0 });
  });

  it('deletes all pendingDelete rows and counts them', async () => {
    const rows = [
      { id: 10, draft: { pendingDelete: true } },
      { id: 11, draft: { pendingDelete: true } },
    ];
    state.selectQueues.push(rows);
    const result = await publishAllNavDrafts(5);
    expect(result).toEqual({ websiteId: 5, total: 2, deleted: 2, published: 0 });
  });

  it('publishes non-delete rows and counts them', async () => {
    const rows = [
      { id: 20, draft: { label: 'Updated' } },
      { id: 21, draft: { href: '/about' } },
    ];
    state.selectQueues.push(rows);
    const result = await publishAllNavDrafts(3);
    expect(result).toEqual({ websiteId: 3, total: 2, deleted: 0, published: 2 });
    expect(state.updateSets).toHaveLength(2);
  });

  it('handles mixed delete + publish rows correctly', async () => {
    const rows = [
      { id: 30, draft: { pendingDelete: true } },
      { id: 31, draft: { label: 'Keep' } },
      { id: 32, draft: { pendingDelete: true } },
    ];
    state.selectQueues.push(rows);
    const result = await publishAllNavDrafts(7);
    expect(result).toEqual({ websiteId: 7, total: 3, deleted: 2, published: 1 });
  });

  it('skips rows where draft is null in the loop', async () => {
    // The WHERE clause filters for non-null drafts, but the loop also guards
    // against null — simulate a row sneaking through with null draft.
    const rows = [
      { id: 40, draft: null },
      { id: 41, draft: { label: 'Valid' } },
    ];
    state.selectQueues.push(rows);
    const result = await publishAllNavDrafts(9);
    // total = 2 (rows returned by SELECT), published = 1 (only id:41)
    expect(result.total).toBe(2);
    expect(result.published).toBe(1);
    expect(result.deleted).toBe(0);
  });

  it('applies all draft fields when publishing in bulk', async () => {
    const draft: SiteNavigationDraft = {
      label: 'Nav',
      href: '/nav',
      sortOrder: 5,
      isButton: false,
      icon: 'menu',
    };
    state.selectQueues.push([{ id: 50, draft }]);
    await publishAllNavDrafts(11);
    const patch = state.updateSets[0];
    expect(patch.label).toBe('Nav');
    expect(patch.sortOrder).toBe(5);
    expect(patch.isButton).toBe(false);
    expect(patch.icon).toBe('menu');
    expect(patch.draft).toBeNull();
  });
});
