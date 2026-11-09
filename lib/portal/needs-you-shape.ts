// "Needs you" — the pure half (PUX-145, design doc screen 01). The Home page's
// first card is one list, across every room, of the things only the client
// can do: approve, sign, reply, pay, decide. The VERB is the row's label so it
// scans as a to-do, not a feed.
//
// This module has no I/O so it can be unit-tested; lib/portal/needs-you.ts
// does the Drizzle reads and hands rows here. Same split as my-tasks-shape.ts.

export type NeedsYouKind = 'approve' | 'sign' | 'follow-up' | 'reply' | 'pay' | 'decide';

export interface NeedsYouRow {
  kind: NeedsYouKind;
  /** stable across renders: `${kind}:${id}` */
  key: string;
  title: string;
  /** "Room · Area · detail" — the small line under the title */
  meta: string;
  href: string;
  /** button label */
  cta: string;
  /** what the row is sorted by (most recent activity, or the due date for invoices) */
  at: Date;
  /** overdue invoices jump the queue */
  urgent?: boolean;
}

export const VERB: Record<NeedsYouKind, { label: string; icon: string; gold?: boolean }> = {
  approve: { label: 'Approve', icon: 'rate_review' },
  sign: { label: 'Sign', icon: 'draw' },
  'follow-up': { label: 'Follow up', icon: 'draw' },
  reply: { label: 'Reply', icon: 'reply' },
  pay: { label: 'Pay', icon: 'payments' },
  decide: { label: 'Decide', icon: 'psychology', gold: true }, // gold means the Brain
};

/** "just now" · "40 min ago" · "2 h ago" · "3 days ago" · "Aug 12" */
export function ago(date: Date, now: Date = new Date()): string {
  const s = Math.max(0, (now.getTime() - date.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 14) { const d = Math.floor(s / 86400); return d === 1 ? 'yesterday' : `${d} days ago`; }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Urgent first, then most recent activity first. Stable for equal keys. */
export function sortNeedsYou<T extends Pick<NeedsYouRow, 'at' | 'urgent'>>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (!!a.urgent !== !!b.urgent) return a.urgent ? -1 : 1;
    return b.at.getTime() - a.at.getTime();
  });
}

/** "Seven things want you today. Three of them take under a minute." → the honest version. */
export function needsYouSummary(total: number): string {
  if (total === 0) return 'Nothing needs you right now.';
  if (total === 1) return 'One thing wants you today.';
  return `${total} things want you today.`;
}
