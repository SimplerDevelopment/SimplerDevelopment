// "Whose turn it is" (PUX-155/156, design doc screens 14–15). The ticket
// column stores the system's state — open, in_progress, waiting_on_customer
// (legacy: waiting), resolved, closed (lib/db/schema/pm.ts). A client does not
// care which of those it is; they care whether the next move is theirs. Three
// buckets, and the three tabs on the list are exactly these.
import { formatDelta } from './sla';

export type Turn = 'you' | 'us' | 'done';

export const TURNS: { key: Turn; label: string; statuses: string[] }[] = [
  { key: 'you', label: 'Waiting on you', statuses: ['waiting_on_customer', 'waiting'] },
  { key: 'us', label: 'Waiting on us', statuses: ['open', 'in_progress'] },
  { key: 'done', label: 'Resolved', statuses: ['resolved', 'closed'] },
];

export function isTurn(v: string | undefined | null): v is Turn {
  return v === 'you' || v === 'us' || v === 'done';
}

/** Unknown statuses count as ours — never tell a client something is waiting on them when it is not. */
export function whoseTurn(status: string): Turn {
  return TURNS.find((t) => t.statuses.includes(status))?.key ?? 'us';
}

export function turnLabel(status: string): string {
  return TURNS.find((t) => t.key === whoseTurn(status))!.label;
}

export function statusesForTurn(turn: Turn): string[] {
  return TURNS.find((t) => t.key === turn)!.statuses;
}

/** Ticket categories (lib/db/schema/pm.ts comment) → the labels the new-ticket form shows. */
export const CATEGORY_LABELS: Record<string, string> = {
  general: 'General', billing: 'Billing', technical: 'Technical', domain: 'Domain', hosting: 'Hosting',
};
export function categoryLabel(category: string | null | undefined): string {
  if (!category) return '—';
  return CATEGORY_LABELS[category] ?? category.charAt(0).toUpperCase() + category.slice(1).replace(/_/g, ' ');
}

/** Pill tones for the three turns (studio tokens; base-palette-safe). */
export function turnPillClass(turn: Turn): string {
  return turn === 'you'
    ? 'bg-[var(--portal-warn-bg)] text-[var(--portal-warn)]'
    : turn === 'done'
      ? 'bg-[var(--portal-ok-bg)] text-[var(--portal-ok)]'
      : 'bg-accent text-accent-foreground';
}


const toMs = (d: Date | string | null | undefined) => (d ? new Date(d).getTime() : null);
const shortDate = (d: Date | string) => new Date(d).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });

/**
 * The SLA as one sentence a client can act on (design doc screen 15) instead
 * of a policy label and a badge. The first-response clock is the number a
 * client actually cares about ("when will I hear back"); it stops when our
 * first public reply lands (firstResponseAt). A client reply never touches it
 * — it only moves the ticket back to our queue (messages route).
 */
export function slaSentence(
  t: { status: string; firstResponseAt?: Date | string | null; firstResponseDueAt?: Date | string | null; resolutionDueAt?: Date | string | null; resolvedAt?: Date | string | null },
  now: Date = new Date(),
): string {
  const turn = whoseTurn(t.status);
  if (turn === 'done') return t.resolvedAt ? `Resolved ${shortDate(t.resolvedAt)}.` : 'Resolved.';
  if (turn === 'you') return "Your turn — reply when you're ready. Replying moves it back to our queue.";
  const firstDue = toMs(t.firstResponseDueAt);
  if (!t.firstResponseAt && firstDue !== null) {
    const diff = firstDue - now.getTime();
    return diff > 0 ? `Reply due in ${formatDelta(diff)}.` : `Our reply is ${formatDelta(-diff)} overdue — sorry, it's on us.`;
  }
  const resDue = toMs(t.resolutionDueAt);
  if (resDue !== null) {
    const diff = resDue - now.getTime();
    return diff > 0 ? `With our team — resolve by ${shortDate(t.resolutionDueAt!)}.` : `With our team — resolution is ${formatDelta(-diff)} overdue.`;
  }
  return 'With our team.';
}
