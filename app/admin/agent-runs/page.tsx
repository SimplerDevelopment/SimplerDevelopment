'use client';

/**
 * /admin/agent-runs — cross-tenant agent-flow executions monitor.
 *
 * The staff-wide rollup of what every client's agents are doing right now.
 * Per-project detail already exists at /portal/projects/:id?tab=runs, so rows
 * link there rather than re-implementing the node-chip/event-log detail view.
 *
 * Live via SSE on the single admin channel; the stream is only a wakeup, so
 * every ping refetches the REST list and the list keeps one source of truth.
 */

import { useEffect, useState } from 'react';
import { TERMINAL_RUN_STATUSES, type AgentFlowRunStatus } from '@/lib/agent-flows/types';

interface AdminRunRow {
  id: number;
  flowId: number;
  flowName: string;
  projectId: number;
  projectName: string;
  clientId: number;
  company: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  status: AgentFlowRunStatus;
  parentRunId: number | null;
  depth: number;
  inputTokens: number;
  outputTokens: number;
  startedAt: string;
  finishedAt: string | null;
  lastEventAt: string;
  nodeCount: number;
  doneCount: number;
}

type Filter = 'active' | 'all' | 'terminal';

const STATUS_META: Record<AgentFlowRunStatus, { label: string; icon: string; cls: string; spin?: boolean }> = {
  running: { label: 'Running', icon: 'progress_activity', cls: 'bg-blue-500/10 text-blue-600 dark:text-blue-400', spin: true },
  waiting: { label: 'Waiting', icon: 'pause_circle', cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  succeeded: { label: 'Succeeded', icon: 'check_circle', cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  failed: { label: 'Failed', icon: 'error', cls: 'bg-red-500/10 text-red-600 dark:text-red-400' },
  // Not a failure: the driving Claude Code session went away. Worth its own
  // colour so a dead runner is never mistaken for a real error.
  abandoned: { label: 'Abandoned', icon: 'link_off', cls: 'bg-muted text-muted-foreground' },
};

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function duration(startedAt: string, finishedAt: string | null): string {
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const secs = Math.max(0, Math.floor((end - new Date(startedAt).getTime()) / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function clientLabel(r: AdminRunRow): string {
  return r.company || r.ownerName || r.ownerEmail || `Client #${r.clientId}`;
}

export default function AdminAgentRunsPage() {
  const [filter, setFilter] = useState<Filter>('active');
  const [rows, setRows] = useState<AdminRunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);

  // Bumped by every stream ping. Refetching on [filter, tick] keeps the two
  // triggers in one effect and lets the subscription below mount exactly once
  // — the stream is filter-agnostic, so changing the filter must not churn it.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const qs = filter === 'all' ? '' : `?filter=${filter}`;
      try {
        const res = await fetch(`/api/admin/agent-flow-runs${qs}`);
        const body = await res.json();
        // The guard also drops a slow in-flight response that would otherwise
        // overwrite the results of a filter the user has since changed.
        if (!cancelled && body?.success) setRows(body.data as AdminRunRow[]);
      } catch {
        // Transient failure: keep the previous rows rather than blanking the
        // monitor. The next ping or filter change retries.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [filter, tick]);

  useEffect(() => {
    const es = new EventSource('/api/admin/agent-flow-runs/stream');
    es.addEventListener('ready', () => setLive(true));
    es.onmessage = () => setTick((t) => t + 1);
    es.onerror = () => setLive(false); // EventSource reconnects on its own.
    return () => es.close();
  }, []);

  const tracked = rows.filter((r) => !TERMINAL_RUN_STATUSES.includes(r.status));
  const failed = rows.filter((r) => r.status === 'failed').length;
  const totalTokens = rows.reduce((sum, r) => sum + r.inputTokens + r.outputTokens, 0);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            Agent runs
            <span
              className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                live ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground'
              }`}
              title={live ? 'Streaming live' : 'Not connected — reconnecting'}
            >
              <span className="material-icons text-[14px]">{live ? 'sensors' : 'sensors_off'}</span>
              {live ? 'Live' : 'Offline'}
            </span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Every client&apos;s agent-flow executions. Runs are driven by a Claude Code session — the portal watches, it does not execute.
          </p>
        </div>
        <div className="flex gap-1">
          {(['active', 'all', 'terminal'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-sm rounded-lg border capitalize ${
                filter === f ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border hover:bg-accent'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="In flight" value={String(tracked.length)} icon="bolt" />
        <StatCard label="Waiting on a human" value={String(rows.filter((r) => r.status === 'waiting').length)} icon="pause_circle" />
        <StatCard label="Failed" value={String(failed)} icon="error" />
        <StatCard label="Tokens" value={`${(totalTokens / 1000).toFixed(1)}k`} icon="toll" />
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="font-medium">{rows.length} run{rows.length === 1 ? '' : 's'}</h2>
        </div>

        {loading ? (
          <div className="p-8 text-center text-muted-foreground">
            <span className="material-icons animate-spin align-middle mr-2">progress_activity</span>
            Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No {filter === 'all' ? '' : filter} runs. A run appears here once a Claude Code session calls
            <code className="mx-1 px-1 py-0.5 rounded bg-muted text-xs">agent_flow_runs_start</code>.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  {['Status', 'Flow', 'Client', 'Progress', 'Tokens', 'Started'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => {
                  const meta = STATUS_META[r.status];
                  const pct = r.nodeCount > 0 ? Math.round((r.doneCount / r.nodeCount) * 100) : 0;
                  return (
                    <tr key={r.id} className="hover:bg-accent/50">
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${meta.cls}`}>
                          <span className={`material-icons text-[14px] ${meta.spin ? 'animate-spin' : ''}`}>{meta.icon}</span>
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <a href={`/portal/projects/${r.projectId}?tab=runs`} className="hover:underline font-medium">
                          {/* depth > 0 means this run was spawned by a `flow`-kind node in a parent run. */}
                          {r.depth > 0 && <span className="material-icons text-[14px] align-middle mr-1 text-muted-foreground">subdirectory_arrow_right</span>}
                          {r.flowName}
                        </a>
                        <div className="text-xs text-muted-foreground">#{r.id} · {r.projectName}</div>
                      </td>
                      <td className="px-4 py-3">{clientLabel(r)}</td>
                      <td className="px-4 py-3 min-w-[8rem]">
                        <div className="text-xs text-muted-foreground mb-1">{r.doneCount}/{r.nodeCount} steps</div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full ${r.status === 'failed' ? 'bg-red-500' : 'bg-emerald-500'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {((r.inputTokens + r.outputTokens) / 1000).toFixed(1)}k
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {relativeTime(r.startedAt)}
                        <div className="text-xs">{duration(r.startedAt, r.finishedAt)}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
        <span className="material-icons text-[16px]">{icon}</span>
        {label}
      </div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}
