'use client';

import Link from 'next/link';
import { useEffect, useState, useCallback } from 'react';
import type { BrainProfile } from '@/lib/brain/profiles';
import type { IndustryTemplate } from '@/lib/brain/industry-templates';

interface SettingsResponse {
  success: boolean;
  data?: {
    profile: BrainProfile;
    template: IndustryTemplate;
  };
  message?: string;
}

export default function BrainDashboardPage() {
  const [profile, setProfile] = useState<BrainProfile | null>(null);
  const [template, setTemplate] = useState<IndustryTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [enabling, setEnabling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/portal/brain/settings');
      const json: SettingsResponse = await r.json();
      if (!r.ok || !json.success || !json.data) {
        setError(json.message || 'Failed to load Company Brain.');
      } else {
        setProfile(json.data.profile);
        setTemplate(json.data.template);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const enableBrain = async () => {
    setEnabling(true);
    setError(null);
    try {
      const r = await fetch('/api/portal/brain/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      });
      const json: SettingsResponse = await r.json();
      if (!r.ok || !json.success || !json.data) {
        setError(json.message || 'Failed to enable Company Brain.');
      } else {
        setProfile(json.data.profile);
        setTemplate(json.data.template);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setEnabling(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto flex items-center justify-center py-16 text-muted-foreground">
        <span className="material-icons animate-spin mr-2">progress_activity</span>
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto py-12">
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-sm text-destructive">
          <div className="flex items-center gap-2 font-medium mb-1">
            <span className="material-icons text-base">error_outline</span>
            Couldn&apos;t load Company Brain
          </div>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!profile?.enabled) {
    return (
      <div className="max-w-3xl mx-auto py-12">
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <span className="material-icons text-5xl text-primary mb-3 block">psychology</span>
          <h1 className="text-2xl font-bold text-foreground mb-2">Company Brain</h1>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto mb-6">
            A structured operating layer for your business. Capture meetings, decisions, commitments,
            and tasks into a secure, AI-queryable command center. AI proposes — you approve.
          </p>
          <div className="grid sm:grid-cols-3 gap-3 max-w-2xl mx-auto mb-8">
            <FeatureBullet icon="forum" title="Meetings → tasks">
              Paste a transcript. AI extracts decisions, commitments, and follow-ups for your review.
            </FeatureBullet>
            <FeatureBullet icon="reviews" title="Human approval">
              Nothing is written to your records until a human approves it. Every approval is audited.
            </FeatureBullet>
            <FeatureBullet icon="search" title="Ask anything">
              Search across meetings, decisions, and follow-ups with citations back to source records.
            </FeatureBullet>
          </div>
          <button
            onClick={enableBrain}
            disabled={enabling}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {enabling
              ? <><span className="material-icons animate-spin text-base">progress_activity</span>Enabling…</>
              : <><span className="material-icons text-base">power_settings_new</span>Enable Company Brain</>
            }
          </button>
          <p className="text-xs text-muted-foreground mt-3">
            You can configure industry template, modules, and confidentiality after enabling.
          </p>
        </div>
      </div>
    );
  }

  // Enabled state — Phase 0 placeholder. Phase 4 will replace this with the real command center.
  return (
    <div className="max-w-5xl mx-auto py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <span className="material-icons text-primary">psychology</span>
            {profile.name}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {template?.label ?? 'Generic'} template · Confidentiality default: {profile.defaultConfidentiality}
          </p>
        </div>
        <Link
          href="/portal/brain/settings"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-border text-foreground hover:bg-accent"
        >
          <span className="material-icons text-base">settings</span>
          Settings
        </Link>
      </div>

      <DashboardWidgets />

      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <span className="material-icons text-base text-muted-foreground">construction</span>
          Coming next
        </h2>
        <ul className="text-sm text-muted-foreground space-y-1.5 list-disc list-inside">
          <li>Phase 5 — Ask Brain (search across meetings, notes, and decisions)</li>
          <li>Phase 5.5 — Drive folder watch + Meet recording adapters</li>
          <li>Phase 6 — Embeddings (semantic search)</li>
        </ul>
      </div>
    </div>
  );
}

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

function DashboardWidgets() {
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
        <Counter icon="reviews" tone="text-blue-600 dark:text-blue-400" label="Pending review" value={data.counts.pendingReviewItems} href="/portal/brain/meetings?status=needs_review" />
        <Counter icon="checklist" tone="text-foreground" label="Open tasks" value={data.counts.openTasks} href="/portal/brain/tasks" />
        <Counter icon="auto_awesome" tone="text-primary" label="AI-created tasks" value={data.counts.aiCreatedTasks} href="/portal/brain/tasks?filter=ai" />
        <Counter icon="group_work" tone="text-cyan-600 dark:text-cyan-400" label="Relationships" value={data.counts.relationships} href="/portal/brain/relationships" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Needs review */}
        <Tile
          title="Needs review"
          icon="reviews"
          tone="text-blue-600 dark:text-blue-400"
          action={<Link href="/portal/brain/meetings" className="text-xs text-primary hover:underline">View all</Link>}
          empty="Nothing waiting for review."
          items={data.needsReviewMeetings}
          render={(m) => (
            <Link href={`/portal/brain/meetings/${m.id}/review`} className="block hover:text-primary">
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

        {/* Overdue tasks */}
        <Tile
          title="Overdue"
          icon="event_busy"
          tone="text-red-600 dark:text-red-400"
          action={<Link href="/portal/brain/tasks" className="text-xs text-primary hover:underline">All tasks</Link>}
          empty="Nothing overdue."
          items={data.overdueTasks}
          render={(t) => <TaskRow task={t} highlightDue />}
        />

        {/* Stale prospects */}
        <Tile
          title="Stale prospects"
          icon="schedule"
          tone="text-amber-600 dark:text-amber-400"
          action={<Link href="/portal/brain/prospects" className="text-xs text-primary hover:underline">All</Link>}
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

        {/* Priority relationships */}
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

        {/* Blocked work */}
        <Tile
          title="Blocked"
          icon="block"
          tone="text-muted-foreground"
          action={<Link href="/portal/brain/tasks?status=blocked" className="text-xs text-primary hover:underline">View all</Link>}
          empty="Nothing blocked."
          items={data.blockedTasks}
          render={(t) => <TaskRow task={t} />}
        />

        {/* Upcoming tasks */}
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

      {/* Recent meetings */}
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <span className="material-icons text-base text-muted-foreground">forum</span>
            Recent meetings
          </h2>
          <Link href="/portal/brain/meetings/new" className="text-xs text-primary hover:underline inline-flex items-center gap-0.5">
            <span className="material-icons text-sm">add</span>
            New meeting
          </Link>
        </div>
        {data.recentMeetings.length === 0 ? (
          <p className="text-xs text-muted-foreground">No meetings yet. Paste your first transcript to get started.</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.recentMeetings.map((m) => (
              <li key={m.id} className="py-2">
                <Link href={`/portal/brain/meetings/${m.id}`} className="flex items-center justify-between hover:text-primary">
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

function FeatureBullet({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="text-left bg-muted/30 border border-border rounded-md p-3">
      <div className="flex items-center gap-1.5 text-sm font-medium text-foreground mb-1">
        <span className="material-icons text-base text-primary">{icon}</span>
        {title}
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{children}</p>
    </div>
  );
}
