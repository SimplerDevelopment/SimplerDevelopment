'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

interface DashboardSummary {
  needsReviewMeetings: { id: number; title: string; createdAt: string; meetingDate: string | null; pendingReviewItems: number }[];
  overdueTasks: DashboardTask[];
  blockedTasks: DashboardTask[];
  upcomingTasks: DashboardTask[];
  staleProspects: DashboardRelationship[];
  priorityRelationships: DashboardRelationship[];
  recentMeetings: { id: number; title: string; status: string; createdAt: string }[];
  counts: { pendingReviewItems: number; openTasks: number; aiCreatedTasks: number; relationships: number };
}

interface DashboardTask {
  id: number;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  createdByAi: boolean;
  meetingId: number | null;
  companyId: number | null;
  dealId: number | null;
  linkedName: string | null;
}

interface DashboardRelationship {
  overlayId: number;
  type: string;
  priority: string;
  name: string;
  underlying: 'company' | 'deal';
  lastTouchAt: string | null;
  nextReviewAt: string | null;
  daysSinceTouch: number | null;
  staleAfterDays: number | null;
  openTaskCount: number;
}

interface AutomationRuleSummary {
  id: number;
  name: string;
  enabled: boolean;
  trigger: { event: string };
  actions: { tool: string }[];
  executionCount: number;
  lastExecutedAt: string | null;
}

interface AutomationLogSummary {
  id: number;
  ruleName: string;
  triggerEvent: string;
  status: string;
  errorMessage: string | null;
  createdAt: string;
}

export function BrainDashboardWidgets() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/portal/brain/dashboard')
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setData(j.data);
        else setError(j.message || 'Failed to load dashboard.');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Network error'));
  }, []);

  if (error) {
    return (
      <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 text-sm text-destructive">
        {error}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <span className="material-icons animate-spin mr-2">progress_activity</span>
        Loading dashboard…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Counts strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Counter icon="reviews" tone="text-blue-600 dark:text-blue-400" label="Pending review" value={data.counts.pendingReviewItems} href="/portal/brain/communications?status=needs_review" />
        <Counter icon="checklist" tone="text-foreground" label="Open tasks" value={data.counts.openTasks} href="/portal/brain/tasks" />
        <Counter icon="auto_awesome" tone="text-primary" label="AI-created tasks" value={data.counts.aiCreatedTasks} href="/portal/brain/tasks?filter=ai" />
        <Counter icon="group_work" tone="text-cyan-600 dark:text-cyan-400" label="Relationships" value={data.counts.relationships} href="/portal/brain/relationships" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Tile
          title="Needs review"
          icon="reviews"
          tone="text-blue-600 dark:text-blue-400"
          action={<Link href="/portal/brain/communications" className="text-xs text-primary hover:underline">View all</Link>}
          empty="Nothing waiting for review."
          items={data.needsReviewMeetings}
          render={(m) => (
            <Link href={`/portal/brain/communications/${m.id}/review`} className="block hover:text-primary">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-foreground truncate">{m.title}</span>
                {m.pendingReviewItems > 0 && (
                  <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 flex-shrink-0">
                    {m.pendingReviewItems}
                  </span>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {new Date(m.meetingDate || m.createdAt).toLocaleDateString()}
              </span>
            </Link>
          )}
        />

        <Tile
          title="Overdue"
          icon="event_busy"
          tone="text-red-600 dark:text-red-400"
          action={<Link href="/portal/brain/tasks" className="text-xs text-primary hover:underline">All tasks</Link>}
          empty="Nothing overdue."
          items={data.overdueTasks}
          render={(t) => <TaskRow task={t} highlightDue />}
        />

        <Tile
          title="Stale prospects"
          icon="schedule"
          tone="text-amber-600 dark:text-amber-400"
          action={<Link href="/portal/brain/relationships?view=stale" className="text-xs text-primary hover:underline">All</Link>}
          empty="No stale prospects."
          items={data.staleProspects}
          render={(r) => (
            <Link href={`/portal/brain/relationships/${r.overlayId}`} className="block hover:text-primary">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-foreground truncate">{r.name}</span>
                <span className="text-xs text-amber-600 dark:text-amber-400 flex-shrink-0">
                  {r.daysSinceTouch}d
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {r.type.replace(/_/g, ' ')} · stale after {r.staleAfterDays}d
              </span>
            </Link>
          )}
        />

        <Tile
          title="Priority relationships"
          icon="flag"
          tone="text-red-600 dark:text-red-400"
          action={<Link href="/portal/brain/relationships?priority=high" className="text-xs text-primary hover:underline">View all</Link>}
          empty="No high-priority relationships."
          items={data.priorityRelationships}
          render={(r) => (
            <Link href={`/portal/brain/relationships/${r.overlayId}`} className="block hover:text-primary">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-foreground truncate">{r.name}</span>
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                  r.priority === 'critical' ? 'bg-red-500/10 text-red-600 dark:text-red-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                }`}>
                  {r.priority}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {r.type.replace(/_/g, ' ')}
                {r.openTaskCount > 0 && ` · ${r.openTaskCount} open`}
              </span>
            </Link>
          )}
        />

        <Tile
          title="Blocked"
          icon="block"
          tone="text-muted-foreground"
          action={<Link href="/portal/brain/tasks?status=blocked" className="text-xs text-primary hover:underline">View all</Link>}
          empty="Nothing blocked."
          items={data.blockedTasks}
          render={(t) => <TaskRow task={t} />}
        />

        <Tile
          title="Upcoming"
          icon="event"
          tone="text-foreground"
          action={<Link href="/portal/brain/tasks" className="text-xs text-primary hover:underline">View all</Link>}
          empty="No upcoming due dates."
          items={data.upcomingTasks}
          render={(t) => <TaskRow task={t} />}
        />
      </div>

      {/* Recent communication */}
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <span className="material-icons text-base text-muted-foreground">forum</span>
            Recent Communication
          </h2>
          <Link href="/portal/brain/communications/new" className="text-xs text-primary hover:underline inline-flex items-center gap-0.5">
            <span className="material-icons text-sm">add</span>
            New note
          </Link>
        </div>
        {data.recentMeetings.length === 0 ? (
          <p className="text-xs text-muted-foreground">No notes yet. Paste your first transcript or forward an email to get started.</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.recentMeetings.map((m) => (
              <li key={m.id} className="py-2">
                <Link href={`/portal/brain/communications/${m.id}`} className="flex items-center justify-between hover:text-primary">
                  <span className="text-sm text-foreground truncate">{m.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {m.status.replace(/_/g, ' ')} · {new Date(m.createdAt).toLocaleDateString()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <BrainAutomationsWidget />
    </div>
  );
}

function BrainAutomationsWidget() {
  const [rules, setRules] = useState<AutomationRuleSummary[] | null>(null);
  const [logs, setLogs] = useState<AutomationLogSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/portal/automations').then((r) => r.json()),
      fetch('/api/portal/automations/logs?limit=5').then((r) => r.json()),
    ])
      .then(([rulesRes, logsRes]) => {
        if (rulesRes.success) setRules(rulesRes.rules);
        else setError(rulesRes.error || 'Failed to load automations.');
        if (logsRes.success) setLogs(logsRes.logs);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Network error'));
  }, []);

  if (error) {
    return (
      <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 text-sm text-destructive">
        {error}
      </div>
    );
  }
  if (rules === null || logs === null) {
    return (
      <div className="bg-card border border-border rounded-lg p-5 flex items-center justify-center text-muted-foreground py-6">
        <span className="material-icons animate-spin mr-2">progress_activity</span>
        Loading automations…
      </div>
    );
  }

  const activeRules = rules.filter((r) => r.enabled);

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <span className="material-icons text-base text-amber-500">bolt</span>
            Active automations ({activeRules.length})
          </h2>
          <Link href="/portal/brain/automations" className="text-xs text-primary hover:underline inline-flex items-center gap-0.5">
            <span className="material-icons text-sm">add</span>
            New
          </Link>
        </div>
        {activeRules.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No active automations. <Link href="/portal/brain/automations" className="text-primary hover:underline">Install a template</Link> or build one with AI.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {activeRules.slice(0, 5).map((r) => (
              <li key={r.id} className="py-2">
                <Link href="/portal/brain/automations" className="flex items-center justify-between hover:text-primary gap-2">
                  <span className="text-sm text-foreground truncate flex-1 min-w-0">{r.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {r.executionCount > 0 ? `${r.executionCount} runs` : 'never run'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <span className="material-icons text-base text-muted-foreground">history</span>
            Recent automation runs
          </h2>
          <Link href="/portal/brain/automations" className="text-xs text-primary hover:underline">View all</Link>
        </div>
        {logs.length === 0 ? (
          <p className="text-xs text-muted-foreground">No runs yet. Logs will appear here once an automation fires.</p>
        ) : (
          <ul className="divide-y divide-border">
            {logs.map((log) => (
              <li key={log.id} className="py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span
                      className={`material-icons text-sm shrink-0 ${
                        log.status === 'success'
                          ? 'text-green-500'
                          : log.status === 'partial'
                          ? 'text-amber-500'
                          : 'text-red-500'
                      }`}
                    >
                      {log.status === 'success' ? 'check_circle' : log.status === 'partial' ? 'warning' : 'error'}
                    </span>
                    <span className="text-sm text-foreground truncate">{log.ruleName}</span>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {new Date(log.createdAt).toLocaleDateString()}
                  </span>
                </div>
                {log.errorMessage && (
                  <p className="text-xs text-red-500 truncate mt-0.5 ml-6">{log.errorMessage}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Counter({ icon, tone, label, value, href }: { icon: string; tone: string; label: string; value: number; href: string }) {
  return (
    <Link href={href} className="bg-card border border-border rounded-lg p-3 flex items-center gap-3 hover:border-primary/50 transition-colors">
      <span className={`material-icons text-2xl ${tone}`}>{icon}</span>
      <div className="min-w-0">
        <div className="text-xl font-bold text-foreground">{value}</div>
        <div className="text-xs text-muted-foreground truncate">{label}</div>
      </div>
    </Link>
  );
}

function Tile<T>({
  title,
  icon,
  tone,
  action,
  empty,
  items,
  render,
}: {
  title: string;
  icon: string;
  tone: string;
  action?: React.ReactNode;
  empty: string;
  items: T[];
  render: (item: T) => React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <span className={`material-icons text-base ${tone}`}>{icon}</span>
          {title}
        </h2>
        {action}
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item, i) => (
            <li key={i}>{render(item)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TaskRow({ task, highlightDue = false }: { task: DashboardTask; highlightDue?: boolean }) {
  const dueLabel = task.dueDate ? new Date(task.dueDate).toLocaleDateString() : null;
  return (
    <div className="text-sm">
      <div className="text-foreground truncate flex items-center gap-2">
        <span className="truncate">{task.title}</span>
        {task.createdByAi && <span className="material-icons text-sm text-muted-foreground" title="AI-created">auto_awesome</span>}
      </div>
      <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
        {dueLabel && (
          <span className={highlightDue ? 'text-red-600 dark:text-red-400' : ''}>
            {dueLabel}
          </span>
        )}
        {task.priority !== 'medium' && <span>{task.priority}</span>}
        {task.linkedName && (
          <span className="inline-flex items-center gap-0.5 truncate max-w-[160px]">
            <span className="material-icons text-sm">{task.companyId ? 'business' : 'handshake'}</span>
            {task.linkedName}
          </span>
        )}
      </div>
    </div>
  );
}
