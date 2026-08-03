'use client';

/**
 * Executions tab — live list of Workflow Designer runs for a project.
 *
 * Runs are driven by a Claude Code session reporting through MCP; this view
 * never starts one. It stays current over SSE
 * (/api/portal/projects/:id/flow-runs/stream), which is a bare wakeup channel:
 * on every ping we refetch /flow-runs rather than streaming row payloads, so
 * the list projection has exactly one definition (the REST route).
 *
 * Selecting a run opens the per-run stream and folds its event log into
 * per-node state via foldRunEvents() — the same helper the canvas overlay
 * uses, so both derive identically instead of drifting.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  foldRunEvents,
  TERMINAL_RUN_STATUSES,
  type AgentFlowRun,
  type AgentFlowRunEvent,
  type AgentFlowRunStatus,
  type AgentFlowRunSummary,
  type AgentFlowNodeData,
} from '@/lib/agent-flows/types';

const STATUS_META: Record<AgentFlowRunStatus, { label: string; cls: string; icon: string }> = {
  running:   { label: 'Running',   cls: 'text-blue-600 dark:text-blue-400',     icon: 'progress_activity' },
  // Amber matches the human-node colour on the canvas — the same "a person is
  // needed here" signal in both places.
  waiting:   { label: 'Waiting',   cls: 'text-amber-600 dark:text-amber-400',   icon: 'how_to_reg' },
  succeeded: { label: 'Succeeded', cls: 'text-emerald-600 dark:text-emerald-400', icon: 'check_circle' },
  failed:    { label: 'Failed',    cls: 'text-red-600 dark:text-red-400',       icon: 'error' },
  // Deliberately not styled as a failure: the run didn't break, its session
  // went away.
  abandoned: { label: 'Abandoned', cls: 'text-muted-foreground',                icon: 'cloud_off' },
};

const NODE_STATUS_CLS: Record<string, string> = {
  started:  'bg-blue-500',
  finished: 'bg-emerald-500',
  failed:   'bg-red-500',
  skipped:  'bg-muted-foreground/40',
};

function ago(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function duration(startedAt: string, finishedAt: string | null): string {
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const s = Math.max(0, Math.floor((end - new Date(startedAt).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

export default function FlowExecutionsTab({ projectId }: { projectId: number }) {
  const [runs, setRuns] = useState<AgentFlowRunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/projects/${projectId}/flow-runs`).then((r) => r.json());
      if (res?.success) setRuns(res.data ?? []);
    } catch { /* transient — the next ping or poll refetches */ }
  }, [projectId]);

  useEffect(() => {
    void refetch().finally(() => setLoading(false));
  }, [refetch]);

  // Live: every NOTIFY on the project channel is a wakeup, so just refetch.
  useEffect(() => {
    const es = new EventSource(`/api/portal/projects/${projectId}/flow-runs/stream`);
    es.addEventListener('ready', () => setLive(true));
    es.onmessage = () => { void refetch(); };
    es.onerror = () => setLive(false); // EventSource retries on its own
    return () => { es.close(); setLive(false); };
  }, [projectId, refetch]);

  // Elapsed time on in-flight runs should tick even with no events arriving.
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!runs.some((r) => !TERMINAL_RUN_STATUSES.includes(r.status))) return;
    const t = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [runs]);

  if (loading) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        <span className="material-icons text-base align-middle animate-spin mr-2">progress_activity</span>
        Loading executions…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${live ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
          {live ? 'Live' : 'Reconnecting…'}
        </div>
        <span className="text-xs text-muted-foreground">
          Runs are started from a Claude Code session with <code className="font-mono">/sd-run-flow</code>
        </span>
      </div>

      {runs.length === 0 ? (
        <div className="flex-1 bg-card border border-border rounded-2xl flex items-center justify-center">
          <div className="text-center p-10">
            <span className="material-icons text-5xl text-muted-foreground">history</span>
            <h3 className="mt-4 font-semibold text-foreground">No executions yet</h3>
            <p className="mt-2 text-sm text-muted-foreground max-w-md">
              Run a flow from your Claude Code session and it will appear here as it happens,
              without reloading.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {runs.map((r) => {
            const meta = STATUS_META[r.status];
            const active = !TERMINAL_RUN_STATUSES.includes(r.status);
            return (
              <div key={r.id} className="border-b border-border last:border-b-0">
                <button
                  type="button"
                  onClick={() => setSelectedId(selectedId === r.id ? null : r.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                >
                  <span className={`material-icons text-lg ${meta.cls} ${r.status === 'running' ? 'animate-spin' : ''}`}>
                    {meta.icon}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2">
                      {/* Sub-flow runs are indented so a handoff chain reads as a tree. */}
                      {r.depth > 0 && (
                        <span className="material-icons text-sm text-muted-foreground" title={`Sub-flow of run ${r.parentRunId}`}>
                          subdirectory_arrow_right
                        </span>
                      )}
                      <span className="text-sm font-medium text-foreground truncate">{r.flowName}</span>
                      <span className="text-[11px] text-muted-foreground">#{r.id}</span>
                    </span>
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      {meta.label} · {r.doneCount}/{r.nodeCount} steps · {duration(r.startedAt, r.finishedAt)}
                      {active ? '' : ` · ${ago(r.finishedAt ?? r.lastEventAt)}`}
                    </span>
                  </span>
                  {(r.inputTokens > 0 || r.outputTokens > 0) && (
                    <span className="text-[11px] font-mono text-muted-foreground shrink-0">
                      {((r.inputTokens + r.outputTokens) / 1000).toFixed(1)}k tok
                    </span>
                  )}
                  <span className="w-24 h-1.5 bg-muted rounded-full overflow-hidden shrink-0">
                    <span
                      className={`block h-full ${r.status === 'failed' ? 'bg-red-500' : 'bg-emerald-500'}`}
                      style={{ width: `${r.nodeCount ? Math.round((r.doneCount / r.nodeCount) * 100) : 0}%` }}
                    />
                  </span>
                </button>
                {selectedId === r.id && <RunDetail projectId={projectId} runId={r.id} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * One run, expanded. Opens the fine-grained per-run stream and folds the event
 * log to show where each node is. Full replay on connect is intentional: with
 * no per-node state table, the log IS the state.
 */
function RunDetail({ projectId, runId }: { projectId: number; runId: number }) {
  const [events, setEvents] = useState<AgentFlowRunEvent[]>([]);
  const [run, setRun] = useState<AgentFlowRun | null>(null);
  const seen = useRef<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/portal/projects/${projectId}/flow-runs/${runId}`)
      .then((r) => r.json())
      .then((res) => { if (!cancelled && res?.success) setRun(res.data.run); })
      .catch(() => { /* the stream still carries the events */ });
    return () => { cancelled = true; };
  }, [projectId, runId]);

  useEffect(() => {
    seen.current = new Set();
    setEvents([]);
    const es = new EventSource(`/api/portal/projects/${projectId}/flow-runs/${runId}/stream`);
    es.onmessage = (m) => {
      try {
        const e = JSON.parse(m.data) as AgentFlowRunEvent;
        // The stream replays on reconnect, so de-dupe by id rather than
        // assuming every delivery is new.
        if (seen.current.has(e.id)) return;
        seen.current.add(e.id);
        setEvents((prev) => [...prev, e]);
      } catch { /* ignore malformed frame */ }
    };
    es.addEventListener('done', () => es.close());
    return () => es.close();
  }, [projectId, runId]);

  const nodeState = useMemo(() => foldRunEvents(events), [events]);
  const nodes = run?.graph?.nodes ?? [];

  return (
    <div className="px-4 pb-4 pt-1 bg-muted/20">
      {nodes.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {nodes.map((n) => {
            const st = nodeState[n.id];
            const d = n.data as AgentFlowNodeData;
            return (
              <span
                key={n.id}
                title={st ? `${d.label} — ${st.status}${st.model ? ` (${st.model})` : ''}` : `${d.label} — pending`}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-border bg-background text-[11px]"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${st ? NODE_STATUS_CLS[st.status] : 'bg-muted-foreground/25'}`} />
                <span className={st?.status === 'skipped' ? 'text-muted-foreground line-through' : 'text-foreground'}>
                  {d.label}
                </span>
                {st?.durationMs != null && (
                  <span className="font-mono text-muted-foreground">{(st.durationMs / 1000).toFixed(1)}s</span>
                )}
              </span>
            );
          })}
        </div>
      )}

      <div className="max-h-52 overflow-y-auto rounded border border-border bg-background">
        {events.length === 0 ? (
          <p className="text-xs text-muted-foreground p-3">Waiting for events…</p>
        ) : (
          events.map((e) => (
            <div key={e.id} className="flex gap-2 px-3 py-1.5 border-b border-border last:border-b-0 text-[11px]">
              <span className="font-mono text-muted-foreground shrink-0">
                {new Date(e.createdAt).toLocaleTimeString()}
              </span>
              <span className="font-mono text-muted-foreground shrink-0 w-24 truncate">{e.type}</span>
              <span className="flex-1 text-foreground">
                {e.summary ?? e.nodeId ?? ''}
                {e.status ? <span className="text-muted-foreground"> · {e.status}</span> : null}
              </span>
              {(e.inputTokens != null || e.outputTokens != null) && (
                <span className="font-mono text-muted-foreground shrink-0">
                  {((e.inputTokens ?? 0) + (e.outputTokens ?? 0)).toLocaleString()} tok
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
