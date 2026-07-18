'use client';

// Pure presentational dnd-kit primitives for the Planning tab — no fetching.
// Ported from the pre-consolidation SprintPlanning.tsx (CardRowContent,
// DraggableCard, SortableSprintCard, SprintDropzone), retyped against the
// unified PlanningCard/PlanningSprint shapes.

import { useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { priorityColor } from '@/lib/portal-utils';
import type { PlanningCard, PlanningSprint } from './types';

export function CardRowContent({
  card,
  sprintOptions,
  currentSprintId,
  canEdit,
  onMove,
  showSprintBadge = false,
  dragging = false,
  dragHandleProps,
  leading,
  onOpen,
}: {
  card: PlanningCard;
  sprintOptions: PlanningSprint[];
  currentSprintId: number | null;
  canEdit: boolean;
  onMove: (cardId: number, sprintId: number | null) => Promise<void>;
  showSprintBadge?: boolean;
  dragging?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dragHandleProps?: { listeners?: any; attributes?: any };
  /** Optional extra content rendered before the priority badge — used by the
   * backlog panel to surface the card-type icon, key, and points badge. */
  leading?: React.ReactNode;
  /** When provided, the whole row becomes clickable and calls this with the
   * card id to open the card-detail modal (parity with the Board). */
  onOpen?: (cardId: number) => void;
}) {
  const [moving, setMoving] = useState(false);

  async function handleMove(value: string) {
    setMoving(true);
    await onMove(card.id, value === '' ? null : parseInt(value, 10));
    setMoving(false);
  }

  const currentSprint = sprintOptions.find(s => s.id === currentSprintId);

  return (
    <div
      onClick={onOpen ? () => onOpen(card.id) : undefined}
      className={`flex items-center justify-between gap-2 px-2 py-2 rounded-lg transition-colors ${onOpen ? 'cursor-pointer' : ''} ${dragging ? 'bg-card border border-border shadow-lg opacity-90' : 'hover:bg-accent/50'}`}
    >
      {canEdit && dragHandleProps && (
        <button
          {...dragHandleProps.attributes}
          {...dragHandleProps.listeners}
          onClick={e => e.stopPropagation()}
          className="shrink-0 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none"
          aria-label="Drag card"
        >
          <span className="material-icons text-sm">drag_indicator</span>
        </button>
      )}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {leading}
        {card.priority && (
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${priorityColor(card.priority)}`}>
            {card.priority}
          </span>
        )}
        <span className="text-sm text-foreground truncate">{card.title}</span>
        {card.columnName && (
          <span className="text-xs text-muted-foreground shrink-0">· {card.columnName}</span>
        )}
        {showSprintBadge && currentSprint && (
          <span className="text-xs text-primary bg-primary/10 rounded px-1.5 py-0.5 shrink-0">
            {currentSprint.name}
          </span>
        )}
      </div>
      {canEdit && (
        <select
          disabled={moving}
          value={currentSprintId ?? ''}
          onChange={e => handleMove(e.target.value)}
          onClick={e => e.stopPropagation()}
          className="text-xs border border-border rounded px-2 py-1 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary shrink-0 disabled:opacity-50"
        >
          <option value="">Backlog</option>
          {sprintOptions.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      )}
    </div>
  );
}

export function DraggableCard(props: {
  card: PlanningCard;
  sprintOptions: PlanningSprint[];
  currentSprintId: number | null;
  canEdit: boolean;
  onMove: (cardId: number, sprintId: number | null) => Promise<void>;
  showSprintBadge?: boolean;
  leading?: React.ReactNode;
  onOpen?: (cardId: number) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `card-${props.card.id}`,
    data: { card: props.card, from: 'dock' },
    disabled: !props.canEdit,
  });
  return (
    <div ref={setNodeRef} className={isDragging ? 'opacity-40' : ''}>
      <CardRowContent
        {...props}
        dragHandleProps={{ listeners, attributes }}
      />
    </div>
  );
}

export function SortableSprintCard(props: {
  card: PlanningCard;
  sprintOptions: PlanningSprint[];
  currentSprintId: number;
  canEdit: boolean;
  onMove: (cardId: number, sprintId: number | null) => Promise<void>;
  onOpen?: (cardId: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `sprint-card-${props.card.id}`,
    data: { card: props.card, from: 'sprint', sprintId: props.currentSprintId },
    disabled: !props.canEdit,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? 'opacity-40' : ''}
    >
      <CardRowContent
        card={props.card}
        sprintOptions={props.sprintOptions}
        currentSprintId={props.currentSprintId}
        canEdit={props.canEdit}
        onMove={props.onMove}
        onOpen={props.onOpen}
        dragHandleProps={{ listeners, attributes }}
      />
    </div>
  );
}

export function SprintDropzone({ sprintId, children, className = '' }: { sprintId: number | null; children: React.ReactNode; className?: string }) {
  const { setNodeRef, isOver } = useDroppable({
    id: sprintId === null ? 'drop-backlog' : `drop-sprint-${sprintId}`,
    data: { sprintId },
  });
  return (
    <div
      ref={setNodeRef}
      className={`${className} transition-colors ${isOver ? 'ring-2 ring-primary ring-offset-1 bg-primary/5 rounded-xl' : ''}`}
    >
      {children}
    </div>
  );
}
