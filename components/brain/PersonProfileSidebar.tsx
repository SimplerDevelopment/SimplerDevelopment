'use client';

/**
 * Right-rail card on the person profile page — surfaces "Linked elsewhere
 * in Brain" so an operator looking at a person can see at a glance what
 * threads of work touch them.
 *
 * Cross-branch dependencies (Initiatives, Decisions) ship on sibling
 * feature branches that may not yet be merged. We probe their endpoints
 * and silently hide the sections if they 404 / return non-success — that
 * way this branch can ship independently and the sections light up as
 * the sibling branches land.
 *
 * Tasks always work — the brain tasks table is on this branch's base.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';

interface SidebarPerson {
  id: number;
  userId: number | null;
}

interface TaskRow {
  id: number;
  title: string;
  status: 'open' | 'in_progress' | 'blocked' | 'done';
}

interface InitiativeRow {
  id: number;
  title: string;
  status?: string;
}

interface DecisionRow {
  id: number;
  title: string;
}

interface PersonProfileSidebarProps {
  person: SidebarPerson;
}

const TASK_STATUS_TONE: Record<TaskRow['status'], string> = {
  open: 'bg-muted text-muted-foreground',
  in_progress: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  blocked: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  done: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
};

export function PersonProfileSidebar({ person }: PersonProfileSidebarProps) {
  const [tasks, setTasks] = useState<TaskRow[] | null>(null);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [initiatives, setInitiatives] = useState<InitiativeRow[] | null>(null);
  const [decisions, setDecisions] = useState<DecisionRow[] | null>(null);

  // Tasks — only if the person has a linked userId. All setState calls live
  // inside the async IIFE so the effect body never mutates state
  // synchronously (react-hooks/set-state-in-effect).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (person.userId === null) {
        if (!cancelled) setTasks([]);
        return;
      }
      if (!cancelled) setTasksLoading(true);
      try {
        const r = await fetch(`/api/portal/brain/tasks?ownerId=${person.userId}`);
        const json = await r.json();
        if (!cancelled && r.ok && json.success) {
          const items = Array.isArray(json.data) ? json.data : (json.data?.items ?? []);
          setTasks(items as TaskRow[]);
        } else if (!cancelled) {
          setTasks([]);
        }
      } catch {
        if (!cancelled) setTasks([]);
      } finally {
        if (!cancelled) setTasksLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [person.userId]);

  // Initiatives — sibling branch may not have shipped. Probe and hide on
  // 404 / non-success.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/portal/brain/initiatives?personId=${person.id}&limit=5`);
        if (!r.ok) {
          if (!cancelled) setInitiatives(null);
          return;
        }
        const json = await r.json();
        if (!cancelled && json.success) {
          const items = json.data?.items ?? json.data ?? [];
          setInitiatives(items as InitiativeRow[]);
        } else if (!cancelled) {
          setInitiatives(null);
        }
      } catch {
        if (!cancelled) setInitiatives(null);
      }
    })();
    return () => { cancelled = true; };
  }, [person.id]);

  // Decisions — same graceful-empty pattern.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/portal/brain/decisions?personId=${person.id}&limit=5`);
        if (!r.ok) {
          if (!cancelled) setDecisions(null);
          return;
        }
        const json = await r.json();
        if (!cancelled && json.success) {
          const items = json.data?.items ?? json.data ?? [];
          setDecisions(items as DecisionRow[]);
        } else if (!cancelled) {
          setDecisions(null);
        }
      } catch {
        if (!cancelled) setDecisions(null);
      }
    })();
    return () => { cancelled = true; };
  }, [person.id]);

  // If nothing to show at all (no tasks possible + sibling sections absent),
  // collapse the whole sidebar to a quiet "Nothing linked yet" stub rather
  // than rendering empty cards.
  const showInitiatives = Array.isArray(initiatives);
  const showDecisions = Array.isArray(decisions);
  const noTasksPossible = person.userId === null;
  const tasksEmpty = !tasksLoading && tasks !== null && tasks.length === 0;
  const everythingEmpty =
    noTasksPossible
    && !showInitiatives
    && !showDecisions;

  return (
    <aside className="bg-card border border-border rounded-lg p-4 space-y-4">
      <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
        <span className="material-icons text-base text-primary">link</span>
        Linked elsewhere in Brain
      </h2>

      {everythingEmpty ? (
        <p className="text-xs text-muted-foreground">
          Link this person to a user account to surface their open tasks here.
        </p>
      ) : (
        <>
          <section>
            <h3 className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1">
              <span className="material-icons text-[14px]">checklist</span>
              Tasks
            </h3>
            {tasksLoading ? (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="material-icons animate-spin text-sm">progress_activity</span>
                Loading…
              </div>
            ) : noTasksPossible ? (
              <p className="text-xs text-muted-foreground">
                No linked user account.
              </p>
            ) : tasksEmpty ? (
              <p className="text-xs text-muted-foreground">No open tasks.</p>
            ) : (
              <ul className="space-y-1.5">
                {(tasks ?? []).slice(0, 8).map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/portal/brain/tasks?selected=${t.id}`}
                      className="flex items-center gap-1.5 text-xs hover:underline"
                    >
                      <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide ${TASK_STATUS_TONE[t.status]}`}>
                        {t.status.replace('_', ' ')}
                      </span>
                      <span className="text-foreground truncate">{t.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {showInitiatives && (
            <section>
              <h3 className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1">
                <span className="material-icons text-[14px]">flag</span>
                Initiatives
              </h3>
              {initiatives!.length === 0 ? (
                <p className="text-xs text-muted-foreground">No linked initiatives.</p>
              ) : (
                <ul className="space-y-1">
                  {initiatives!.slice(0, 5).map((i) => (
                    <li key={i.id} className="text-xs">
                      <Link
                        href={`/portal/brain/initiatives/${i.id}`}
                        className="text-foreground hover:underline"
                      >
                        {i.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {showDecisions && (
            <section>
              <h3 className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1">
                <span className="material-icons text-[14px]">gavel</span>
                Decisions
              </h3>
              {decisions!.length === 0 ? (
                <p className="text-xs text-muted-foreground">No linked decisions.</p>
              ) : (
                <ul className="space-y-1">
                  {decisions!.slice(0, 5).map((d) => (
                    <li key={d.id} className="text-xs">
                      <Link
                        href={`/portal/brain/decisions/${d.id}`}
                        className="text-foreground hover:underline"
                      >
                        {d.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}
    </aside>
  );
}

export default PersonProfileSidebar;
