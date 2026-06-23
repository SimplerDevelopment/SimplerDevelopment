/**
 * Shared types + tiny helpers for the initiatives + goals UI surface.
 *
 * Lives in components/brain/ (not lib/) so the client bundle never has to
 * pull in lib/db / drizzle just to render a status chip.
 */

export type BrainInitiativeStatus =
  | 'planned'
  | 'active'
  | 'paused'
  | 'completed'
  | 'cancelled';

export type BrainInitiativePriority = 'low' | 'medium' | 'high' | 'critical';

export type BrainInitiativeLinkType =
  | 'task'
  | 'note'
  | 'meeting'
  | 'decision'
  | 'topic'
  | 'crm_deal'
  | 'crm_company';

export type BrainGoalStatus =
  | 'open'
  | 'on_track'
  | 'at_risk'
  | 'off_track'
  | 'achieved'
  | 'missed';

export interface InitiativeRow {
  id: number;
  clientId: number;
  name: string;
  slug: string;
  description: string | null;
  status: BrainInitiativeStatus;
  priority: BrainInitiativePriority;
  ownerId: number | null;
  sponsorId: number | null;
  startDate: string | null;
  targetDate: string | null;
  closedAt: string | null;
  closeReason: string | null;
  lessonsLearned: string | null;
  confidentialityLevel: string;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
  goalCount?: number;
}

export interface GoalRow {
  id: number;
  clientId: number;
  initiativeId: number;
  title: string;
  description: string | null;
  status: BrainGoalStatus;
  ownerId: number | null;
  unit: string | null;
  targetMetric: number | null;
  currentMetric: number | null;
  lastProgressNote: string | null;
  lastCheckedInAt: string | null;
  targetDate: string | null;
  sortOrder: number;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface InitiativeLinkItem {
  linkId: number;
  entityType: BrainInitiativeLinkType;
  entityId: number;
  title: string | null;
  pinned: boolean;
  note: string | null;
  createdAt: string;
}

export const INITIATIVE_STATUSES: BrainInitiativeStatus[] = [
  'planned',
  'active',
  'paused',
  'completed',
  'cancelled',
];

export const INITIATIVE_PRIORITIES: BrainInitiativePriority[] = [
  'low',
  'medium',
  'high',
  'critical',
];

export const GOAL_STATUSES: BrainGoalStatus[] = [
  'open',
  'on_track',
  'at_risk',
  'off_track',
  'achieved',
  'missed',
];

export const LINK_ENTITY_TYPES: BrainInitiativeLinkType[] = [
  'task',
  'note',
  'meeting',
  'decision',
  'topic',
  'crm_deal',
  'crm_company',
];

// ─── style maps ──────────────────────────────────────────────────────────────

export function initiativeStatusChip(
  status: BrainInitiativeStatus,
): { label: string; className: string; icon: string } {
  switch (status) {
    case 'planned':
      return { label: 'Planned', icon: 'edit_calendar', className: 'bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300' };
    case 'active':
      return { label: 'Active', icon: 'rocket_launch', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' };
    case 'paused':
      return { label: 'Paused', icon: 'pause_circle', className: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' };
    case 'completed':
      return { label: 'Completed', icon: 'check_circle', className: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' };
    case 'cancelled':
      return { label: 'Cancelled', icon: 'cancel', className: 'bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400' };
  }
}

export function initiativePriorityChip(
  priority: BrainInitiativePriority,
): { label: string; className: string } {
  switch (priority) {
    case 'low':
      return { label: 'Low', className: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-700/40 dark:text-zinc-300' };
    case 'medium':
      return { label: 'Medium', className: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' };
    case 'high':
      return { label: 'High', className: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300' };
    case 'critical':
      return { label: 'Critical', className: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300' };
  }
}

export function goalStatusChip(
  status: BrainGoalStatus,
): { label: string; className: string; icon: string } {
  switch (status) {
    case 'open':       return { label: 'Open',       icon: 'radio_button_unchecked', className: 'bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300' };
    case 'on_track':   return { label: 'On track',   icon: 'trending_up',            className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' };
    case 'at_risk':    return { label: 'At risk',    icon: 'warning',                className: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' };
    case 'off_track':  return { label: 'Off track',  icon: 'trending_down',          className: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300' };
    case 'achieved':   return { label: 'Achieved',   icon: 'emoji_events',           className: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' };
    case 'missed':     return { label: 'Missed',     icon: 'cancel',                 className: 'bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400' };
  }
}

export function linkEntityTypeMeta(t: BrainInitiativeLinkType): { label: string; icon: string; pluralLabel: string } {
  switch (t) {
    case 'task':        return { label: 'Task',     pluralLabel: 'Tasks',      icon: 'task_alt' };
    case 'note':        return { label: 'Note',     pluralLabel: 'Notes',      icon: 'sticky_note_2' };
    case 'meeting':     return { label: 'Meeting',  pluralLabel: 'Meetings',   icon: 'forum' };
    case 'decision':    return { label: 'Decision', pluralLabel: 'Decisions',  icon: 'gavel' };
    case 'topic':       return { label: 'Topic',    pluralLabel: 'Topics',     icon: 'sell' };
    case 'crm_deal':    return { label: 'Deal',     pluralLabel: 'Deals',      icon: 'handshake' };
    case 'crm_company': return { label: 'Company',  pluralLabel: 'Companies',  icon: 'business' };
  }
}

// ─── formatters ──────────────────────────────────────────────────────────────

/**
 * Tiny relative-time formatter. Matches the shape used elsewhere in the portal
 * (see components/portal/comments/ThreadCard.tsx). Returns 'just now', '7m',
 * '3h', '5d', '2mo', '1y'. Pass `signed: true` to flip past/future ('in 2d',
 * '3d ago') — useful for target dates.
 */
export function relativeTime(d: Date | string, opts: { signed?: boolean } = {}): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  const diffMs = date.getTime() - Date.now();
  const future = diffMs > 0;
  const abs = Math.abs(diffMs);
  const s = Math.floor(abs / 1000);
  if (s < 45) return opts.signed ? (future ? 'soon' : 'just now') : 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return opts.signed ? (future ? `in ${m}m` : `${m}m ago`) : `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return opts.signed ? (future ? `in ${h}h` : `${h}h ago`) : `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 30) return opts.signed ? (future ? `in ${days}d` : `${days}d ago`) : `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return opts.signed ? (future ? `in ${months}mo` : `${months}mo ago`) : `${months}mo`;
  const years = Math.floor(months / 12);
  return opts.signed ? (future ? `in ${years}y` : `${years}y ago`) : `${years}y`;
}

/** Days remaining (signed). Returns null if no targetDate. */
export function daysUntil(target: string | null): number | null {
  if (!target) return null;
  const ms = new Date(target).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

/** Unit-aware progress display (e.g. "12 / 30%", "$3.2M / $5M", "12 / 50"). */
export function formatMetric(value: number | null, unit: string | null): string {
  if (value === null || value === undefined) return '—';
  if (unit === 'percent') return `${value}%`;
  if (unit === 'usd_cents') {
    const dollars = value / 100;
    if (Math.abs(dollars) >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
    if (Math.abs(dollars) >= 1_000) return `$${(dollars / 1_000).toFixed(1)}k`;
    return `$${dollars.toFixed(0)}`;
  }
  if (unit === 'count') return value.toLocaleString();
  if (unit === 'boolean') return value > 0 ? 'Yes' : 'No';
  return value.toLocaleString();
}

/** Progress percentage clamped 0..100. Returns null when we can't compute. */
export function progressPercent(
  current: number | null,
  target: number | null,
): number | null {
  if (current === null || target === null) return null;
  if (target <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((current / target) * 100)));
}
