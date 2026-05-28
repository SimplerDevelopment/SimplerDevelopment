'use client';

/**
 * Card for a playbook list row. Renders as a clickable Link so the whole
 * surface navigates to the detail page; if `onClick` is supplied we render
 * as a button instead (useful for picker dialogs).
 */
import Link from 'next/link';
import {
  playbookStatusChip,
  playbookTriggerKindChip,
  type PlaybookListRow,
} from './playbooks-shared';

interface OwnerLookup {
  [userId: number]: { name: string | null; email: string };
}

interface Props {
  playbook: PlaybookListRow;
  ownerLookup?: OwnerLookup;
  onClick?: () => void;
  href?: string;
}

export default function PlaybookCard({ playbook, ownerLookup, onClick, href }: Props) {
  const status = playbookStatusChip(playbook.status);
  const trigger = playbookTriggerKindChip(playbook.triggerKind);
  const owner = playbook.ownerId !== null ? ownerLookup?.[playbook.ownerId] : null;
  const ownerName =
    owner?.name ||
    owner?.email ||
    (playbook.ownerId !== null ? `User #${playbook.ownerId}` : null);
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
              {playbook.name}
            </h3>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${status.className}`}
            >
              <span className="material-icons text-[14px]">{status.icon}</span>
              {status.label}
            </span>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${trigger.className}`}
              title={`Trigger: ${trigger.label}`}
            >
              <span className="material-icons text-[14px]">{trigger.icon}</span>
              {trigger.label}
            </span>
            {playbook.category && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted/60 text-muted-foreground">
                {playbook.category}
              </span>
            )}
          </div>
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

        <span className="inline-flex items-center gap-1">
          <span className="material-icons text-base">format_list_numbered</span>
          {playbook.stepCount === 0
            ? 'no steps'
            : `${playbook.stepCount} step${playbook.stepCount === 1 ? '' : 's'}`}
        </span>

        {playbook.activeRunCount > 0 && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 font-medium">
            <span className="material-icons text-[14px]">playlist_play</span>
            {playbook.activeRunCount} active run{playbook.activeRunCount === 1 ? '' : 's'}
          </span>
        )}
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
    <Link href={href ?? `/portal/brain/playbooks/${playbook.id}`} className={baseClassName}>
      {inner}
    </Link>
  );
}
