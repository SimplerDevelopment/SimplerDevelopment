// ─── Pure tree helpers for the navigation editor ─────────────────────────────
//
// The nav data model is a flat list of items keyed by `parentId`. These
// helpers stay in pure-function land so they can be unit-tested without
// React or the DOM.

import type { NavItem } from './types';

/** Items with no parent (top-level menu items). */
export function topLevel<T extends { parentId: number | null }>(items: T[]): T[] {
  return items.filter((i) => !i.parentId);
}

/** Direct children of `parentId`. */
export function childrenOf<T extends { parentId: number | null }>(items: T[], parentId: number): T[] {
  return items.filter((i) => i.parentId === parentId);
}

/** Find an item by id; returns undefined if not present. */
export function findById<T extends { id: number }>(items: T[], id: number): T | undefined {
  return items.find((i) => i.id === id);
}

/** Collect the id of `id` and all transitive descendants. */
export function collectDescendantIds<T extends { id: number; parentId: number | null }>(
  items: T[],
  id: number,
): Set<number> {
  const ids = new Set<number>();
  const walk = (parentId: number) => {
    ids.add(parentId);
    for (const child of items) {
      if (child.parentId === parentId) walk(child.id);
    }
  };
  walk(id);
  return ids;
}

/** Remove an item and all of its descendants. Returns a new array. */
export function removeItemAndDescendants<T extends { id: number; parentId: number | null }>(
  items: T[],
  id: number,
): T[] {
  const ids = collectDescendantIds(items, id);
  return items.filter((i) => !ids.has(i.id));
}

/**
 * Move the item with `id` by `direction` positions in the flat list.
 * Mirrors the original page behavior: it operates on the raw flat array
 * (no group-by-parent), which is what the saved sortOrder reflects.
 * Returns a new array (or the same reference if no move was possible).
 */
export function moveInFlatList<T extends { id: number }>(
  items: T[],
  id: number,
  direction: -1 | 1,
): T[] {
  const idx = items.findIndex((i) => i.id === id);
  if (idx < 0) return items;
  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= items.length) return items;
  const arr = items.slice();
  [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
  return arr;
}

/** Add `updates` onto the item with `id`. Returns a new array. */
export function updateById<T extends { id: number }>(
  items: T[],
  id: number,
  updates: Partial<T>,
): T[] {
  return items.map((i) => (i.id === id ? { ...i, ...updates } : i));
}

/**
 * Append a new item to the list. Caller provides the temp id (or a real one).
 * Defaults are applied so all required NavItem fields are present.
 */
export function appendItem(
  items: NavItem[],
  newId: number,
  parentId: number | null = null,
  defaults?: Partial<NavItem>,
): NavItem[] {
  const newItem: NavItem = {
    id: newId,
    label: defaults?.label || 'New Link',
    href: defaults?.href || '/',
    parentId,
    sortOrder: items.length,
    openInNewTab: false,
    isButton: false,
    ...defaults,
  };
  return [...items, newItem];
}

/** Re-emit items with sortOrder = positional index. Used right before save. */
export function withSequentialSortOrder<T>(items: T[]): (T & { sortOrder: number })[] {
  return items.map((item, i) => ({ ...item, sortOrder: i }));
}
