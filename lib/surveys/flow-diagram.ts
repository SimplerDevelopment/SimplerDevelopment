/**
 * Survey flow diagram helpers (LOGIC-03).
 *
 * Pure functions for extracting page-structure and skip-logic edges from a
 * `SurveyField[]`. Kept side-effect-free so the unit tests can exercise the
 * graph logic without touching React.
 *
 * Page-extraction algorithm mirrors `SurveyFormInline.getPages`:
 *   1. Sort fields by `order` ascending.
 *   2. Start with one empty page.
 *   3. For each field: a `page_break` opens a new page; any other field is
 *      pushed onto the current (last) page.
 *
 * Edges produced:
 *   - `default-next`: page N → page N+1 (every page except the last).
 *   - `goto`: page N → goToPage[opt] for every (select|radio) field on page N
 *     that has a `goToPage` map. One edge per option mapping.
 *
 * Orphans:
 *   Page N (N > 0) is orphaned if no edge in the resulting graph points to it.
 *   A `goToPage` rule that covers EVERY option on the field — and is the ONLY
 *   field on its page — can suppress the default-next edge from that page,
 *   which in turn can orphan the page that would have followed.
 */

import type { SurveyField } from '@/components/admin/SurveyBuilder';

export interface FlowPage {
  /** 0-indexed page number. */
  index: number;
  /** Fields rendered on this page (excludes the page_break itself). */
  fields: SurveyField[];
}

export type FlowEdgeKind = 'default-next' | 'goto';

export interface FlowEdge {
  kind: FlowEdgeKind;
  from: number;
  to: number;
  /** For `goto` edges only — the option text and originating field label. */
  optionLabel?: string;
  fieldLabel?: string;
  fieldId?: string;
}

export interface FlowGraph {
  pages: FlowPage[];
  edges: FlowEdge[];
  /** Set of page indices that have NO incoming edge (excluding page 0). */
  orphans: Set<number>;
}

/**
 * Split a sorted field list into pages by `page_break` boundary.
 * Page-break fields themselves are NOT included in any page's field list.
 */
export function extractPages(fields: SurveyField[]): FlowPage[] {
  const sorted = [...fields].sort((a, b) => a.order - b.order);
  const buckets: SurveyField[][] = [[]];
  for (const f of sorted) {
    if (f.type === 'page_break') {
      buckets.push([]);
    } else {
      buckets[buckets.length - 1].push(f);
    }
  }
  return buckets.map((fields, index) => ({ index, fields }));
}

/**
 * Determine whether a page's default-next edge is suppressed.
 *
 * The default-next edge is suppressed when every "exit path" the user can
 * take from this page lands on an explicit `goToPage` target. We approximate
 * that with the practical case: a single select/radio field on the page whose
 * `goToPage` map covers every option (and every mapped target is a valid
 * in-range page). In that scenario the form engine will always jump via
 * goToPage and never fall through to page N+1.
 *
 * Anything more nuanced (multiple branching fields, partial maps, out-of-range
 * targets) keeps the default-next edge — that matches how the runtime resolver
 * behaves: it applies goToPage on a per-field basis and otherwise advances to
 * N+1.
 */
function isDefaultNextSuppressed(page: FlowPage, totalPages: number): boolean {
  // If there are no fields, the user just clicks "Next" — default-next applies.
  if (page.fields.length === 0) return false;

  // Look at branching fields with a non-empty goToPage map.
  const branchers = page.fields.filter(
    (f) =>
      (f.type === 'select' || f.type === 'radio') &&
      f.goToPage &&
      Object.keys(f.goToPage).length > 0,
  );

  // The "every exit jumps" case only makes sense with exactly one brancher AND
  // that brancher is the only non-heading field on the page (heading fields
  // can't accept input). Be conservative everywhere else.
  if (branchers.length !== 1) return false;
  const brancher = branchers[0];
  const otherInputs = page.fields.filter(
    (f) => f.id !== brancher.id && f.type !== 'heading',
  );
  if (otherInputs.length > 0) return false;

  // Must have at least one option AND every option must map to a valid
  // in-range goToPage target. Out-of-range targets are filtered out of the
  // edge list above, so they shouldn't suppress default-next either.
  const opts = brancher.options || [];
  if (opts.length === 0) return false;
  const map = brancher.goToPage as Record<string, number>;
  return opts.every((opt) => {
    const t = map[opt];
    return typeof t === 'number' && t >= 0 && t < totalPages;
  });
}

/**
 * Build the full graph: pages, edges (default-next + goToPage), and orphans.
 */
export function extractPagesAndEdges(fields: SurveyField[]): FlowGraph {
  const pages = extractPages(fields);
  const edges: FlowEdge[] = [];

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];

    // goToPage edges for any select/radio on this page.
    for (const field of page.fields) {
      if (field.type !== 'select' && field.type !== 'radio') continue;
      if (!field.goToPage) continue;
      for (const [option, target] of Object.entries(field.goToPage)) {
        if (typeof target !== 'number') continue;
        if (target < 0 || target >= pages.length) continue;
        edges.push({
          kind: 'goto',
          from: i,
          to: target,
          optionLabel: option,
          fieldLabel: field.label,
          fieldId: field.id,
        });
      }
    }

    // Default-next edge — skipped on last page or when fully overridden.
    if (i < pages.length - 1 && !isDefaultNextSuppressed(page, pages.length)) {
      edges.push({ kind: 'default-next', from: i, to: i + 1 });
    }
  }

  // Orphan = page N (N > 0) with zero incoming edges.
  const incoming = new Set<number>();
  for (const e of edges) incoming.add(e.to);
  const orphans = new Set<number>();
  for (let i = 1; i < pages.length; i++) {
    if (!incoming.has(i)) orphans.add(i);
  }

  return { pages, edges, orphans };
}
