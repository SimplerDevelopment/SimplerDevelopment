// Pure helpers shared between export and import — kept out of the
// data-access modules so they can be unit-tested without a DB.

import type { SnapshotNavEntry } from './types';

/** Append `-imported-N` until we land on a slug not in `used`. Does not
 *  mutate `used`. */
export function uniquifySlug(slug: string, used: ReadonlySet<string>): string {
  if (!used.has(slug)) return slug;
  let n = 1;
  while (used.has(`${slug}-imported-${n}`)) n += 1;
  return `${slug}-imported-${n}`;
}

/** Reassemble a flat parent-pointer nav table into the nested
 *  SnapshotNavEntry tree used in payloads. Rows must each carry an `id` and
 *  `parentId` (null for top-level). */
export type FlatNavRow = {
  id: number;
  parentId: number | null;
  label: string;
  href: string;
  sortOrder?: number | null;
  openInNewTab?: boolean | null;
  isButton?: boolean | null;
  description?: string | null;
  icon?: string | null;
  featuredImage?: string | null;
  columnGroup?: number | null;
};

export function buildNavTree(rows: FlatNavRow[]): SnapshotNavEntry[] {
  const byParent = new Map<number | null, FlatNavRow[]>();
  for (const r of rows) {
    const list = byParent.get(r.parentId ?? null) ?? [];
    list.push(r);
    byParent.set(r.parentId ?? null, list);
  }

  function level(parentId: number | null): SnapshotNavEntry[] {
    const list = byParent.get(parentId) ?? [];
    // Stable order: by sortOrder then by id.
    list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id);
    return list.map<SnapshotNavEntry>((r) => ({
      label: r.label,
      href: r.href,
      sortOrder: r.sortOrder ?? 0,
      openInNewTab: r.openInNewTab ?? false,
      isButton: r.isButton ?? false,
      description: r.description ?? null,
      icon: r.icon ?? null,
      featuredImage: r.featuredImage ?? null,
      columnGroup: r.columnGroup ?? null,
      children: level(r.id),
    }));
  }

  return level(null);
}

/** Strip `children` recursively to get the leaf-equivalence shape — useful
 *  for round-trip equality assertions where parent ordering doesn't matter. */
export function flattenNavTree(entries: SnapshotNavEntry[]): Array<Omit<SnapshotNavEntry, 'children'> & { depth: number }> {
  const out: Array<Omit<SnapshotNavEntry, 'children'> & { depth: number }> = [];
  function walk(list: SnapshotNavEntry[], depth: number) {
    for (const e of list) {
      const { children, ...rest } = e;
      out.push({ ...rest, depth });
      if (children?.length) walk(children, depth + 1);
    }
  }
  walk(entries, 0);
  return out;
}
