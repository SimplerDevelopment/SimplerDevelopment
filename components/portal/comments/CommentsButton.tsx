/**
 * CommentsButton — top-bar trigger that toggles the comment sidebar.
 *
 * Shows a badge count of open (unresolved) threads. Editor toolbars mount
 * this next to other "side panel" toggles. When the sidebar is open this
 * button still acts as a toggle (close button moves into the sidebar
 * header, so users have two affordances to close).
 *
 * The host owns the `useComments` data — this component only takes `open`
 * (sidebar visibility) + `openCount` (badge). That keeps it cheap to mount
 * even when the sidebar isn't loaded.
 */

'use client';

import { type JSX } from 'react';

export interface CommentsButtonProps {
  open: boolean;
  onToggle: () => void;
  /** Open (unresolved) thread count. Pass 0 to hide the badge. */
  openCount: number;
  /** Optional extra class names. */
  className?: string;
  /** Compact (icon-only) variant. Default false (icon + label). */
  compact?: boolean;
  label?: string;
}

export function CommentsButton(props: CommentsButtonProps): JSX.Element {
  const {
    open,
    onToggle,
    openCount,
    className = '',
    compact = false,
    label = 'Comments',
  } = props;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={open}
      aria-label={`${label} (${openCount} open)`}
      title={`${label} (${openCount} open)`}
      className={`relative inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
        open
          ? 'bg-blue-50 text-blue-700 hover:bg-blue-100'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
      } ${className}`}
    >
      <span className="material-icons" style={{ fontSize: '18px' }}>
        comment
      </span>
      {!compact ? <span>{label}</span> : null}
      {openCount > 0 ? (
        <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-semibold leading-none">
          {openCount > 99 ? '99+' : openCount}
        </span>
      ) : null}
    </button>
  );
}

export default CommentsButton;
