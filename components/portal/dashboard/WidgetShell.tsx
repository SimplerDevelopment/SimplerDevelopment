'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import type { DraggableAttributes } from '@dnd-kit/core';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';

interface WidgetShellProps {
  id: string;
  title: string;
  icon: string;
  href: string;
  collapsed: boolean;
  onToggleCollapse: (id: string) => void;
  /** Drag handle attributes from useSortable */
  dragHandleAttributes?: DraggableAttributes;
  dragHandleListeners?: SyntheticListenerMap;
  children: ReactNode;
}

export default function WidgetShell({
  id,
  title,
  icon,
  href,
  collapsed,
  onToggleCollapse,
  dragHandleAttributes,
  dragHandleListeners,
  children,
}: WidgetShellProps) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        {/* Drag handle */}
        <button
          type="button"
          className="shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors touch-none"
          aria-label="Drag to reorder"
          {...dragHandleAttributes}
          {...dragHandleListeners}
        >
          <span className="material-icons text-base">drag_indicator</span>
        </button>

        {/* Icon + title link */}
        <span className="material-icons text-base text-muted-foreground shrink-0">{icon}</span>
        <Link
          href={href}
          className="flex-1 min-w-0 text-sm font-semibold text-foreground hover:text-primary transition-colors truncate"
        >
          {title}
        </Link>

        {/* Collapse chevron */}
        <button
          type="button"
          onClick={() => onToggleCollapse(id)}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          aria-label={collapsed ? 'Expand widget' : 'Collapse widget'}
        >
          <span className="material-icons text-base">
            {collapsed ? 'expand_more' : 'expand_less'}
          </span>
        </button>
      </div>

      {/* Body */}
      {!collapsed && <div className="p-5">{children}</div>}
    </div>
  );
}
