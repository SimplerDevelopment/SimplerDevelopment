/**
 * Support-ticket SLA helpers.
 *
 * SLA targets are derived from the ticket priority and stamped onto the row
 * at create time so the UI can render countdowns / overdue badges without
 * having to re-derive the policy each render. Targets are intentionally
 * simple (no business-hour math, no escalation matrix) — the goal is to
 * close the v0 helpdesk gap, not to ship a Zendesk clone.
 *
 * TODO: escalation rules, business-hours, per-tenant SLA overrides.
 */

export type TicketPriority = 'urgent' | 'high' | 'medium' | 'low';

export interface SlaPolicy {
  /** Hours from create until first staff response is due. */
  firstResponseHours: number;
  /** Hours from create until resolution is due. */
  resolutionHours: number;
  /** Human label for the policy. */
  label: string;
}

/**
 * Priority → SLA target map. Hours, not minutes — kept coarse on purpose.
 */
export const SLA_BY_PRIORITY: Record<TicketPriority, SlaPolicy> = {
  urgent: { firstResponseHours: 2, resolutionHours: 8, label: 'Urgent (2h / 8h)' },
  high: { firstResponseHours: 4, resolutionHours: 24, label: 'High (4h / 24h)' },
  medium: { firstResponseHours: 12, resolutionHours: 72, label: 'Medium (12h / 72h)' },
  low: { firstResponseHours: 24, resolutionHours: 24 * 7, label: 'Low (24h / 7d)' },
};

function isPriority(value: string | null | undefined): value is TicketPriority {
  return value === 'urgent' || value === 'high' || value === 'medium' || value === 'low';
}

/**
 * Compute first-response + resolution due timestamps for a ticket.
 * Falls back to the `medium` policy for unknown priorities.
 */
export function computeSlaDeadlines(
  priority: string | null | undefined,
  createdAt: Date = new Date(),
): { firstResponseDueAt: Date; resolutionDueAt: Date; policy: SlaPolicy } {
  const key: TicketPriority = isPriority(priority) ? priority : 'medium';
  const policy = SLA_BY_PRIORITY[key];
  const firstResponseDueAt = new Date(createdAt.getTime() + policy.firstResponseHours * 3_600_000);
  const resolutionDueAt = new Date(createdAt.getTime() + policy.resolutionHours * 3_600_000);
  return { firstResponseDueAt, resolutionDueAt, policy };
}

export type SlaStateKind = 'none' | 'on_track' | 'due_soon' | 'overdue' | 'met';

export interface SlaState {
  kind: SlaStateKind;
  /** Short human label, e.g. "Due in 1h", "Overdue 2h", "On track". */
  label: string;
  /** Material Icons name to render alongside the label. */
  icon: string;
  /** Tailwind class snippet for the badge. */
  className: string;
}

const NONE_STATE: SlaState = {
  kind: 'none',
  label: 'No SLA',
  icon: 'schedule',
  className: 'bg-muted text-muted-foreground',
};

/**
 * Format a millisecond delta as a coarse human label (e.g. "2h", "1d 3h", "45m").
 */
export function formatDelta(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  if (totalHours < 24) {
    return remainingMinutes > 0 ? `${totalHours}h ${remainingMinutes}m` : `${totalHours}h`;
  }
  const days = Math.floor(totalHours / 24);
  const remainingHours = totalHours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

/**
 * Reduce a single SLA deadline + the ticket lifecycle into a compact
 * `{ kind, label, icon, className }` payload the badge can render directly.
 *
 * - `met` (green check)        — ticket already resolved/closed
 * - `overdue` (red)            — now > dueAt
 * - `due_soon` (amber)         — within 1h of dueAt
 * - `on_track` (green)         — comfortably ahead
 * - `none`  (muted)            — no due date set
 */
export function slaState(
  dueAt: Date | string | null | undefined,
  options: {
    now?: Date;
    /** If true, returns `met` regardless of the timestamp (ticket resolved/closed). */
    isMet?: boolean;
    /** Threshold for `due_soon`, in ms. Default = 1h. */
    dueSoonMs?: number;
  } = {},
): SlaState {
  const now = options.now ?? new Date();
  const dueSoonMs = options.dueSoonMs ?? 3_600_000;

  if (options.isMet) {
    return {
      kind: 'met',
      label: 'SLA met',
      icon: 'check_circle',
      className: 'bg-green-100 text-green-700',
    };
  }

  if (!dueAt) return NONE_STATE;

  const due = typeof dueAt === 'string' ? new Date(dueAt) : dueAt;
  if (Number.isNaN(due.getTime())) return NONE_STATE;

  const delta = due.getTime() - now.getTime();
  if (delta < 0) {
    return {
      kind: 'overdue',
      label: `Overdue ${formatDelta(-delta)}`,
      icon: 'error',
      className: 'bg-red-100 text-red-700',
    };
  }
  if (delta <= dueSoonMs) {
    return {
      kind: 'due_soon',
      label: `Due in ${formatDelta(delta)}`,
      icon: 'hourglass_top',
      className: 'bg-amber-100 text-amber-800',
    };
  }
  return {
    kind: 'on_track',
    label: 'On track',
    icon: 'schedule',
    className: 'bg-green-100 text-green-700',
  };
}

/** Status values the SLA timer should treat as "stopped". */
export const SLA_TERMINAL_STATUSES = new Set<string>(['resolved', 'closed']);

export function isSlaMet(status: string | null | undefined): boolean {
  return !!status && SLA_TERMINAL_STATUSES.has(status);
}
