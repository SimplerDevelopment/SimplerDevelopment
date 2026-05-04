/** Droppable zone for path-group reordering in the slide list. */
'use client';

import { useDroppable } from '@dnd-kit/core';
import type { ReactNode } from 'react';

export function PathGroupDropZone({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`border-t border-border transition-colors ${isOver ? 'bg-blue-500/10 ring-1 ring-blue-500/30 ring-inset' : ''}`}
      data-droppable={label}
    >
      {children}
    </div>
  );
}
