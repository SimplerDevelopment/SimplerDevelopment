'use client';

// ─── SortableSchemaField — drag wrapper for schema-editor field rows ────────
// Render-prop pattern: the parent passes the drag handle props down to
// whichever element should be the handle (so the rest of the row stays
// clickable for inputs, deletes, etc.).

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export function SortableSchemaField({
  id,
  children,
}: {
  id: string;
  children: (handleProps: Record<string, unknown>) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, setActivatorNodeRef } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  // Compose the handle props the child needs — `setActivatorNodeRef` so dnd
  // tracks the right node for accessibility, plus the listeners that start
  // the drag. Spread them onto the small drag-icon button.
  const handleProps: Record<string, unknown> = {
    ref: setActivatorNodeRef,
    ...attributes,
    ...listeners,
  };
  return (
    <div ref={setNodeRef} style={style}>
      {children(handleProps)}
    </div>
  );
}
