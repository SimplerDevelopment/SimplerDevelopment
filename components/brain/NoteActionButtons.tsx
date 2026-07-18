'use client';

/**
 * Header action row for a brain note: pin toggle, optional zen-mode link,
 * and delete. Rendered inline in both the IDE editor pane and the zen-mode
 * detail page so both expose the same actions.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { BrainNote } from '@/lib/brain/types';

interface Props {
  note: BrainNote;
  onPatch: (patch: Partial<BrainNote>) => void;
  onDelete: () => void;
  /** When true (default), shows the "open in zen mode" deep-link icon. The zen page itself hides it. */
  showZenLink?: boolean;
}

export default function NoteActionButtons({
  note,
  onPatch,
  onDelete,
  showZenLink = true,
}: Props): ReactNode {
  return (
    <>
      <button
        type="button"
        onClick={() => onPatch({ pinned: !note.pinned })}
        title={note.pinned ? 'Unpin' : 'Pin'}
        className={`h-8 w-8 inline-flex items-center justify-center rounded-md border border-border transition-colors ${
          note.pinned
            ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
            : 'text-muted-foreground hover:bg-accent'
        }`}
      >
        <span className="material-icons text-base">push_pin</span>
      </button>
      {showZenLink && (
        <Link
          href={`/portal/brain/knowledge/${note.id}`}
          title="Zen mode (focused single-pane view)"
          className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent"
        >
          <span className="material-icons text-base">open_in_full</span>
        </Link>
      )}
      <button
        type="button"
        onClick={onDelete}
        title="Delete note"
        className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        <span className="material-icons text-base">delete</span>
      </button>
    </>
  );
}
