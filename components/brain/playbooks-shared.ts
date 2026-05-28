/**
 * Shared types + helpers for the playbooks + runs UI surface.
 *
 * Lives in components/brain/ so the client bundle never has to import lib/db
 * just to render a status chip. Mirrors the shape of initiatives-shared.ts.
 */

export type BrainPlaybookStatus = 'draft' | 'active' | 'archived';
export type BrainPlaybookTriggerKind = 'manual' | 'event' | 'scheduled';
export type BrainPlaybookStepKind =
  | 'task'
  | 'note'
  | 'meeting'
  | 'decision'
  | 'review_item'
  | 'wait'
  | 'branch';

export type BrainPlaybookRunStatus =
  | 'pending'
  | 'active'
  | 'paused'
  | 'completed'
  | 'aborted'
  | 'failed';

export type BrainPlaybookRunStepStatus =
  | 'pending'
  | 'active'
  | 'completed'
  | 'skipped'
  | 'failed';

export type BrainPlaybookLinkEntityType =
  | 'initiative'
  | 'person'
  | 'crm_company'
  | 'crm_deal'
  | 'meeting'
  | 'decision';

export type BrainPlaybookConditionOp =
  | 'eq'
  | 'neq'
  | 'in'
  | 'not_in'
  | 'exists'
  | 'not_exists'
  | 'gt'
  | 'lt';

export interface BrainPlaybookCondition {
  field: string;
  op: BrainPlaybookConditionOp;
  value?: unknown;
}

export interface PlaybookTriggerConfig {
  event?: string;
  filters?: Record<string, unknown>;
  cron?: string;
}

export interface PlaybookListRow {
  id: number;
  name: string;
  slug: string;
  status: BrainPlaybookStatus;
  triggerKind: BrainPlaybookTriggerKind;
  category: string | null;
  ownerId: number | null;
  stepCount: number;
  activeRunCount: number;
}

export interface PlaybookRow {
  id: number;
  clientId: number;
  name: string;
  slug: string;
  description: string | null;
  status: BrainPlaybookStatus;
  triggerKind: BrainPlaybookTriggerKind;
  triggerConfig: PlaybookTriggerConfig | null;
  category: string | null;
  ownerId: number | null;
  defaultTopicIds: number[];
  source: string;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlaybookStepRow {
  id: number;
  clientId: number;
  playbookId: number;
  key: string;
  name: string;
  description: string | null;
  kind: BrainPlaybookStepKind;
  config: Record<string, unknown>;
  condition: BrainPlaybookCondition | null;
  nextStepKeys: string[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlaybookRunListRow {
  id: number;
  playbookId: number;
  playbookName: string;
  label: string;
  status: BrainPlaybookRunStatus;
  startedAt: string | null;
  completedAt: string | null;
  stepProgress: { completed: number; total: number };
}

export interface PlaybookRunDetailStep {
  id: number;
  stepId: number;
  key: string;
  name: string;
  kind: BrainPlaybookStepKind;
  status: BrainPlaybookRunStepStatus;
  resultEntityType: string | null;
  resultEntityId: number | null;
  startedAt: string | null;
  completedAt: string | null;
  waitUntil: string | null;
  failureReason: string | null;
}

export interface PlaybookRunRow {
  id: number;
  clientId: number;
  playbookId: number;
  label: string;
  status: BrainPlaybookRunStatus;
  context: Record<string, unknown>;
  startedBy: number | null;
  triggerPayload: Record<string, unknown> | null;
  startedAt: string | null;
  completedAt: string | null;
  abortedAt: string | null;
  abortReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlaybookRunLink {
  id: number;
  runId: number;
  entityType: BrainPlaybookLinkEntityType;
  entityId: number;
  createdAt: string;
}

export const PLAYBOOK_STATUSES: BrainPlaybookStatus[] = ['draft', 'active', 'archived'];
export const PLAYBOOK_TRIGGER_KINDS: BrainPlaybookTriggerKind[] = ['manual', 'event', 'scheduled'];
export const PLAYBOOK_STEP_KINDS: BrainPlaybookStepKind[] = [
  'task',
  'note',
  'meeting',
  'decision',
  'review_item',
  'wait',
  'branch',
];
export const PLAYBOOK_RUN_STATUSES: BrainPlaybookRunStatus[] = [
  'pending',
  'active',
  'paused',
  'completed',
  'aborted',
  'failed',
];
export const PLAYBOOK_RUN_STEP_STATUSES: BrainPlaybookRunStepStatus[] = [
  'pending',
  'active',
  'completed',
  'skipped',
  'failed',
];
export const PLAYBOOK_LINK_ENTITY_TYPES: BrainPlaybookLinkEntityType[] = [
  'initiative',
  'person',
  'crm_company',
  'crm_deal',
  'meeting',
  'decision',
];
export const PLAYBOOK_CONDITION_OPS: BrainPlaybookConditionOp[] = [
  'eq',
  'neq',
  'in',
  'not_in',
  'exists',
  'not_exists',
  'gt',
  'lt',
];

// ─── chip helpers ──────────────────────────────────────────────────────────

export function playbookStatusChip(
  status: BrainPlaybookStatus,
): { label: string; icon: string; className: string } {
  switch (status) {
    case 'draft':
      return {
        label: 'Draft',
        icon: 'edit_note',
        className:
          'bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300',
      };
    case 'active':
      return {
        label: 'Active',
        icon: 'play_circle',
        className:
          'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
      };
    case 'archived':
      return {
        label: 'Archived',
        icon: 'archive',
        className:
          'bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400',
      };
  }
}

export function playbookTriggerKindChip(
  kind: BrainPlaybookTriggerKind,
): { label: string; icon: string; className: string } {
  switch (kind) {
    case 'manual':
      return {
        label: 'Manual',
        icon: 'touch_app',
        className:
          'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
      };
    case 'event':
      return {
        label: 'Event',
        icon: 'bolt',
        className:
          'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
      };
    case 'scheduled':
      return {
        label: 'Scheduled',
        icon: 'schedule',
        className:
          'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
      };
  }
}

export function playbookStepKindChip(
  kind: BrainPlaybookStepKind,
): { label: string; icon: string; className: string } {
  switch (kind) {
    case 'task':
      return {
        label: 'Task',
        icon: 'task_alt',
        className:
          'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
      };
    case 'note':
      return {
        label: 'Note',
        icon: 'sticky_note_2',
        className:
          'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
      };
    case 'meeting':
      return {
        label: 'Meeting',
        icon: 'forum',
        className:
          'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
      };
    case 'decision':
      return {
        label: 'Decision',
        icon: 'gavel',
        className:
          'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
      };
    case 'review_item':
      return {
        label: 'Review',
        icon: 'fact_check',
        className:
          'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
      };
    case 'wait':
      return {
        label: 'Wait',
        icon: 'hourglass_top',
        className:
          'bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300',
      };
    case 'branch':
      return {
        label: 'Branch',
        icon: 'alt_route',
        className:
          'bg-zinc-100 text-zinc-700 dark:bg-zinc-700/40 dark:text-zinc-300',
      };
  }
}

export function playbookRunStatusChip(
  status: BrainPlaybookRunStatus,
): { label: string; icon: string; className: string } {
  switch (status) {
    case 'pending':
      return {
        label: 'Pending',
        icon: 'pending',
        className:
          'bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300',
      };
    case 'active':
      return {
        label: 'Active',
        icon: 'play_circle',
        className:
          'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
      };
    case 'paused':
      return {
        label: 'Paused',
        icon: 'pause_circle',
        className:
          'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
      };
    case 'completed':
      return {
        label: 'Completed',
        icon: 'check_circle',
        className:
          'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
      };
    case 'aborted':
      return {
        label: 'Aborted',
        icon: 'cancel',
        className:
          'bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400',
      };
    case 'failed':
      return {
        label: 'Failed',
        icon: 'error',
        className:
          'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
      };
  }
}

export function playbookRunStepStatusChip(
  status: BrainPlaybookRunStepStatus,
): { label: string; icon: string; className: string } {
  switch (status) {
    case 'pending':
      return {
        label: 'Pending',
        icon: 'schedule',
        className:
          'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300',
      };
    case 'active':
      return {
        label: 'Active',
        icon: 'play_arrow',
        className:
          'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
      };
    case 'completed':
      return {
        label: 'Completed',
        icon: 'check_circle',
        className:
          'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
      };
    case 'skipped':
      return {
        label: 'Skipped',
        icon: 'skip_next',
        className:
          'bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400',
      };
    case 'failed':
      return {
        label: 'Failed',
        icon: 'error',
        className:
          'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
      };
  }
}

export function playbookLinkEntityMeta(
  type: BrainPlaybookLinkEntityType,
): { label: string; pluralLabel: string; icon: string } {
  switch (type) {
    case 'initiative':
      return { label: 'Initiative', pluralLabel: 'Initiatives', icon: 'flag' };
    case 'person':
      return { label: 'Person', pluralLabel: 'People', icon: 'person' };
    case 'crm_company':
      return { label: 'Company', pluralLabel: 'Companies', icon: 'business' };
    case 'crm_deal':
      return { label: 'Deal', pluralLabel: 'Deals', icon: 'handshake' };
    case 'meeting':
      return { label: 'Meeting', pluralLabel: 'Meetings', icon: 'forum' };
    case 'decision':
      return { label: 'Decision', pluralLabel: 'Decisions', icon: 'gavel' };
  }
}

// ─── formatters ────────────────────────────────────────────────────────────

export function relativeTime(d: Date | string, opts: { signed?: boolean } = {}): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '—';
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

export function durationBetween(
  start: string | Date | null | undefined,
  end: string | Date | null | undefined,
): string | null {
  if (!start || !end) return null;
  const s = typeof start === 'string' ? new Date(start) : start;
  const e = typeof end === 'string' ? new Date(end) : end;
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
  const ms = Math.max(0, e.getTime() - s.getTime());
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}
