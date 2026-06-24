'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

// ─── API shape interfaces ────────────────────────────────────────────────────

interface PromptVersion {
  id: number;
  promptId: number;
  version: number;
  body: string;
  notes: string | null;
  status: 'draft' | 'active' | 'archived';
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

interface EvalRun {
  id: number;
  status: 'queued' | 'running' | 'done' | 'failed';
  trigger: string;
  promptVersionId: number | null;
  total: number;
  passed: number;
  passRate: number;
  aggregate: number;
  avgLatencyMs: number;
  totalTokens: number;
  costUsd: number;
  createdAt: string;
  finishedAt: string | null;
}

interface PromptDetail {
  id: number;
  key: string;
  title: string;
  description: string | null;
  activeVersionId: number | null;
  scheduleCron: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DetailData {
  prompt: PromptDetail;
  versions: PromptVersion[];
  runs: EvalRun[]; // ascending by createdAt
}

interface LiveRun {
  id: number;
  status: 'queued' | 'running' | 'done' | 'failed';
  suiteId: string;
  promptId: number | null;
  promptVersionId: number | null;
  total: number;
  passed: number;
  passRate: number;
  aggregate: number;
  avgLatencyMs: number;
  totalTokens: number;
  costUsd: number;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

interface EvalCase {
  id: number;
  caseKey: string;
  passed: boolean;
  aggregate: number;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  output: unknown;
  scores: unknown;
  error: string | null;
}

interface RunCasesCache {
  [runId: number]: { status: 'loading' | 'done' | 'error'; cases?: EvalCase[]; error?: string };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtAge(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return new Date(iso).toLocaleString();
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

function passRateBadgeClass(rate: number): string {
  if (rate >= 0.9) return 'bg-green-100 text-green-800 border-green-200';
  if (rate >= 0.7) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
  return 'bg-red-100 text-red-800 border-red-200';
}

function statusBadgeClass(status: EvalRun['status']): string {
  switch (status) {
    case 'done':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'running':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'queued':
      return 'bg-gray-100 text-gray-700 border-gray-200';
    case 'failed':
      return 'bg-red-100 text-red-800 border-red-200';
  }
}

function versionStatusBadgeClass(status: PromptVersion['status']): string {
  switch (status) {
    case 'active':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'draft':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'archived':
      return 'bg-gray-100 text-gray-500 border-gray-200';
  }
}

// ─── Sparkline ───────────────────────────────────────────────────────────────

function Sparkline({ runs }: { runs: EvalRun[] }) {
  if (runs.length === 0) {
    return (
      <div className="flex items-center justify-center h-12 text-xs text-muted-foreground">
        No runs yet
      </div>
    );
  }

  const W = 240;
  const H = 48;
  const pad = 4;

  const points = runs.map((r, i) => {
    const x = runs.length === 1
      ? W / 2
      : pad + (i / (runs.length - 1)) * (W - pad * 2);
    const y = H - pad - r.passRate * (H - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const lastRun = runs[runs.length - 1];
  const lastX = runs.length === 1
    ? W / 2
    : W - pad;
  const lastY = H - pad - lastRun.passRate * (H - pad * 2);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      className="overflow-visible"
      aria-label="Pass rate trend sparkline"
    >
      {/* 50% reference line */}
      <line
        x1={pad} y1={H / 2} x2={W - pad} y2={H / 2}
        stroke="currentColor"
        strokeOpacity={0.12}
        strokeWidth={1}
        strokeDasharray="3 3"
        className="text-foreground"
      />
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke="#22c55e"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Latest value dot */}
      <circle cx={lastX} cy={lastY} r={3} fill="#22c55e" />
    </svg>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function PromptDetailPage() {
  const params = useParams();
  const promptId = Number(params.id);

  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Run-eval state
  const [mock, setMock] = useState(true);
  const [inFlight, setInFlight] = useState(false);
  const [liveStatus, setLiveStatus] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Per-case drill-down state
  const [expandedRunIds, setExpandedRunIds] = useState<Set<number>>(new Set());
  const [runCasesCache, setRunCasesCache] = useState<RunCasesCache>({});
  const fetchedRunIds = useRef<Set<number>>(new Set());

  function toggleRunExpand(runId: number) {
    setExpandedRunIds((prev) => {
      const next = new Set(prev);
      if (next.has(runId)) {
        next.delete(runId);
      } else {
        next.add(runId);
      }
      return next;
    });
    // Fetch cases only once per run id
    if (fetchedRunIds.current.has(runId)) return;
    fetchedRunIds.current.add(runId);
    setRunCasesCache((prev) => ({ ...prev, [runId]: { status: 'loading' } }));
    fetch(`/api/admin/eval-runs/${runId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setRunCasesCache((c) => ({ ...c, [runId]: { status: 'done', cases: d.data?.cases ?? [] } }));
        } else {
          setRunCasesCache((c) => ({ ...c, [runId]: { status: 'error', error: d.message ?? 'Failed to load cases' } }));
        }
      })
      .catch((e) => {
        setRunCasesCache((c) => ({ ...c, [runId]: { status: 'error', error: e instanceof Error ? e.message : 'Failed to load cases' } }));
      });
  }

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    fetch(`/api/admin/prompts/${promptId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setData(d.data ?? null);
        else setErr(d.message ?? 'Failed to load');
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [promptId]);

  useEffect(() => {
    // Mount fetch — load() sets loading state synchronously; the one extra
    // render is intentional and harmless for a page-load fetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [load]);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  async function handleRunEval() {
    if (inFlight) return;
    setInFlight(true);
    setLiveStatus('Starting…');

    try {
      const res = await fetch('/api/admin/eval-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promptId, mock }),
      });
      const d = await res.json();
      if (!d.success) {
        setLiveStatus(`Error: ${d.message ?? 'Failed to start run'}`);
        setInFlight(false);
        return;
      }

      const runId: number = d.data.runId;
      setLiveStatus('queued…');

      pollRef.current = setInterval(async () => {
        try {
          const pr = await fetch(`/api/admin/eval-runs/${runId}`);
          const pd = await pr.json();
          if (!pd.success) return;

          const run: LiveRun = pd.data.run;
          if (run.status === 'queued') {
            setLiveStatus('queued…');
          } else if (run.status === 'running') {
            setLiveStatus('running…');
          } else if (run.status === 'done') {
            setLiveStatus(`done — ${run.passed}/${run.total} passed`);
            stopPolling();
            setInFlight(false);
            load();
          } else if (run.status === 'failed') {
            setLiveStatus(`failed${run.error ? `: ${run.error}` : ''}`);
            stopPolling();
            setInFlight(false);
            load();
          }
        } catch {
          // keep polling on transient errors
        }
      }, 1500);
    } catch (e) {
      setLiveStatus(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
      setInFlight(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-6">
      {/* Back link */}
      <Link
        href="/admin/prompts"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="material-icons text-base">arrow_back</span>
        Prompt Evals
      </Link>

      {err && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
          {err}
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center py-16">
          <span className="material-icons animate-spin text-primary text-3xl">refresh</span>
        </div>
      ) : data == null ? null : (
        <>
          {/* ── Header ── */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">{data.prompt.title}</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <code className="text-xs text-muted-foreground font-mono">{data.prompt.key}</code>
                {data.prompt.scheduleCron && (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border bg-gray-100 text-gray-600 border-gray-200">
                    <span className="material-icons text-sm leading-none">schedule</span>
                    {data.prompt.scheduleCron}
                  </span>
                )}
              </div>
              {data.prompt.description && (
                <p className="text-sm text-muted-foreground mt-1">{data.prompt.description}</p>
              )}
            </div>

            {/* ── Run eval control ── */}
            <div className="flex-shrink-0 bg-card border border-border rounded-xl p-4 space-y-3 min-w-[220px]">
              <div className="text-xs font-semibold text-foreground uppercase tracking-wide">
                Run Eval
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="mock-select" className="text-xs text-muted-foreground whitespace-nowrap">
                  Mode
                </label>
                <select
                  id="mock-select"
                  value={mock ? 'mock' : 'real'}
                  onChange={(e) => setMock(e.target.value === 'mock')}
                  disabled={inFlight}
                  className="flex-1 text-xs border border-border rounded px-2 py-1 bg-background text-foreground disabled:opacity-50"
                >
                  <option value="mock">Mock</option>
                  <option value="real">Real (costs tokens)</option>
                </select>
              </div>
              <button
                onClick={handleRunEval}
                disabled={inFlight}
                className="w-full inline-flex items-center justify-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <span className={`material-icons text-base leading-none ${inFlight ? 'animate-spin' : ''}`}>
                  {inFlight ? 'refresh' : 'play_arrow'}
                </span>
                {inFlight ? 'Running…' : 'Run eval'}
              </button>
              {liveStatus && (
                <div className={`text-xs rounded px-2 py-1.5 border ${
                  liveStatus.startsWith('done')
                    ? 'bg-green-50 text-green-800 border-green-200'
                    : liveStatus.startsWith('failed') || liveStatus.startsWith('Error')
                    ? 'bg-red-50 text-red-800 border-red-200'
                    : 'bg-blue-50 text-blue-800 border-blue-200'
                }`}>
                  {liveStatus}
                </div>
              )}
            </div>
          </div>

          {/* ── Timeline section ── */}
          <section className="bg-card border border-border rounded-xl p-4 space-y-4">
            <div className="flex items-center gap-2">
              <span className="material-icons text-muted-foreground text-lg">show_chart</span>
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                Run Timeline
              </h2>
              <span className="text-xs text-muted-foreground">({data.runs.length} runs)</span>
            </div>

            <div className="flex items-end gap-6">
              <Sparkline runs={data.runs} />
              <div className="text-xs text-muted-foreground space-y-0.5">
                <div>Pass rate over time</div>
                <div className="text-[10px]">oldest → newest</div>
              </div>
            </div>

            {data.runs.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="px-3 py-2 w-6"></th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Run ID</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Pass Rate</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Passed / Total</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Tokens</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Cost</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Age</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {[...data.runs].reverse().map((run) => {
                      const isExpanded = expandedRunIds.has(run.id);
                      const cacheEntry = runCasesCache[run.id];
                      return (
                        <React.Fragment key={run.id}>
                          <tr
                            className="hover:bg-accent/50 transition-colors cursor-pointer"
                            onClick={() => toggleRunExpand(run.id)}
                          >
                            <td className="px-3 py-2 text-xs text-muted-foreground">
                              <span className={`material-icons text-sm leading-none transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                                expand_more
                              </span>
                            </td>
                            <td className="px-3 py-2 text-xs font-mono text-muted-foreground">
                              #{run.id}
                            </td>
                            <td className="px-3 py-2">
                              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium border ${statusBadgeClass(run.status)}`}>
                                {run.status}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium border ${passRateBadgeClass(run.passRate)}`}>
                                {Math.round(run.passRate * 100)}%
                              </span>
                            </td>
                            <td className="px-3 py-2 text-xs text-foreground">
                              {run.passed} / {run.total}
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">
                              {run.totalTokens.toLocaleString()}
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground font-mono">
                              ${run.costUsd.toFixed(4)}
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">
                              {fmtAge(run.createdAt)}
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td colSpan={8} className="bg-muted/30 px-6 py-3">
                                {!cacheEntry || cacheEntry.status === 'loading' ? (
                                  <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                                    <span className="material-icons animate-spin text-base leading-none">refresh</span>
                                    Loading cases…
                                  </div>
                                ) : cacheEntry.status === 'error' ? (
                                  <div className="text-xs text-red-700 py-2">
                                    Error loading cases: {cacheEntry.error}
                                  </div>
                                ) : cacheEntry.cases && cacheEntry.cases.length === 0 ? (
                                  <div className="text-xs text-muted-foreground py-2">No cases found for this run.</div>
                                ) : (
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="border-b border-border">
                                        <th className="pb-1.5 text-left font-medium text-muted-foreground uppercase tracking-wider pr-4">Case</th>
                                        <th className="pb-1.5 text-left font-medium text-muted-foreground uppercase tracking-wider pr-4">Result</th>
                                        <th className="pb-1.5 text-left font-medium text-muted-foreground uppercase tracking-wider pr-4">Agg</th>
                                        <th className="pb-1.5 text-left font-medium text-muted-foreground uppercase tracking-wider pr-4">Latency</th>
                                        <th className="pb-1.5 text-left font-medium text-muted-foreground uppercase tracking-wider pr-4">Tokens</th>
                                        <th className="pb-1.5 text-left font-medium text-muted-foreground uppercase tracking-wider">Details</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/50">
                                      {(cacheEntry.cases ?? []).map((c) => (
                                        <tr key={c.id} className="align-top">
                                          <td className="py-2 pr-4 font-mono text-foreground">{c.caseKey}</td>
                                          <td className="py-2 pr-4">
                                            {c.passed ? (
                                              <span className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full font-medium border bg-green-100 text-green-800 border-green-200">
                                                <span className="material-icons text-xs leading-none">check_circle</span>
                                                pass
                                              </span>
                                            ) : (
                                              <span className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full font-medium border bg-red-100 text-red-800 border-red-200">
                                                <span className="material-icons text-xs leading-none">cancel</span>
                                                fail
                                              </span>
                                            )}
                                          </td>
                                          <td className="py-2 pr-4 text-foreground">{c.aggregate.toFixed(2)}</td>
                                          <td className="py-2 pr-4 text-muted-foreground">{c.latencyMs}ms</td>
                                          <td className="py-2 pr-4 text-muted-foreground">{(c.inputTokens + c.outputTokens).toLocaleString()}</td>
                                          <td className="py-2 space-y-1">
                                            {c.error && (
                                              <div className="text-red-700">Error: {c.error}</div>
                                            )}
                                            <details>
                                              <summary className="cursor-pointer text-muted-foreground hover:text-foreground select-none">Output</summary>
                                              <pre className="text-[10px] mt-1 bg-background border border-border rounded p-2 overflow-auto max-h-40 whitespace-pre-wrap break-all">
                                                {JSON.stringify(c.output, null, 2)}
                                              </pre>
                                            </details>
                                            <details>
                                              <summary className="cursor-pointer text-muted-foreground hover:text-foreground select-none">Scores</summary>
                                              <pre className="text-[10px] mt-1 bg-background border border-border rounded p-2 overflow-auto max-h-40 whitespace-pre-wrap break-all">
                                                {JSON.stringify(c.scores, null, 2)}
                                              </pre>
                                            </details>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ── Version Compare section ── */}
          {(() => {
            // Compute per-version latest done run
            interface VersionStat {
              version: PromptVersion;
              passRate: number | null;
              aggregate: number | null;
            }
            const stats: VersionStat[] = data.versions.map((v) => {
              const doneRuns = data.runs
                .filter((r) => r.promptVersionId === v.id && r.status === 'done')
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
              const latest = doneRuns[0] ?? null;
              return {
                version: v,
                passRate: latest ? latest.passRate : null,
                aggregate: latest ? latest.aggregate : null,
              };
            });

            return (
              <section className="bg-card border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="material-icons text-muted-foreground text-lg">compare_arrows</span>
                  <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                    Version Compare
                  </h2>
                </div>

                {stats.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No versions yet.</p>
                ) : (
                  <>
                    {stats.length < 2 && (
                      <p className="text-xs text-muted-foreground">Add another version to compare.</p>
                    )}
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 border-b border-border">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Version</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Latest Pass Rate</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Latest Aggregate</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Δ vs Prev Version</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {stats.map((s, i) => {
                            const isActive = s.version.id === data.prompt.activeVersionId;
                            const prev = i > 0 ? stats[i - 1] : null;
                            let delta: number | null = null;
                            if (prev && prev.passRate !== null && s.passRate !== null) {
                              delta = s.passRate - prev.passRate;
                            }
                            return (
                              <tr key={s.version.id} className="hover:bg-accent/50 transition-colors">
                                <td className="px-3 py-2">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-sm font-semibold text-foreground">v{s.version.version}</span>
                                    {isActive && (
                                      <span className="inline-flex items-center gap-0.5 text-xs text-green-700 font-medium">
                                        <span className="material-icons text-sm leading-none">check_circle</span>
                                        active
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-3 py-2">
                                  {s.passRate !== null ? (
                                    <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium border ${passRateBadgeClass(s.passRate)}`}>
                                      {Math.round(s.passRate * 100)}%
                                    </span>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">no run</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-xs text-foreground">
                                  {s.aggregate !== null ? s.aggregate.toFixed(2) : <span className="text-muted-foreground">no run</span>}
                                </td>
                                <td className="px-3 py-2 text-xs font-medium">
                                  {i === 0 ? (
                                    <span className="text-muted-foreground">—</span>
                                  ) : delta === null ? (
                                    <span className="text-muted-foreground">—</span>
                                  ) : delta > 0 ? (
                                    <span className="text-green-700">+{Math.round(delta * 100)}%</span>
                                  ) : delta < 0 ? (
                                    <span className="text-red-700">{Math.round(delta * 100)}%</span>
                                  ) : (
                                    <span className="text-muted-foreground">0%</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </section>
            );
          })()}

          {/* ── Versions section ── */}
          <section className="bg-card border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="material-icons text-muted-foreground text-lg">history</span>
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                Versions
              </h2>
              <span className="text-xs text-muted-foreground">({data.versions.length})</span>
            </div>

            {data.versions.length === 0 ? (
              <p className="text-xs text-muted-foreground">No versions yet.</p>
            ) : (
              <div className="space-y-2">
                {data.versions.map((v) => {
                  const isActive = v.id === data.prompt.activeVersionId;
                  return (
                    <div
                      key={v.id}
                      className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                        isActive
                          ? 'bg-green-50/50 border-green-200'
                          : 'border-border bg-background'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-foreground">
                            v{v.version}
                          </span>
                          <span
                            className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium border ${versionStatusBadgeClass(v.status)}`}
                          >
                            {v.status}
                          </span>
                          {isActive && (
                            <span className="inline-flex items-center gap-0.5 text-xs text-green-700 font-medium">
                              <span className="material-icons text-sm leading-none">check_circle</span>
                              active
                            </span>
                          )}
                        </div>
                        {v.notes && (
                          <p className="text-xs text-muted-foreground mt-0.5">{v.notes}</p>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground whitespace-nowrap">
                        {fmtAge(v.createdAt)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
