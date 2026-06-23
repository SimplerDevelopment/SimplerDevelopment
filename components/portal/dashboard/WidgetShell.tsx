'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import type { DraggableAttributes } from '@dnd-kit/core';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';

interface WidgetShellProps {
  id: string;
  title: string;
  /** Optional mono count/sub-label shown next to the title (e.g. "12 open") */
  subLabel?: string;
  icon: string;
  href: string;
  collapsed: boolean;
  onToggleCollapse: (id: string) => void;
  /** When true: dashed border, always-visible grip, red remove button, hidden collapse btn */
  isCustomizing?: boolean;
  /** Callback for the red remove button shown in customize mode */
  onRemove?: (id: string) => void;
  /** Drag handle attributes from useSortable */
  dragHandleAttributes?: DraggableAttributes;
  dragHandleListeners?: SyntheticListenerMap;
  children: ReactNode;
}

export default function WidgetShell({
  id,
  title,
  subLabel,
  icon,
  href,
  collapsed,
  onToggleCollapse,
  isCustomizing = false,
  onRemove,
  dragHandleAttributes,
  dragHandleListeners,
  children,
}: WidgetShellProps) {
  return (
    <div
      className={[
        'bg-card border rounded-xl overflow-hidden flex flex-col',
        isCustomizing
          ? 'border-dashed border-[var(--portal-border-strong)] cursor-grab'
          : 'border-border',
      ].join(' ')}
    >
      {/* Header */}
      <div
        className={[
          'group flex items-center gap-2 px-3 py-2.5 border-b',
          collapsed ? 'border-b-0' : 'border-border',
        ].join(' ')}
      >
        {/* Drag grip — hidden until hover, or always shown in customize mode */}
        <button
          type="button"
          className={[
            'shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground transition-opacity touch-none',
            'w-6 h-6 flex items-center justify-center rounded',
            isCustomizing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          ].join(' ')}
          aria-label="Drag to reorder"
          {...dragHandleAttributes}
          {...dragHandleListeners}
        >
          <span className="material-icons text-[17px] leading-none">drag_indicator</span>
        </button>

        {/* Widget icon (small, muted) */}
        <span className="material-icons text-[15px] leading-none text-muted-foreground shrink-0">{icon}</span>

        {/* Title link + optional mono sub-count */}
        <h3 className="flex items-center gap-1.5 flex-1 min-w-0">
          <Link
            href={href}
            className="text-[13px] font-semibold text-foreground hover:text-primary transition-colors truncate"
          >
            {title}
          </Link>
          {subLabel && (
            <span className="text-[11px] text-muted-foreground font-mono font-normal shrink-0">
              {subLabel}
            </span>
          )}
        </h3>

        {/* Tool buttons */}
        <div className="flex items-center gap-0.5 ml-auto">
          {/* Collapse toggle — hidden in customize mode */}
          {!isCustomizing && (
            <button
              type="button"
              onClick={() => onToggleCollapse(id)}
              className="w-[26px] h-[26px] rounded flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              aria-label={collapsed ? 'Expand widget' : 'Collapse widget'}
            >
              <span className="material-icons text-[17px] leading-none">
                {collapsed ? 'expand_more' : 'expand_less'}
              </span>
            </button>
          )}

          {/* Remove button — only visible in customize mode */}
          {isCustomizing && onRemove && (
            <button
              type="button"
              onClick={() => onRemove(id)}
              className="w-[26px] h-[26px] rounded flex items-center justify-center text-[var(--portal-bad)] hover:bg-[var(--portal-bad-bg)] transition-colors"
              aria-label={`Remove ${title} widget`}
            >
              <span className="material-icons text-[17px] leading-none">close</span>
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      {!collapsed && <div className="flex-1">{children}</div>}
    </div>
  );
}
