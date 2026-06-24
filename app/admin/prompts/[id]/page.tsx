'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
                    {[...data.runs].reverse().map((run) => (
                      <tr key={run.id} className="hover:bg-accent/50 transition-colors">
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
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

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
