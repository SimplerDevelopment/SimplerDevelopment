'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { priorityColor } from '@/lib/portal-utils';

type MyTaskCardSource = 'kanban' | 'brain';
type MyTaskSourceFilter = 'all' | 'kanban' | 'brain';
type MyTaskPriority = 'low' | 'medium' | 'high' | 'urgent';

const VALID_PRIORITIES: MyTaskPriority[] = ['low', 'medium', 'high', 'urgent'];

interface MyTaskCard {
  id: number;
  source: MyTaskCardSource;
  key: string | null;
  title: string;
  priority: string | null;
  dueDate: string | null;
  columnName: string | null;
  columnIsDone: boolean;
  labels: { id: number; name: string; color: string }[];
  checklist: { total: number; done: number } | null;
  linkUrl: string;
  doneColumnId: number | null;
}
interface MyTaskProject {
  id: number | string;
  source: MyTaskCardSource;
  name: string;
  projectKey: string | null;
  clientName: string | null;
  cards: MyTaskCard[];
}
interface ProjectOption {
  id: number;
  name: string;
  projectKey: string | null;
}

interface MyTasksResponse {
  success: boolean;
  data: {
    projects: MyTaskProject[];
    nextCursor: number | null;
    total: number;
    projectsAvailable: ProjectOption[];
  };
}

function formatDue(iso: string | null): { label: string; tone: 'overdue' | 'soon' | 'later' | 'none' } {
  if (!iso) return { label: '—', tone: 'none' };
  const d = new Date(iso);
  const now = new Date();
  const deltaDays = Math.floor((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: deltaDays > 180 ? 'numeric' : undefined });
  if (deltaDays < 0) return { label, tone: 'overdue' };
  if (deltaDays < 7) return { label, tone: 'soon' };
  return { label, tone: 'later' };
}

function sourceIcon(source: MyTaskCardSource): string {
  return source === 'brain' ? 'psychology' : 'view_kanban';
}

interface UrlFilters {
  source: MyTaskSourceFilter;
  projectIds: number[];
  priorities: MyTaskPriority[];
  overdue: boolean;
  openOnly: boolean;
}

function parseFilters(params: URLSearchParams): UrlFilters {
  const splitNums = (raw: string | null) =>
    (raw ? raw.split(',').map((s) => parseInt(s, 10)).filter((n) => Number.isInteger(n) && n > 0) : []);
  const splitStr = <T extends string>(raw: string | null, allowed: readonly T[]) =>
    (raw ? raw.split(',').map((s) => s.trim().toLowerCase()).filter((s): s is T => (allowed as readonly string[]).includes(s)) : []);

  const sourceRaw = (params.get('source') ?? 'all').toLowerCase();
  const source: MyTaskSourceFilter = sourceRaw === 'kanban' || sourceRaw === 'brain' ? sourceRaw : 'all';
  const overdueRaw = params.get('overdue');
  const openOnlyRaw = params.get('openOnly');
  return {
    source,
    projectIds: splitNums(params.get('projectIds')),
    priorities: splitStr<MyTaskPriority>(params.get('priorities'), VALID_PRIORITIES),
    overdue: overdueRaw === '1' || overdueRaw === 'true',
    openOnly: openOnlyRaw === null ? true : openOnlyRaw !== '0',
  };
}

function buildQuery(filters: UrlFilters, extra: { limit?: number; cursor?: number } = {}): string {
  const sp = new URLSearchParams();
  if (filters.source !== 'all') sp.set('source', filters.source);
  if (filters.projectIds.length > 0) sp.set('projectIds', filters.projectIds.join(','));
  if (filters.priorities.length > 0) sp.set('priorities', filters.priorities.join(','));
  if (filters.overdue) sp.set('overdue', '1');
  if (!filters.openOnly) sp.set('openOnly', '0');
  if (extra.limit) sp.set('limit', String(extra.limit));
  if (extra.cursor) sp.set('cursor', String(extra.cursor));
  return sp.toString();
}

const PAGE_LIMIT = 50;

export default function MyTasksPage() {
  return (
    <Suspense fallback={
      <div className="max-w-5xl mx-auto flex items-center justify-center py-16">
        <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
      </div>
    }>
      <MyTasksPageInner />
    </Suspense>
  );
}

function MyTasksPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useMemo(() => parseFilters(new URLSearchParams(searchParams.toString())), [searchParams]);

  const [projects, setProjects] = useState<MyTaskProject[] | null>(null);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [projectsAvailable, setProjectsAvailable] = useState<ProjectOption[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [completing, setCompleting] = useState<Set<string>>(new Set());

  const updateUrl = useCallback((next: UrlFilters) => {
    const qs = buildQuery(next);
    router.replace(qs ? `/portal/my-tasks?${qs}` : '/portal/my-tasks', { scroll: false });
  }, [router]);

  // Initial / filter-change fetch
  useEffect(() => {
    let cancelled = false;
    setProjects(null);
    const qs = buildQuery(filters, { limit: PAGE_LIMIT });
    fetch(`/api/portal/my-tasks${qs ? `?${qs}` : ''}`)
      .then((r) => r.json())
      .then((d: MyTasksResponse) => {
        if (cancelled || !d.success) return;
        setProjects(d.data.projects);
        setNextCursor(d.data.nextCursor);
        setTotal(d.data.total);
        setProjectsAvailable(d.data.projectsAvailable ?? []);
      })
      .catch(() => { if (!cancelled) setProjects([]); });
    return () => { cancelled = true; };
  }, [filters]);

  const loadMore = useCallback(async () => {
    if (nextCursor == null || loadingMore) return;
    setLoadingMore(true);
    try {
      const qs = buildQuery(filters, { limit: PAGE_LIMIT, cursor: nextCursor });
      const r = await fetch(`/api/portal/my-tasks?${qs}`);
      const d = await r.json() as MyTasksResponse;
      if (!d.success) return;
      setProjects((prev) => {
        const merged = [...(prev ?? [])];
        for (const incoming of d.data.projects) {
          // Merge by group identity so a single group split across pages stays one group.
          const idx = merged.findIndex((g) => g.source === incoming.source && g.id === incoming.id);
          if (idx >= 0) {
            merged[idx] = { ...merged[idx], cards: [...merged[idx].cards, ...incoming.cards] };
          } else {
            merged.push(incoming);
          }
        }
        return merged;
      });
      setNextCursor(d.data.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }, [filters, nextCursor, loadingMore]);

  const completeCard = useCallback(async (card: MyTaskCard) => {
    const key = `${card.source}-${card.id}`;
    if (completing.has(key) || card.columnIsDone) return;
    if (card.source === 'kanban' && card.doneColumnId == null) {
      // No "done" column flagged on this project — best-effort skip; the row
      // link still routes to the kanban board where the user can complete it.
      return;
    }
    setCompleting((prev) => { const n = new Set(prev); n.add(key); return n; });

    // Optimistic flip
    const snapshot = projects;
    setProjects((prev) => prev?.map((g) => ({
      ...g,
      cards: g.cards.map((c) =>
        c.source === card.source && c.id === card.id
          ? { ...c, columnIsDone: true, columnName: card.source === 'brain' ? 'Done' : c.columnName }
          : c,
      ),
    })) ?? prev);

    try {
      const url = card.source === 'brain'
        ? `/api/portal/brain/tasks/${card.id}`
        : `/api/portal/cards/${card.id}/move`;
      const method = card.source === 'brain' ? 'PUT' : 'PATCH';
      const body = card.source === 'brain'
        ? { status: 'done' }
        : { columnId: card.doneColumnId, order: 0 };
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setProjects(snapshot);
      } else if (filters.openOnly) {
        // Successfully completed; if the page is hiding completed, drop it locally.
        setProjects((prev) => prev?.map((g) => ({
          ...g,
          cards: g.cards.filter((c) => !(c.source === card.source && c.id === card.id)),
        })).filter((g) => g.cards.length > 0) ?? prev);
        setTotal((t) => Math.max(0, t - 1));
      }
    } catch {
      setProjects(snapshot);
    } finally {
      setCompleting((prev) => { const n = new Set(prev); n.delete(key); return n; });
    }
  }, [completing, projects, filters.openOnly]);

  const loading = projects === null;
  const groups = projects ?? [];

  const overdueCount = groups.reduce(
    (s, p) => s + p.cards.filter((c) => !c.columnIsDone && c.dueDate && new Date(c.dueDate) < new Date()).length,
    0,
  );

  // Filter mutators — all flow through updateUrl so state lives in the URL.
  const setSource = (s: MyTaskSourceFilter) => updateUrl({ ...filters, source: s, projectIds: s === 'brain' ? [] : filters.projectIds });
  const togglePriority = (p: MyTaskPriority) => {
    const next = filters.priorities.includes(p)
      ? filters.priorities.filter((x) => x !== p)
      : [...filters.priorities, p];
    updateUrl({ ...filters, priorities: next });
  };
  const toggleProject = (id: number) => {
    const next = filters.projectIds.includes(id)
      ? filters.projectIds.filter((x) => x !== id)
      : [...filters.projectIds, id];
    updateUrl({ ...filters, projectIds: next });
  };
  const toggleOverdue = () => updateUrl({ ...filters, overdue: !filters.overdue });
  const toggleOpenOnly = () => updateUrl({ ...filters, openOnly: !filters.openOnly });

  const hasActiveFilters =
    filters.source !== 'all'
    || filters.projectIds.length > 0
    || filters.priorities.length > 0
    || filters.overdue;
  const clearFilters = () => updateUrl({ source: 'all', projectIds: [], priorities: [], overdue: false, openOnly: filters.openOnly });

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Tasks</h1>
          <p className="text-muted-foreground mt-1">
            {total} task{total !== 1 ? 's' : ''} assigned to you
            {overdueCount > 0 && <span className="text-destructive"> · {overdueCount} overdue</span>}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={filters.openOnly}
            onChange={toggleOpenOnly}
            className="rounded border-border"
          />
          Hide completed
        </label>
      </div>

      {/* Filter chips */}
      <div className="bg-card border border-border rounded-xl p-3 space-y-3" aria-label="Task filters">
        <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Source">
          <span className="text-xs uppercase tracking-wide text-muted-foreground mr-1">Source</span>
          {(['all', 'kanban', 'brain'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSource(s)}
              aria-pressed={filters.source === s}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors flex items-center gap-1 ${
                filters.source === s
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:border-primary/50'
              }`}
            >
              {s !== 'all' && <span className="material-icons text-xs">{sourceIcon(s)}</span>}
              {s === 'all' ? 'All' : s === 'kanban' ? 'Kanban' : 'Brain'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Priority">
          <span className="text-xs uppercase tracking-wide text-muted-foreground mr-1">Priority</span>
          {VALID_PRIORITIES.map((p) => {
            const active = filters.priorities.includes(p);
            return (
              <button
                key={p}
                type="button"
                onClick={() => togglePriority(p)}
                aria-pressed={active}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors capitalize ${
                  active
                    ? `${priorityColor(p)} border-transparent ring-1 ring-primary`
                    : 'bg-background text-muted-foreground border-border hover:border-primary/50'
                }`}
              >
                {p}
              </button>
            );
          })}
          <button
            type="button"
            onClick={toggleOverdue}
            aria-pressed={filters.overdue}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors flex items-center gap-1 ml-1 ${
              filters.overdue
                ? 'bg-destructive/10 text-destructive border-destructive'
                : 'bg-background text-muted-foreground border-border hover:border-primary/50'
            }`}
          >
            <span className="material-icons text-xs">schedule</span>
            Overdue
          </button>
        </div>

        {filters.source !== 'brain' && projectsAvailable.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Project">
            <span className="text-xs uppercase tracking-wide text-muted-foreground mr-1">Project</span>
            {projectsAvailable.map((p) => {
              const active = filters.projectIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggleProject(p.id)}
                  aria-pressed={active}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors flex items-center gap-1 ${
                    active
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border hover:border-primary/50'
                  }`}
                  title={p.name}
                >
                  {p.projectKey && <span className="font-mono text-[10px] opacity-70">{p.projectKey}</span>}
                  <span className="truncate max-w-[140px]">{p.name}</span>
                </button>
              );
            })}
          </div>
        )}

        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <span className="material-icons text-xs">close</span>
            Clear filters
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
        </div>
      ) : groups.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <span className="material-icons text-5xl text-muted-foreground">task_alt</span>
          <h3 className="mt-4 font-semibold text-foreground">Nothing assigned</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {hasActiveFilters
              ? 'No tasks match your filters.'
              : filters.openOnly ? 'You have no open tasks. Great job!' : 'Nothing assigned in projects or Brain.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((p) => {
            const gKey = `${p.source}-${p.id}`;
            const headerHref = p.source === 'kanban' ? `/portal/projects/${p.id}` : '/portal/brain/tasks';
            return (
              <div key={gKey} className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="flex items-center justify-between gap-3 p-4 border-b border-border">
                  <div className="min-w-0 flex items-center gap-2">
                    <span
                      className="material-icons text-base text-muted-foreground shrink-0"
                      title={p.source === 'brain' ? 'Brain task' : 'Project board'}
                      aria-label={p.source === 'brain' ? 'Brain task group' : 'Project group'}
                    >
                      {sourceIcon(p.source)}
                    </span>
                    <Link href={headerHref} prefetch={false} className="font-semibold text-foreground hover:text-primary transition-colors truncate">
                      {p.name}
                    </Link>
                    {p.clientName && <span className="text-xs text-muted-foreground ml-2 shrink-0">· {p.clientName}</span>}
                  </div>
                  <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5 shrink-0">
                    {p.cards.length} task{p.cards.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <ul className="divide-y divide-border">
                  {p.cards.map((c) => {
                    const due = formatDue(typeof c.dueDate === 'string' ? c.dueDate : null);
                    const cKey = `${c.source}-${c.id}`;
                    const isCompleting = completing.has(cKey);
                    const canComplete = !c.columnIsDone && (c.source === 'brain' || c.doneColumnId != null);
                    return (
                      <li key={cKey} className="flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors">
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); void completeCard(c); }}
                          disabled={!canComplete || isCompleting}
                          aria-label={c.columnIsDone ? 'Completed' : 'Mark complete'}
                          aria-pressed={c.columnIsDone}
                          title={
                            c.columnIsDone ? 'Completed'
                              : !canComplete ? 'No "done" column on this project — open the board to complete'
                              : 'Mark complete'
                          }
                          className={`shrink-0 inline-flex items-center justify-center w-5 h-5 rounded border transition-colors ${
                            c.columnIsDone
                              ? 'bg-green-600 border-green-600 text-white'
                              : canComplete
                                ? 'border-border hover:border-primary hover:bg-primary/10 text-transparent hover:text-primary'
                                : 'border-border opacity-40 cursor-not-allowed text-transparent'
                          }`}
                        >
                          <span className="material-icons text-sm leading-none">
                            {isCompleting ? 'hourglass_empty' : c.columnIsDone ? 'check' : 'check'}
                          </span>
                        </button>
                        <Link
                          href={c.linkUrl}
                          // Each task row points to a heavy project / brain
                          // detail page. With dozens of tasks per page, viewport
                          // prefetch storms the server — defer to hover.
                          prefetch={false}
                          className="flex items-center gap-3 flex-1 min-w-0"
                        >
                          <span
                            className="material-icons text-sm text-muted-foreground shrink-0"
                            title={c.source === 'brain' ? 'Brain task' : 'Project card'}
                            aria-label={c.source === 'brain' ? 'Brain task' : 'Project card'}
                          >
                            {sourceIcon(c.source)}
                          </span>
                          {c.key && <span className="text-[10px] font-mono text-muted-foreground shrink-0">{c.key}</span>}
                          {c.priority && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${priorityColor(c.priority)}`}>
                              {c.priority}
                            </span>
                          )}
                          <span className={`flex-1 text-sm truncate ${c.columnIsDone ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                            {c.title}
                          </span>
                          {c.labels.length > 0 && (
                            <div className="hidden sm:flex flex-wrap gap-1 shrink-0">
                              {c.labels.slice(0, 3).map((l) => (
                                <span key={l.id} className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                                  style={{ backgroundColor: `${l.color}22`, color: l.color }}>
                                  {l.name}
                                </span>
                              ))}
                              {c.labels.length > 3 && <span className="text-[10px] text-muted-foreground">+{c.labels.length - 3}</span>}
                            </div>
                          )}
                          {c.checklist && c.checklist.total > 0 && (
                            <span className={`text-xs flex items-center gap-0.5 shrink-0 ${c.checklist.done === c.checklist.total ? 'text-green-600' : 'text-muted-foreground'}`}>
                              <span className="material-icons text-xs">check_box</span>
                              {c.checklist.done}/{c.checklist.total}
                            </span>
                          )}
                          {c.columnName && (
                            <span className="hidden md:inline text-xs text-muted-foreground shrink-0">· {c.columnName}</span>
                          )}
                          {c.dueDate && (
                            <span className={`text-xs flex items-center gap-0.5 shrink-0 ${
                              due.tone === 'overdue' ? 'text-destructive font-medium' :
                              due.tone === 'soon' ? 'text-amber-600' :
                              'text-muted-foreground'
                            }`}>
                              <span className="material-icons text-xs">event</span>
                              {due.label}
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}

          {nextCursor != null && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                className="text-sm px-4 py-2 rounded-lg border border-border bg-card hover:bg-accent text-foreground inline-flex items-center gap-2 disabled:opacity-50"
              >
                <span className={`material-icons text-base ${loadingMore ? 'animate-spin' : ''}`}>
                  {loadingMore ? 'refresh' : 'expand_more'}
                </span>
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
