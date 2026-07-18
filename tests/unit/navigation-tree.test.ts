// @vitest-environment node
/**
 * Unit tests for the pure tree helpers in
 * app/portal/websites/[siteId]/navigation/_lib/tree.ts.
 */
import { describe, it, expect } from 'vitest';
import {
  appendItem,
  childrenOf,
  collectDescendantIds,
  findById,
  moveInFlatList,
  removeItemAndDescendants,
  topLevel,
  updateById,
  withSequentialSortOrder,
} from '@/app/portal/websites/[siteId]/navigation/_lib/tree';
import type { NavItem } from '@/app/portal/websites/[siteId]/navigation/_lib/types';

const make = (id: number, parentId: number | null = null, overrides: Partial<NavItem> = {}): NavItem => ({
  id,
  label: `Item ${id}`,
  href: `/i/${id}`,
  parentId,
  sortOrder: 0,
  openInNewTab: false,
  isButton: false,
  ...overrides,
});

describe('topLevel', () => {
  it('returns only items with no parentId', () => {
    const items = [make(1), make(2, 1), make(3), make(4, 2)];
    expect(topLevel(items).map((i) => i.id)).toEqual([1, 3]);
  });

  it('returns empty array for empty input', () => {
    expect(topLevel([])).toEqual([]);
  });
});

describe('childrenOf', () => {
  it('returns direct children only (not grandchildren)', () => {
    const items = [make(1), make(2, 1), make(3, 1), make(4, 2)];
    expect(childrenOf(items, 1).map((i) => i.id)).toEqual([2, 3]);
  });

  it('returns empty array for a leaf', () => {
    const items = [make(1), make(2, 1)];
    expect(childrenOf(items, 2)).toEqual([]);
  });
});

describe('findById', () => {
  it('finds a matching item', () => {
    const items = [make(1), make(2, 1)];
    expect(findById(items, 2)?.id).toBe(2);
  });

  it('returns undefined when missing', () => {
    expect(findById([make(1)], 99)).toBeUndefined();
  });
});

describe('collectDescendantIds', () => {
  it('returns just the id for a leaf node', () => {
    const items = [make(1)];
    expect(Array.from(collectDescendantIds(items, 1))).toEqual([1]);
  });

  it('walks transitively through grandchildren', () => {
    // 1 -> 2 -> 4
    //       \-> 5
    //  \-> 3
    const items = [make(1), make(2, 1), make(3, 1), make(4, 2), make(5, 2)];
    const ids = Array.from(collectDescendantIds(items, 1)).sort();
    expect(ids).toEqual([1, 2, 3, 4, 5]);
  });

  it('does not include unrelated branches', () => {
    const items = [make(1), make(2, 1), make(10), make(11, 10)];
    const ids = Array.from(collectDescendantIds(items, 1)).sort();
    expect(ids).toEqual([1, 2]);
  });
});

describe('removeItemAndDescendants', () => {
  it('removes the item and all transitive descendants', () => {
    const items = [make(1), make(2, 1), make(3, 1), make(4, 2), make(99)];
    const result = removeItemAndDescendants(items, 1);
    expect(result.map((i) => i.id).sort()).toEqual([99]);
  });

  it('is a no-op when the id is missing', () => {
    const items = [make(1), make(2, 1)];
    expect(removeItemAndDescendants(items, 999)).toEqual(items);
  });

  it('returns a new array (purity)', () => {
    const items = [make(1)];
    const result = removeItemAndDescendants(items, 999);
    // Same content, but the function may return the same reference if optimized.
    // Our implementation always uses .filter() so a new array is returned.
    expect(result).not.toBe(items);
  });
});

describe('moveInFlatList', () => {
  it('moves an item up by 1', () => {
    const items = [make(1), make(2), make(3)];
    const result = moveInFlatList(items, 2, -1);
    expect(result.map((i) => i.id)).toEqual([2, 1, 3]);
  });

  it('moves an item down by 1', () => {
    const items = [make(1), make(2), make(3)];
    const result = moveInFlatList(items, 2, 1);
    expect(result.map((i) => i.id)).toEqual([1, 3, 2]);
  });

  it('is a no-op at the top boundary', () => {
    const items = [make(1), make(2)];
    expect(moveInFlatList(items, 1, -1)).toBe(items);
  });

  it('is a no-op at the bottom boundary', () => {
    const items = [make(1), make(2)];
    expect(moveInFlatList(items, 2, 1)).toBe(items);
  });

  it('is a no-op when the id is missing', () => {
    const items = [make(1)];
    expect(moveInFlatList(items, 99, 1)).toBe(items);
  });
});

describe('updateById', () => {
  it('shallow-merges updates on the matching item', () => {
    const items = [make(1, null, { label: 'Old' }), make(2)];
    const result = updateById(items, 1, { label: 'New', isButton: true });
    expect(result[0].label).toBe('New');
    expect(result[0].isButton).toBe(true);
    // Untouched fields preserved
    expect(result[0].href).toBe('/i/1');
    // Other items unchanged
    expect(result[1]).toBe(items[1]);
  });

  it('is a no-op when the id is missing', () => {
    const items = [make(1)];
    const result = updateById(items, 99, { label: 'X' });
    expect(result.map((i) => i.label)).toEqual(['Item 1']);
  });
});

describe('appendItem', () => {
  it('appends a new item with defaults', () => {
    const items: NavItem[] = [];
    const result = appendItem(items, -1, null);
    expect(result.length).toBe(1);
    expect(result[0]).toMatchObject({
      id: -1,
      label: 'New Link',
      href: '/',
      parentId: null,
      openInNewTab: false,
      isButton: false,
    });
  });

  it('respects custom defaults (label/href/etc)', () => {
    const items: NavItem[] = [];
    const result = appendItem(items, -2, 5, { label: 'Pricing', href: '/pricing' });
    expect(result[0]).toMatchObject({ id: -2, label: 'Pricing', href: '/pricing', parentId: 5 });
  });

  it('sets sortOrder to current length', () => {
    const items = [make(1), make(2)];
    const result = appendItem(items, -1, null);
    expect(result[2].sortOrder).toBe(2);
  });
});

describe('withSequentialSortOrder', () => {
  it('rewrites sortOrder to positional index', () => {
    const items = [
      make(1, null, { sortOrder: 99 }),
      make(2, null, { sortOrder: 50 }),
      make(3, null, { sortOrder: 0 }),
    ];
    const result = withSequentialSortOrder(items);
    expect(result.map((i) => i.sortOrder)).toEqual([0, 1, 2]);
  });

  it('preserves all other fields', () => {
    const items = [make(7, 3, { label: 'X' })];
    const result = withSequentialSortOrder(items);
    expect(result[0]).toMatchObject({ id: 7, parentId: 3, label: 'X', sortOrder: 0 });
  });
});
