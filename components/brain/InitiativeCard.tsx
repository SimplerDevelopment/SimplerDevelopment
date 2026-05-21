'use client';

/**
 * Card for an initiative list row. Renders as a clickable Link so the whole
 * surface navigates to the detail page; if `onClick` is supplied we render
 * as a button instead (useful for picker dialogs).
 */
import Link from 'next/link';
import {
  initiativeStatusChip,
  initiativePriorityChip,
  relativeTime,
  daysUntil,
  type InitiativeRow,
} from './initiatives-shared';

interface OwnerLookup {
  [userId: number]: { name: string | null; email: string };
}

interface Props {
  initiative: InitiativeRow;
  ownerLookup?: OwnerLookup;
  onClick?: () => void;
  href?: string;
}

export default function InitiativeCard({ initiative, ownerLookup, onClick, href }: Props) {
  const status = initiativeStatusChip(initiative.status);
  const priority = initiativePriorityChip(initiative.priority);
  const goalCount = initiative.goalCount ?? 0;

  const days = daysUntil(initiative.targetDate);
  const overdue = days !== null && days < 0 && initiative.status !== 'completed' && initiative.status !== 'cancelled';
  const owner = initiative.ownerId !== null ? ownerLookup?.[initiative.ownerId] : null;
  const ownerName = owner?.name || owner?.email || (initiative.ownerId !== null ? `User #${initiative.ownerId}` : null);
  const ownerInitials = owner?.name
    ? owner.name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('')
    : owner?.email
      ? owner.email[0]?.toUpperCase() ?? '?'
      : null;

  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-semibold text-foreground truncate">
              {initiative.name}
            </h3>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${status.className}`}
            >
              <span className="material-icons text-[14px]">{status.icon}</span>
              {status.label}
            </span>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${priority.className}`}
            >
              {priority.label}
            </span>
          </div>
          {initiative.description && (
            <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">
              {initiative.description}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
        {ownerName ? (
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold"
              title={ownerName}
            >
              {ownerInitials ?? '?'}
            </span>
            <span className="truncate max-w-[10rem]">{ownerName}</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-muted-foreground/70">
            <span className="material-icons text-base">person_off</span>
            unassigned
          </span>
        )}

        {initiative.targetDate ? (
          <span className={`inline-flex items-center gap-1 ${overdue ? 'text-red-600 dark:text-red-400 font-medium' : ''}`}>
            <span className="material-icons text-base">
              {overdue ? 'event_busy' : 'event'}
            </span>
            {overdue
              ? `overdue ${relativeTime(initiative.targetDate, { signed: false })}`
              : `target ${relativeTime(initiative.targetDate, { signed: true })}`}
          </span>
        ) : null}

        <span className="inline-flex items-center gap-1">
          <span className="material-icons text-base">track_changes</span>
          {goalCount === 0 ? 'no goals' : `${goalCount} goal${goalCount === 1 ? '' : 's'}`}
        </span>
      </div>
    </>
  );

  const baseClassName =
    'block text-left w-full bg-card border border-border rounded-xl p-4 hover:border-primary/50 hover:shadow-sm transition-all';

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={baseClassName}>
        {inner}
      </button>
    );
  }
  return (
    <Link href={href ?? `/portal/brain/initiatives/${initiative.id}`} className={baseClassName}>
      {inner}
    </Link>
  );
}
