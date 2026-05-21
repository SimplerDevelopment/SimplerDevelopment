'use client';

/**
 * DecisionCard — compact list row for a brain_decisions record.
 *
 * Used in:
 *   - /portal/brain/decisions (list view)
 *   - DecisionSupersedeChain rows (non-current chain entries)
 *
 * Renders the title, status / reversibility chips, a relative decided-at
 * date, the first ~120 chars of the decision body, and an anchor chip when
 * the row is linked to a meeting/note/company/deal.
 *
 * The card is keyboard-activatable when `onClick` is provided (rendered as a
 * <button>); otherwise it's a static <div> for embedding in non-interactive
 * contexts.
 */
import type { BrainDecisionReversibility, BrainDecisionStatus } from '@/lib/db/schema';

export interface DecisionRow {
  id: number;
  title: string;
  context?: string | null;
  decision: string;
  rationale?: string;
  alternativesConsidered?: string | null;
  status: BrainDecisionStatus;
  reversibility: BrainDecisionReversibility;
  decisionMakerId: number | null;
  decidedAt: string | Date;
  meetingId?: number | null;
  noteId?: number | null;
  companyId?: number | null;
  dealId?: number | null;
  supersededByDecisionId?: number | null;
}

const STATUS_STYLES: Record<BrainDecisionStatus, string> = {
  accepted: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  proposed: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30',
  superseded: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
  rejected: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30',
};

const STATUS_LABEL: Record<BrainDecisionStatus, string> = {
  accepted: 'Accepted',
  proposed: 'Proposed',
  superseded: 'Superseded',
  rejected: 'Rejected',
};

const REVERSIBILITY_LABEL: Record<BrainDecisionReversibility, string> = {
  one_way: 'One-way',
  two_way: 'Two-way',
};

const REVERSIBILITY_ICON: Record<BrainDecisionReversibility, string> = {
  // Material Icons doesn't ship a `one_way` glyph — use arrow_forward/sync as
  // the closest semantic match.
  one_way: 'arrow_forward',
  two_way: 'sync_alt',
};

export function relativeDate(input: string | Date | null | undefined): string {
  if (!input) return '';
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffSec = Math.round(diffMs / 1000);
  if (Math.abs(diffSec) < 60) return diffSec >= 0 ? 'just now' : 'in a moment';
  const abs = Math.abs(diffSec);
  const past = diffSec >= 0;
  const fmt = (n: number, unit: string) => `${past ? '' : 'in '}${n} ${unit}${n === 1 ? '' : 's'}${past ? ' ago' : ''}`;
  if (abs < 3600) return fmt(Math.round(abs / 60), 'min');
  if (abs < 86_400) return fmt(Math.round(abs / 3600), 'hour');
  if (abs < 86_400 * 30) return fmt(Math.round(abs / 86_400), 'day');
  if (abs < 86_400 * 365) return fmt(Math.round(abs / (86_400 * 30)), 'month');
  return fmt(Math.round(abs / (86_400 * 365)), 'year');
}

function truncate(text: string | undefined, max: number): string {
  if (!text) return '';
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

function pickAnchor(d: DecisionRow): { icon: string; label: string } | null {
  if (d.meetingId) return { icon: 'event', label: `Meeting #${d.meetingId}` };
  if (d.noteId) return { icon: 'description', label: `Note #${d.noteId}` };
  if (d.companyId) return { icon: 'business', label: `Company #${d.companyId}` };
  if (d.dealId) return { icon: 'handshake', label: `Deal #${d.dealId}` };
  return null;
}

export interface DecisionCardProps {
  decision: DecisionRow;
  /** When provided, the card renders as a clickable button. */
  onClick?: () => void;
  /** Highlight the card (used by the supersede-chain to mark "current"). */
  highlighted?: boolean;
  /** Compact mode trims padding + truncation for use inside chains. */
  compact?: boolean;
}

export default function DecisionCard({ decision, onClick, highlighted, compact }: DecisionCardProps) {
  const anchor = pickAnchor(decision);
  const reversibilityIcon = REVERSIBILITY_ICON[decision.reversibility];
  const reversibilityLabel = REVERSIBILITY_LABEL[decision.reversibility];

  const body = (
    <>
      <div className="flex items-start justify-between gap-3 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-foreground truncate flex items-center gap-2">
            <span className="material-icons text-base text-primary shrink-0">gavel</span>
            <span className="truncate">{decision.title}</span>
          </div>
          {!compact && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {truncate(decision.decision, 200)}
            </p>
          )}
        </div>
        <span
          className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${STATUS_STYLES[decision.status]}`}
          title={`Status: ${STATUS_LABEL[decision.status]}`}
        >
          {STATUS_LABEL[decision.status]}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border bg-muted/30"
          title={`Reversibility: ${reversibilityLabel}`}
        >
          <span className="material-icons text-[12px] leading-none">{reversibilityIcon}</span>
          {reversibilityLabel}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="material-icons text-[12px] leading-none">schedule</span>
          {relativeDate(decision.decidedAt)}
        </span>
        {anchor && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border bg-muted/30">
            <span className="material-icons text-[12px] leading-none">{anchor.icon}</span>
            {anchor.label}
          </span>
        )}
        {decision.supersededByDecisionId && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300">
            <span className="material-icons text-[12px] leading-none">arrow_forward</span>
            superseded by #{decision.supersededByDecisionId}
          </span>
        )}
      </div>
    </>
  );

  const baseClass =
    `block w-full text-left bg-card border rounded-lg ${compact ? 'p-3' : 'p-4'} transition-colors ` +
    (highlighted
      ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
      : 'border-border hover:border-primary/40 hover:bg-muted/30');

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={baseClass}>
        {body}
      </button>
    );
  }
  return <div className={baseClass}>{body}</div>;
}
