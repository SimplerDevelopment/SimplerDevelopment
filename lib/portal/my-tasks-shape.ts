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
