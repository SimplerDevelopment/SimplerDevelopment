/**
 * Pure transforms + shared types for /portal/my-tasks. Split from the DB-using
 * collector so unit tests can import without booting the Drizzle client.
 */
import type { BrainTaskStatus } from '@/lib/db/schema/brain';

export type MyTaskCardSource = 'kanban' | 'brain';

export interface MyTaskCard {
  /** Kanban card id (number) for `kanban`, brain task id (number) for `brain`. */
  id: number;
  source: MyTaskCardSource;
  /** Display key like `PROJ-7` for kanban, `BRAIN-12` for brain. Null when unavailable. */
  key: string | null;
  title: string;
  priority: string | null;
  dueDate: Date | string | null;
  columnName: string | null;
  columnIsDone: boolean;
  labels: { id: number; name: string; color: string }[];
  checklist: { total: number; done: number } | null;
  /** Click target for the page. Page should use this verbatim instead of constructing inline. */
  linkUrl: string;
  /**
   * For kanban cards: the project's "done" column id, when one exists. Used by
   * the page's inline-complete checkbox to PATCH `/api/portal/cards/[id]/move`
   * without an extra round-trip to fetch the project's columns. Null when no
   * column on the card's project is flagged `is_done`. Always null for brain.
   */
  doneColumnId: number | null;
}

export interface MyTaskGroup {
  /** Numeric for kanban projects; string `brain-...` for synthetic brain groups. */
  id: number | string;
  source: MyTaskCardSource;
  name: string;
  /** Stable key for project URLs, e.g. `PROJ`. Null for brain groups. */
  projectKey: string | null;
  clientName: string | null;
  cards: MyTaskCard[];
}

/** Map a brain task status to its display column label. */
export function statusToColumn(status: BrainTaskStatus): string {
  switch (status) {
    case 'open': return 'Open';
    case 'in_progress': return 'In Progress';
    case 'blocked': return 'Blocked';
    case 'done': return 'Done';
  }
}

/**
 * Group id derivation for a brain task, given which CRM linkage (if any) it has.
 * Returns one of:
 *   - `brain-deal-<dealId>` when dealId is set
 *   - `brain-company-<companyId>` when companyId is set
 *   - `brain-uncategorized` otherwise
 */
export function brainGroupId(opts: { dealId: number | null; companyId: number | null }): string {
  if (opts.dealId) return `brain-deal-${opts.dealId}`;
  if (opts.companyId) return `brain-company-${opts.companyId}`;
  return 'brain-uncategorized';
}

/**
 * Deep-link URL for a brain task. The brain page does not currently accept a
 * `?task=` query param to focus a specific task — TODO once that lands, this
 * URL will work as-is. For now it just routes to the brain tasks board.
 */
export function brainTaskLinkUrl(taskId: number): string {
  // TODO: Update if app/portal/brain/tasks/page.tsx adds a deep-link convention
  // (e.g. `?task=<id>` or `/portal/brain/tasks/<id>`). Until then the page
  // ignores the query and shows the kanban board, which is the correct fallback.
  return `/portal/brain/tasks?task=${taskId}`;
}

/** Click-target URL for a kanban card on the my-tasks page. */
export function kanbanCardLinkUrl(projectId: number, cardId: number): string {
  return `/portal/projects/${projectId}?card=${cardId}`;
}

// ── Filters / pagination ────────────────────────────────────────────────────

export type MyTaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type MyTaskSourceFilter = 'all' | 'kanban' | 'brain';

export interface MyTasksFilters {
  /** Source filter; 'all' shows everything (default). */
  source: MyTaskSourceFilter;
  /** Project ids to include (kanban-only filter). Empty = all projects. */
  projectIds: number[];
  /** Priorities to include. Empty = all priorities. */
  priorities: MyTaskPriority[];
  /** When true, only show cards with a dueDate before now. */
  overdue: boolean;
  /** Default true: hide done. Maps to legacy `openOnly` query param. */
  openOnly: boolean;
}

export interface MyTasksPageParams extends MyTasksFilters {
  /** Hard cap; clamped to [1, 200]. Default 50. */
  limit: number;
  /** Offset-style cursor (opaque to clients; just an integer string). 0/null = first page. */
  cursor: number;
}

export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 200;

/**
 * Parse the my-tasks filter set from a URLSearchParams or a Record<string,string|string[]>.
 * Tolerant: unknown values are dropped, comma-separated list params are accepted.
 */
export function parseMyTasksParams(input: URLSearchParams | Record<string, string | string[] | undefined>): MyTasksPageParams {
  const get = (key: string): string | null => {
    if (input instanceof URLSearchParams) return input.get(key);
    const v = input[key];
    if (Array.isArray(v)) return v[0] ?? null;
    return v ?? null;
  };

  const splitCsv = (raw: string | null): string[] => {
    if (!raw) return [];
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  };

  const sourceRaw = (get('source') ?? 'all').toLowerCase();
  const source: MyTaskSourceFilter = sourceRaw === 'kanban' || sourceRaw === 'brain' ? sourceRaw : 'all';

  const projectIds = splitCsv(get('projectIds'))
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isInteger(n) && n > 0);

  const validPriorities: MyTaskPriority[] = ['low', 'medium', 'high', 'urgent'];
  const priorities = splitCsv(get('priorities'))
    .map((s) => s.toLowerCase())
    .filter((s): s is MyTaskPriority => (validPriorities as string[]).includes(s));

  const overdue = get('overdue') === '1' || get('overdue') === 'true';
  const openOnlyRaw = get('openOnly');
  const openOnly = openOnlyRaw === null ? true : openOnlyRaw !== '0';

  const limitRaw = parseInt(get('limit') ?? '', 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0
    ? Math.min(limitRaw, MAX_PAGE_LIMIT)
    : DEFAULT_PAGE_LIMIT;

  const cursorRaw = parseInt(get('cursor') ?? '', 10);
  const cursor = Number.isFinite(cursorRaw) && cursorRaw > 0 ? cursorRaw : 0;

  return { source, projectIds, priorities, overdue, openOnly, limit, cursor };
}

/**
 * Card-level matcher applied AFTER both collectors have returned. Lets the
 * route apply filters consistently without each collector reimplementing them.
 */
export function cardMatchesFilters(card: MyTaskCard, filters: Pick<MyTasksFilters, 'priorities' | 'overdue'>): boolean {
  if (filters.priorities.length > 0) {
    const p = (card.priority ?? '').toLowerCase();
    if (!(filters.priorities as string[]).includes(p)) return false;
  }
  if (filters.overdue) {
    if (!card.dueDate) return false;
    const due = card.dueDate instanceof Date ? card.dueDate.getTime() : new Date(card.dueDate).getTime();
    if (Number.isNaN(due) || due >= Date.now()) return false;
  }
  return true;
}

/** Stable key for a card across the wire. */
export function cardKey(card: Pick<MyTaskCard, 'source' | 'id'>): string {
  return `${card.source}-${card.id}`;
}

/** Stable group key. Group ids may be number (kanban) or string (brain). */
export function groupKey(group: Pick<MyTaskGroup, 'source' | 'id'>): string {
  return `${group.source}-${group.id}`;
}

/** Sort comparator: dueDate ASC NULLS LAST, then id ASC for tiebreak. */
export function compareCardsByDue(a: MyTaskCard, b: MyTaskCard): number {
  const ad = a.dueDate ? (a.dueDate instanceof Date ? a.dueDate.getTime() : new Date(a.dueDate).getTime()) : Infinity;
  const bd = b.dueDate ? (b.dueDate instanceof Date ? b.dueDate.getTime() : new Date(b.dueDate).getTime()) : Infinity;
  if (ad !== bd) return ad - bd;
  return a.id - b.id;
}
