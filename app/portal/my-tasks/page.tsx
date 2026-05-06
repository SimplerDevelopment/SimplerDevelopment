'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { priorityColor } from '@/lib/portal-utils';

type MyTaskCardSource = 'kanban' | 'brain';

interface MyTaskCard {
  id: number | string;
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
}
interface MyTaskProject {
  id: number | string;
  source: MyTaskCardSource;
  name: string;
  projectKey: string | null;
  clientName: string | null;
  cards: MyTaskCard[];
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

export default function MyTasksPage() {
  const [projects, setProjects] = useState<MyTaskProject[] | null>(null);
  const [openOnly, setOpenOnly] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/portal/my-tasks?openOnly=${openOnly ? '1' : '0'}`)
      .then(r => r.json())
      .then(d => { if (!cancelled && d.success) setProjects(d.data.projects); })
      .catch(() => { if (!cancelled) setProjects([]); });
    return () => { cancelled = true; };
  }, [openOnly]);

  const loading = projects === null;
  const groups = projects ?? [];

  const total = groups.reduce((s, p) => s + p.cards.length, 0);
  const overdueCount = groups.reduce(
    (s, p) => s + p.cards.filter(c => !c.columnIsDone && c.dueDate && new Date(c.dueDate) < new Date()).length,
    0,
  );

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
            checked={openOnly}
            onChange={e => setOpenOnly(e.target.checked)}
            className="rounded border-border"
          />
          Hide completed
        </label>
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
            {openOnly ? 'You have no open tasks. Great job!' : 'Nothing assigned in projects or Brain.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(p => {
            const groupKey = `${p.source}-${p.id}`;
            const headerHref = p.source === 'kanban' ? `/portal/projects/${p.id}` : '/portal/brain/tasks';
            return (
              <div key={groupKey} className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="flex items-center justify-between gap-3 p-4 border-b border-border">
                  <div className="min-w-0 flex items-center gap-2">
                    <span
                      className="material-icons text-base text-muted-foreground shrink-0"
                      title={p.source === 'brain' ? 'Brain task' : 'Project board'}
                      aria-label={p.source === 'brain' ? 'Brain task group' : 'Project group'}
                    >
                      {sourceIcon(p.source)}
                    </span>
                    <Link href={headerHref} className="font-semibold text-foreground hover:text-primary transition-colors truncate">
                      {p.name}
                    </Link>
                    {p.clientName && <span className="text-xs text-muted-foreground ml-2 shrink-0">· {p.clientName}</span>}
                  </div>
                  <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5 shrink-0">
                    {p.cards.length} task{p.cards.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <ul className="divide-y divide-border">
                  {p.cards.map(c => {
                    const due = formatDue(typeof c.dueDate === 'string' ? c.dueDate : null);
                    return (
                      <li key={`${c.source}-${c.id}`}>
                        <Link
                          href={c.linkUrl}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors"
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
                              {c.labels.slice(0, 3).map(l => (
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
        </div>
      )}
    </div>
  );
}
