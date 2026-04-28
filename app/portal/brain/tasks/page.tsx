'use client';

import Link from 'next/link';
import { useEffect, useState, useCallback, useMemo } from 'react';

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

type Filter = 'open' | 'in_progress' | 'blocked' | 'done' | 'all';

const FILTER_LABELS: Record<Filter, string> = {
  open: 'Open',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
  all: 'All',
};

const PRIORITY_TONE: Record<BrainTaskRow['priority'], string> = {
  low: 'text-muted-foreground',
  medium: 'text-foreground',
  high: 'text-amber-600 dark:text-amber-400',
  urgent: 'text-red-600 dark:text-red-400',
};

export default function BrainTasksPage() {
  const [tasks, setTasks] = useState<BrainTaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('open');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [promoteTask, setPromoteTask] = useState<BrainTaskRow | null>(null);

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

  const filtered = useMemo(() => {
    if (filter === 'all') return tasks;
    return tasks.filter((t) => t.status === filter);
  }, [tasks, filter]);

  const counts = useMemo(() => ({
    open: tasks.filter((t) => t.status === 'open').length,
    in_progress: tasks.filter((t) => t.status === 'in_progress').length,
    blocked: tasks.filter((t) => t.status === 'blocked').length,
    done: tasks.filter((t) => t.status === 'done').length,
    all: tasks.length,
  }), [tasks]);

  const setStatus = async (taskId: number, status: TaskStatus) => {
    setBusyId(taskId);
    try {
      const r = await fetch(`/api/portal/brain/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const json = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'Failed to update task.');
      }
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-8 space-y-6">
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

      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {(Object.keys(FILTER_LABELS) as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              filter === f
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {FILTER_LABELS[f]}
            <span className="text-xs text-muted-foreground">({counts[f]})</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <span className="material-icons animate-spin mr-2">progress_activity</span>
          Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 bg-card border border-border rounded-lg">
          <span className="material-icons text-4xl text-muted-foreground mb-2 block">checklist</span>
          <p className="text-sm text-muted-foreground">
            No {filter === 'all' ? '' : `${FILTER_LABELS[filter].toLowerCase()} `}tasks.
          </p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg divide-y divide-border">
          {filtered.map((t) => (
            <div key={t.id} className="p-4 flex items-start gap-3">
              <button
                onClick={() => setStatus(t.id, t.status === 'done' ? 'open' : 'done')}
                disabled={busyId === t.id}
                className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                  t.status === 'done'
                    ? 'bg-primary border-primary text-primary-foreground'
                    : 'border-border hover:border-primary'
                }`}
                aria-label={t.status === 'done' ? 'Mark as open' : 'Mark as done'}
              >
                {t.status === 'done' && <span className="material-icons text-xs">check</span>}
              </button>
              <div className="flex-1 min-w-0">
                <div className={`text-sm ${t.status === 'done' ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                  {t.title}
                  {t.complianceFlag && (
                    <span className="ml-2 inline-flex items-center gap-0.5 text-xs text-red-600 dark:text-red-400">
                      <span className="material-icons text-sm">warning</span>
                      compliance
                    </span>
                  )}
                </div>
                {t.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{t.description}</p>
                )}
                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                  <span className={PRIORITY_TONE[t.priority]}>{t.priority}</span>
                  {t.dueDate && (
                    <span className="inline-flex items-center gap-0.5">
                      <span className="material-icons text-sm">event</span>
                      {new Date(t.dueDate).toLocaleDateString()}
                    </span>
                  )}
                  {t.createdByAi && (
                    <span className="inline-flex items-center gap-0.5">
                      <span className="material-icons text-sm">auto_awesome</span>
                      AI
                    </span>
                  )}
                  {t.meetingId && (
                    <Link href={`/portal/brain/meetings/${t.meetingId}`} className="hover:underline inline-flex items-center gap-0.5">
                      <span className="material-icons text-sm">forum</span>
                      from meeting
                    </Link>
                  )}
                  {t.linkedKanbanCardId && (
                    <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                      <span className="material-icons text-sm">view_kanban</span>
                      on board
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {!t.linkedKanbanCardId && t.status !== 'done' && (
                  <button
                    onClick={() => setPromoteTask(t)}
                    disabled={busyId === t.id}
                    className="text-xs px-2 py-1 rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-50 inline-flex items-center gap-0.5"
                    title="Promote to project board"
                  >
                    <span className="material-icons text-sm">view_kanban</span>
                    Promote
                  </button>
                )}
                <select
                  value={t.status}
                  onChange={(e) => setStatus(t.id, e.target.value as TaskStatus)}
                  disabled={busyId === t.id}
                  className="text-xs px-2 py-1 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                >
                  <option value="open">Open</option>
                  <option value="in_progress">In progress</option>
                  <option value="blocked">Blocked</option>
                  <option value="done">Done</option>
                </select>
              </div>
            </div>
          ))}
        </div>
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
