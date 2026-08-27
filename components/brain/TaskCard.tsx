'use client';
// TaskCard — moved verbatim out of app/portal/brain/tasks/page.tsx (PUX-161):
// that page is pinned at its file-size cap, and this card is props-only.

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Link from 'next/link';
import { priorityColor, stripMarkdown } from '@/lib/portal-utils';
import { pBtnGhost } from '@/components/portal/portal-ui';
import type { BrainTaskRow } from '@/app/portal/brain/tasks/page';

export default function TaskCard({
  task,
  onPromote,
  dragging,
}: {
  task: BrainTaskRow;
  onPromote: (task: BrainTaskRow) => void;
  dragging?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `card-${task.id}`,
    data: { type: 'task', task },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging && !dragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="bg-card border border-border rounded-2xl p-3 shadow-sm cursor-grab active:cursor-grabbing hover:border-primary/50 hover:shadow-md transition-all"
    >
      <div className="flex items-start gap-2">
        <p className="text-sm font-medium text-foreground flex-1">
          {task.title}
          {task.complianceFlag && (
            <span className="ml-2 inline-flex items-center gap-0.5 text-xs text-red-600 dark:text-red-400 align-middle">
              <span className="material-icons text-sm">warning</span>
              compliance
            </span>
          )}
        </p>
      </div>

      {task.description && (
        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{stripMarkdown(task.description)}</p>
      )}

      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${priorityColor(task.priority)}`}>
          {task.priority}
        </span>
        {task.dueDate && (
          <span className="text-xs text-muted-foreground flex items-center gap-0.5">
            <span className="material-icons text-xs">event</span>
            {new Date(task.dueDate).toLocaleDateString()}
          </span>
        )}
        {task.createdByAi && (
          <span className="text-xs text-muted-foreground flex items-center gap-0.5">
            <span className="material-icons text-xs">auto_awesome</span>
            AI
          </span>
        )}
        {task.meetingId && (
          <Link
            href={`/portal/brain/communications/${task.meetingId}`}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className="text-xs text-muted-foreground hover:text-foreground hover:underline flex items-center gap-0.5"
          >
            <span className="material-icons text-xs">forum</span>
            communication
          </Link>
        )}
        {task.linkedKanbanCardId && (
          <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
            <span className="material-icons text-xs">view_kanban</span>
            on board
          </span>
        )}
      </div>

      {!task.linkedKanbanCardId && task.status !== 'done' && (
        <div className="mt-2 pt-2 border-t border-border/50">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onPromote(task); }}
            onPointerDown={(e) => e.stopPropagation()}
            className={`${pBtnGhost} !py-1 !px-2 !text-xs`}
            title="Promote to project board"
          >
            <span className="material-icons text-sm">view_kanban</span>
            Promote
          </button>
        </div>
      )}
    </div>
  );
}
