'use client';

import Link from 'next/link';
import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  pointerWithin,
  useDroppable,
  CollisionDetection,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates, SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { priorityColor, stripMarkdown } from '@/lib/portal-utils';

type TaskStatus = 'open' | 'in_progress' | 'blocked' | 'done';

interface BrainTaskRow {
  id: number;
  title: string;
  description: string | null;
  ownerId: number | null;
  status: TaskStatus;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dueDate: string | null;
  source: string;
  createdByAi: boolean;
  meetingId: number | null;
  linkedKanbanCardId: number | null;
  complianceFlag: boolean;
  createdAt: string;
}

interface PromotionTarget {
  id: number;
  name: string;
  projectKey: string | null;
  status: string;
  columns: { id: number; name: string; isDone: boolean }[];
}

const STATUS_COLUMNS: { key: TaskStatus; label: string; color: string }[] = [
  { key: 'open',        label: 'Open',         color: '#94a3b8' },
  { key: 'in_progress', label: 'In Progress',  color: '#3b82f6' },
  { key: 'blocked',     label: 'Blocked',      color: '#ef4444' },
  { key: 'done',        label: 'Done',         color: '#10b981' },
];

export default function BrainTasksPage() {
  const [tasks, setTasks] = useState<BrainTaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [promoteTask, setPromoteTask] = useState<BrainTaskRow | null>(null);
  const [activeTask, setActiveTask] = useState<BrainTaskRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/portal/brain/tasks');
      const json = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'Failed to load tasks.');
      } else {
        setTasks(json.data);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const tasksByStatus = useMemo(() => {
    const map: Record<TaskStatus, BrainTaskRow[]> = { open: [], in_progress: [], blocked: [], done: [] };
    for (const t of tasks) map[t.status].push(t);
    return map;
  }, [tasks]);

  const setStatus = async (taskId: number, status: TaskStatus) => {
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status } : t));
    try {
      const r = await fetch(`/api/portal/brain/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const json = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'Failed to update task.');
        await load();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      await load();
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const collisionDetection: CollisionDetection = (args) => {
    const pointer = pointerWithin(args);
    const overCol = pointer.find(c => String(c.id).startsWith('col-'));
    if (overCol) {
      const colId = String(overCol.id).replace('col-', '') as TaskStatus;
      const cardCollisions = closestCorners({
        ...args,
        droppableContainers: args.droppableContainers.filter(c => {
          const id = String(c.id);
          if (!id.startsWith('card-')) return false;
          const cardId = parseInt(id.replace('card-', ''), 10);
          return tasksByStatus[colId]?.some(t => t.id === cardId) ?? false;
        }),
      });
      if (cardCollisions.length > 0) return [cardCollisions[0]];
      return [overCol];
    }
    const corners = closestCorners(args);
    const firstCard = corners.find(c => String(c.id).startsWith('card-'));
    if (firstCard) return [firstCard];
    return corners;
  };

  function onDragStart(event: DragStartEvent) {
    const data = event.active.data.current;
    if (data?.type === 'task') setActiveTask(data.task);
  }

  function onDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId || !activeId.startsWith('card-')) return;

    const taskId = parseInt(activeId.replace('card-', ''), 10);
    const current = tasks.find(t => t.id === taskId);
    if (!current) return;

    let targetStatus: TaskStatus | null = null;
    if (overId.startsWith('col-')) {
      targetStatus = overId.replace('col-', '') as TaskStatus;
    } else if (overId.startsWith('card-')) {
      const overTaskId = parseInt(overId.replace('card-', ''), 10);
      const overTask = tasks.find(t => t.id === overTaskId);
      if (overTask) targetStatus = overTask.status;
    }

    if (targetStatus && current.status !== targetStatus) {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: targetStatus! } : t));
    }
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveTask(null);
    if (!over) return;
    const activeId = String(active.id);
    if (!activeId.startsWith('card-')) return;
    const taskId = parseInt(activeId.replace('card-', ''), 10);
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    // Persist the optimistic move that onDragOver applied
    void setStatus(task.id, task.status);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <span className="material-icons text-primary">checklist</span>
            Brain Tasks
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tasks captured from meetings and AI-generated suggestions, after human approval.
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <span className="material-icons animate-spin mr-2">progress_activity</span>
          Loading…
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
        >
          <div className="flex gap-4 overflow-x-auto pb-4">
            {STATUS_COLUMNS.map(col => (
              <TaskColumn
                key={col.key}
                statusKey={col.key}
                label={col.label}
                color={col.color}
                tasks={tasksByStatus[col.key]}
                onPromote={setPromoteTask}
              />
            ))}
          </div>

          <DragOverlay>
            {activeTask && <TaskCard task={activeTask} onPromote={() => {}} dragging />}
          </DragOverlay>
        </DndContext>
      )}

      {promoteTask && (
        <PromoteModal
          task={promoteTask}
          onClose={() => setPromoteTask(null)}
          onPromoted={() => { setPromoteTask(null); load(); }}
          onError={(msg) => setError(msg)}
        />
      )}
    </div>
  );
}

// ─── Column ──────────────────────────────────────────────────────────────────

function TaskColumn({
  statusKey,
  label,
  color,
  tasks,
  onPromote,
}: {
  statusKey: TaskStatus;
  label: string;
  color: string;
  tasks: BrainTaskRow[];
  onPromote: (task: BrainTaskRow) => void;
}) {
  const cardIds = tasks.map(t => `card-${t.id}`);
  const { setNodeRef, isOver } = useDroppable({ id: `col-${statusKey}` });

  return (
    <div className="flex-shrink-0 w-72 flex flex-col bg-muted/40 rounded-xl border border-border">
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <h3 className="text-sm font-semibold text-foreground truncate">{label}</h3>
          <span className="text-xs rounded-full px-1.5 py-0.5 shrink-0 font-medium bg-muted text-muted-foreground">
            {tasks.length}
          </span>
        </div>
      </div>

      <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={`p-2 space-y-2 flex-1 min-h-[120px] transition-colors ${
            isOver ? 'bg-primary/5 ring-2 ring-primary/20 ring-inset rounded-b-xl' : ''
          }`}
        >
          {tasks.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-6">
              No tasks
            </div>
          ) : (
            tasks.map(t => <TaskCard key={t.id} task={t} onPromote={onPromote} />)
          )}
        </div>
      </SortableContext>
    </div>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────

function TaskCard({
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
      className="bg-card border border-border rounded-lg p-3 shadow-sm cursor-grab active:cursor-grabbing hover:border-primary/50 hover:shadow-md transition-all"
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
            href={`/portal/brain/meetings/${task.meetingId}`}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className="text-xs text-muted-foreground hover:text-foreground hover:underline flex items-center gap-0.5"
          >
            <span className="material-icons text-xs">forum</span>
            meeting
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
            className="text-xs px-2 py-1 rounded-md border border-border text-foreground hover:bg-accent inline-flex items-center gap-1"
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

// ─── Promote Modal (unchanged) ───────────────────────────────────────────────

function PromoteModal({
  task,
  onClose,
  onPromoted,
  onError,
}: {
  task: BrainTaskRow;
  onClose: () => void;
  onPromoted: () => void;
  onError: (msg: string) => void;
}) {
  const [targets, setTargets] = useState<PromotionTarget[] | null>(null);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [columnId, setColumnId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/portal/brain/promotion-targets')
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setTargets(json.data);
          if (json.data.length > 0) {
            const firstActive = json.data.find((p: PromotionTarget) => p.status === 'active') ?? json.data[0];
            setProjectId(firstActive.id);
            const firstCol = firstActive.columns.find((c: PromotionTarget['columns'][number]) => !c.isDone) ?? firstActive.columns[0];
            if (firstCol) setColumnId(firstCol.id);
          }
        } else {
          setLocalError(json.message || 'Failed to load projects.');
        }
      })
      .catch((err) => setLocalError(err instanceof Error ? err.message : 'Network error'));
  }, []);

  useEffect(() => {
    if (!projectId || !targets) return;
    const proj = targets.find((p) => p.id === projectId);
    if (!proj) return;
    if (!proj.columns.find((c) => c.id === columnId)) {
      const first = proj.columns.find((c) => !c.isDone) ?? proj.columns[0];
      setColumnId(first?.id ?? null);
    }
  }, [projectId, targets, columnId]);

  const submit = async () => {
    if (!projectId) return;
    setSubmitting(true);
    setLocalError(null);
    try {
      const r = await fetch(`/api/portal/brain/tasks/${task.id}/promote-to-kanban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, columnId: columnId ?? undefined }),
      });
      const json = await r.json();
      if (!r.ok || !json.success) {
        setLocalError(json.message || 'Failed to promote.');
        onError(json.message || 'Failed to promote.');
        return;
      }
      onPromoted();
    } finally {
      setSubmitting(false);
    }
  };

  const project = targets?.find((p) => p.id === projectId);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-lg shadow-xl max-w-md w-full p-5 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">Promote to project board</h3>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{task.title}</p>
        </div>

        {localError && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-md p-2 text-xs text-destructive">
            {localError}
          </div>
        )}

        {!targets ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
            <span className="material-icons animate-spin mr-2 text-base">progress_activity</span>
            Loading projects…
          </div>
        ) : targets.length === 0 ? (
          <div className="bg-muted/30 border border-border rounded-md p-3 text-xs text-muted-foreground">
            No active projects to promote into. <Link href="/portal/projects" className="text-primary hover:underline">Create a project first</Link>.
          </div>
        ) : (
          <>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Project</label>
              <select
                value={projectId ?? ''}
                onChange={(e) => setProjectId(parseInt(e.target.value, 10))}
                className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {targets.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}{p.projectKey ? ` [${p.projectKey}]` : ''}</option>
                ))}
              </select>
            </div>
            {project && project.columns.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Column</label>
                <select
                  value={columnId ?? ''}
                  onChange={(e) => setColumnId(parseInt(e.target.value, 10))}
                  className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {project.columns.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.isDone ? ' (done)' : ''}</option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-1.5 text-sm rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting || !projectId || !targets || targets.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting
              ? <><span className="material-icons animate-spin text-base">progress_activity</span>Promoting…</>
              : <><span className="material-icons text-base">view_kanban</span>Promote</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
