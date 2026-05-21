'use client';

/**
 * Compact card representing a brain person — used by the list page and any
 * other surface that needs a stable, clickable summary tile.
 */

import Link from 'next/link';
import type { BrainPersonStatus } from '@/lib/db/schema/brain';

export interface PersonCardData {
  id: number;
  fullName: string;
  email?: string | null;
  title?: string | null;
  status: BrainPersonStatus;
  managerId?: number | null;
  primaryOrgUnit?: { id: number; name: string } | null;
}

interface PersonCardProps {
  person: PersonCardData;
  /** Optional click override. Defaults to navigating to /portal/brain/people/<id>. */
  onClick?: (person: PersonCardData) => void;
}

const STATUS_TONE: Record<BrainPersonStatus, string> = {
  active:   'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  inactive: 'bg-muted text-muted-foreground',
  departed: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
};

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || '?';
}

export function PersonCard({ person, onClick }: PersonCardProps) {
  const inner = (
    <div className="flex items-start gap-3 p-3 border border-border rounded-lg bg-card hover:border-primary/40 hover:bg-accent/30 transition-colors">
      <div className="shrink-0 w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold">
        {initialsOf(person.fullName)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-foreground truncate">{person.fullName}</span>
          <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${STATUS_TONE[person.status]}`}>
            {person.status}
          </span>
        </div>
        {person.title && (
          <div className="text-xs text-muted-foreground truncate mt-0.5">{person.title}</div>
        )}
        <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground flex-wrap">
          {person.primaryOrgUnit && (
            <span className="inline-flex items-center gap-1">
              <span className="material-icons text-[13px]">account_tree</span>
              {person.primaryOrgUnit.name}
            </span>
          )}
          {person.managerId !== null && person.managerId !== undefined && (
            <span className="inline-flex items-center gap-1">
              <span className="material-icons text-[13px]">supervisor_account</span>
              Reports up
            </span>
          )}
          {person.email && (
            <span className="inline-flex items-center gap-1 truncate">
              <span className="material-icons text-[13px]">mail</span>
              <span className="truncate">{person.email}</span>
            </span>
          )}
        </div>
      </div>
      <span className="material-icons text-muted-foreground text-base self-center">chevron_right</span>
    </div>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={() => onClick(person)}
        className="w-full text-left"
      >
        {inner}
      </button>
    );
  }
  return (
    <Link href={`/portal/brain/people/${person.id}`} className="block">
      {inner}
    </Link>
  );
}

export default PersonCard;
