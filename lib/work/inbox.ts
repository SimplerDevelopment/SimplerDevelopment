/**
 * PUX-198 (design doc screen 57): one inbox over the queues that already
 * exist — Home's Needs-you rows, my kanban + Brain tasks, and the Brain
 * review queue — normalised to one row shape and grouped by when, not by
 * where they live. Pure; the page feeds it the existing server collectors.
 */
import type { NeedsYouRow } from '@/lib/portal/needs-you-shape';
import type { MyTaskGroup } from '@/lib/portal/my-tasks-shape';

export type WorkSource = 'projects' | 'tickets' | 'approvals' | 'brain' | 'account';
export const SOURCE_LABEL: Record<WorkSource, string> = {
  projects: 'Projects', tickets: 'Tickets', approvals: 'Approvals', brain: 'Brain', account: 'Account',
};

export interface WorkRow {
  key: string;
  source: WorkSource;
  title: string;
  meta: string;
  href: string;
  /** Due date for tasks; the moment it started waiting for everything else. */
  at: Date | null;
  urgent?: boolean;
}

const KIND_SOURCE: Record<NeedsYouRow['kind'], WorkSource> = {
  approve: 'approvals', reply: 'tickets', decide: 'brain', sign: 'account', 'follow-up': 'account', pay: 'account',
};

export function fromNeedsYou(rows: NeedsYouRow[]): WorkRow[] {
  return rows.map((r) => ({ key: `ny:${r.key}`, source: KIND_SOURCE[r.kind], title: r.title, meta: r.meta, href: r.href, at: r.at, urgent: r.urgent }));
}

export function fromTaskGroups(groups: MyTaskGroup[]): WorkRow[] {
  const out: WorkRow[] = [];
  for (const g of groups) {
    for (const c of g.cards) {
      if (c.columnIsDone) continue;
      out.push({
        key: `${g.source}:${c.id}`,
        source: g.source === 'kanban' ? 'projects' : 'brain',
        title: c.title,
        meta: c.columnName ? `${g.name} · ${c.columnName}` : g.name,
        href: c.linkUrl,
        at: c.dueDate ? new Date(c.dueDate) : null,
      });
    }
  }
  return out;
}

export function fromReviewItems(items: { id: number; proposedType: string; createdAt: Date | string }[]): WorkRow[] {
  return items.map((i) => ({
    key: `review:${i.id}`, source: 'brain', title: `Review a suggested ${i.proposedType.replace(/_/g, ' ')}`,
    meta: 'Brain review queue', href: '/portal/brain/review', at: new Date(i.createdAt),
  }));
}

export type Bucket = 'Today' | 'This week' | 'Later';
export const BUCKETS: Bucket[] = ['Today', 'This week', 'Later'];

export function bucketOf(at: Date | null, now: Date = new Date()): Bucket {
  if (!at) return 'Later';
  const endOfToday = new Date(now); endOfToday.setHours(23, 59, 59, 999);
  if (at <= endOfToday) return 'Today'; // overdue and waiting-since land here too
  const week = new Date(endOfToday); week.setDate(week.getDate() + 7);
  return at <= week ? 'This week' : 'Later';
}

export function groupByWhen(rows: WorkRow[], now: Date = new Date()): [Bucket, WorkRow[]][] {
  const sorted = [...rows].sort((a, b) => (a.at?.getTime() ?? Infinity) - (b.at?.getTime() ?? Infinity));
  const by = new Map<Bucket, WorkRow[]>();
  for (const r of sorted) { const k = bucketOf(r.at, now); by.set(k, [...(by.get(k) ?? []), r]); }
  return BUCKETS.filter((b) => by.has(b)).map((b) => [b, by.get(b)!]);
}
