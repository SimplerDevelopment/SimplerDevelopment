// "Whose turn it is" (PUX-155/156, design doc screens 14–15). The ticket
// column stores the system's state — open, in_progress, waiting_on_customer
// (legacy: waiting), resolved, closed (lib/db/schema/pm.ts). A client does not
// care which of those it is; they care whether the next move is theirs. Three
// buckets, and the three tabs on the list are exactly these.
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
