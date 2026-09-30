'use client';

import Link from 'next/link';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pBtnGhost, pSelect } from '@/components/portal/portal-ui';
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
import { sortableKeyboardCoordinates, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import TaskCard from '@/components/brain/TaskCard';
import BrainTasksList from '@/components/brain/BrainTasksList';
import { useFeatureFlag } from '@/components/portal/FeatureFlagsProvider';
import ReviewTab from '@/components/brain/review/ReviewTab';

// ─── Tasks types ─────────────────────────────────────────────────────────────

type TaskStatus = 'open' | 'in_progress' | 'blocked' | 'done';

export interface BrainTaskRow {
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

// ─── Outer page (tab shell) ──────────────────────────────────────────────────

type Tab = 'tasks' | 'review';

export default function BrainTasksAndReviewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab: Tab = searchParams.get('tab') === 'review' ? 'review' : 'tasks';
  const [tab, setTabState] = useState<Tab>(initialTab);
  const [pendingReviewCount, setPendingReviewCount] = useState<number | null>(null);

  const setTab = useCallback((next: Tab) => {
    setTabState(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'tasks') params.delete('tab');
    else params.set('tab', next);
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : '?', { scroll: false });
  }, [router, searchParams]);

  // Always poll the pending-review count for the badge, regardless of which tab is open.
  useEffect(() => {
    let cancelled = false;
    const fetchCount = () => {
      fetch('/api/portal/brain/review?status=pending')
        .then((r) => r.json())
        .then((json) => { if (!cancelled && json.success) setPendingReviewCount(json.data.items.length); })
        .catch(() => {});
    };
    fetchCount();
    const t = setInterval(fetchCount, 60_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  return (
    <div className="space-y-6">
      <PortalPageHeader
        eyebrow="Company Brain"
        title={
          <span className="flex items-center gap-2">
            <span className="material-icons text-primary">{tab === 'review' ? 'reviews' : 'checklist'}</span>
            {tab === 'review' ? 'Review queue' : 'Brain Tasks'}
          </span>
        }
        subtitle={
          tab === 'review'
            ? 'Tasks, decisions, commitments, and CRM links extracted by AI from your communications. Approve to commit them, edit and approve, or reject.'
            : 'Tasks captured from communications and AI-generated suggestions, after human approval.'
        }
      />

      <div className="flex items-center gap-1 border-b border-border overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
        <button
          onClick={() => setTab('tasks')}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
            tab === 'tasks'
              ? 'border-foreground text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <span className="material-icons text-base">checklist</span>
          Tasks
        </button>
        <button
          onClick={() => setTab('review')}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
            tab === 'review'
              ? 'border-foreground text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <span className="material-icons text-base">reviews</span>
          Review queue
          {pendingReviewCount !== null && pendingReviewCount > 0 && (
            <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
              {pendingReviewCount > 99 ? '99+' : pendingReviewCount}
            </span>
          )}
        </button>
      </div>

      {tab === 'tasks' ? <TasksTab /> : <ReviewTab onPendingChange={setPendingReviewCount} />}
    </div>
  );
}

// ─── Tasks Tab ───────────────────────────────────────────────────────────────

function TasksTab() {
  const [tasks, setTasks] = useState<BrainTaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [promoteTask, setPromoteTask] = useState<BrainTaskRow | null>(null);
  const [activeTask, setActiveTask] = useState<BrainTaskRow | null>(null);
  const studio = useFeatureFlag('portal-redesign'); // PUX-161: a list, not a board

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
    void setStatus(task.id, task.status);
  }

  return (
    <>
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
        studio ? <BrainTasksList tasks={tasks} onSetStatus={setStatus} onPromote={setPromoteTask} onChanged={load} /> : (
        <DndContext id="brain-tasks"
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
        )
      )}

      {promoteTask && (
        <PromoteModal
          task={promoteTask}
          onClose={() => setPromoteTask(null)}
          onPromoted={() => { setPromoteTask(null); load(); }}
          onError={(msg) => setError(msg)}
        />
      )}
    </>
  );
}

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
          <h2 className="text-sm font-semibold text-foreground truncate">{label}</h2>
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
      <div className="bg-card border border-border rounded-2xl shadow-xl max-w-md w-full p-5 space-y-4">
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
          <div className="bg-muted/30 border border-border rounded-xl p-3 text-xs text-muted-foreground">
            No active projects to promote into. <Link href="/portal/projects" className="text-primary hover:underline">Create a project first</Link>.
          </div>
        ) : (
          <>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Project</label>
              <select
                value={projectId ?? ''}
                onChange={(e) => setProjectId(parseInt(e.target.value, 10))}
                className={pSelect}
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
                  className={pSelect}
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
            className={pBtnGhost}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting || !projectId || !targets || targets.length === 0}
            className={pBtnPrimary}
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

