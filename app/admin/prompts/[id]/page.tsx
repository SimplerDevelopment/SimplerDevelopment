'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';

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

interface AuditEntry {
  id: number;
  action: string;
  versionId: number | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
  actor: { id: number; email: string; name: string | null } | null;
}

interface PromoteResponseData {
  activeVersionId: number;
  enqueuedRunId: number | null;
  regression: {
    warned: boolean;
    delta: number | null;
    message: string | null;
  };
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
  const { data: session } = useSession();
  const isAdmin = session?.user && (session.user as { role?: string }).role === 'admin';

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

  // ── Prompt editor state ──────────────────────────────────────────────────
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorBody, setEditorBody] = useState('');
  const [editorNotes, setEditorNotes] = useState('');
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);

  // ── Schedule state ───────────────────────────────────────────────────────
  const [scheduleCron, setScheduleCron] = useState('');
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleSuccess, setScheduleSuccess] = useState(false);

  // ── Promote / rollback state ─────────────────────────────────────────────
  const [versionActionInFlight, setVersionActionInFlight] = useState<number | null>(null);
  const [promoteConfirm, setPromoteConfirm] = useState<number | null>(null); // versionId awaiting confirm
  const [rollbackConfirm, setRollbackConfirm] = useState<number | null>(null);
  const [promoteWarning, setPromoteWarning] = useState<string | null>(null);
  const [versionActionError, setVersionActionError] = useState<string | null>(null);

  // ── Audit log state ──────────────────────────────────────────────────────
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

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

  const loadAudit = useCallback(() => {
    setAuditLoading(true);
    setAuditError(null);
    fetch(`/api/admin/prompts/${promptId}/audit`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setAuditEntries(d.data ?? []);
        else setAuditError(d.message ?? 'Failed to load audit log');
      })
      .catch((e) => setAuditError(e instanceof Error ? e.message : 'Failed to load audit log'))
      .finally(() => setAuditLoading(false));
  }, [promptId]);

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    fetch(`/api/admin/prompts/${promptId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          const detail: DetailData = d.data ?? null;
          setData(detail);
          if (detail) {
            // Seed schedule input from latest data
            setScheduleCron(detail.prompt.scheduleCron ?? '');
            // Seed editor body from active version
            const activeVer = detail.versions.find((v) => v.id === detail.prompt.activeVersionId);
            if (activeVer) setEditorBody(activeVer.body);
          }
        } else {
          setErr(d.message ?? 'Failed to load');
        }
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [promptId]);

  useEffect(() => {
    // Mount fetch — load() sets loading state synchronously; the one extra
    // render is intentional and harmless for a page-load fetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    loadAudit();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [load, loadAudit]);

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

  // ── Prompt editor handlers ───────────────────────────────────────────────

  async function handleSaveDraft() {
    if (editorSaving) return;
    setEditorSaving(true);
    setEditorError(null);
    try {
      const res = await fetch(`/api/admin/prompts/${promptId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: editorBody, notes: editorNotes }),
      });
      const d = await res.json();
      if (d.success) {
        setEditorOpen(false);
        setEditorNotes('');
        load();
        loadAudit();
      } else {
        setEditorError(d.message ?? 'Failed to save draft');
      }
    } catch (e) {
      setEditorError(e instanceof Error ? e.message : 'Failed to save draft');
    } finally {
      setEditorSaving(false);
    }
  }

  // ── Schedule handler ─────────────────────────────────────────────────────

  async function handleSaveSchedule() {
    if (scheduleSaving) return;
    setScheduleSaving(true);
    setScheduleError(null);
    setScheduleSuccess(false);
    try {
      const res = await fetch(`/api/admin/prompts/${promptId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduleCron: scheduleCron.trim() || null }),
      });
      const d = await res.json();
      if (d.success) {
        setScheduleSuccess(true);
        load();
        loadAudit();
      } else {
        setScheduleError(d.message ?? 'Failed to save schedule');
      }
    } catch (e) {
      setScheduleError(e instanceof Error ? e.message : 'Failed to save schedule');
    } finally {
      setScheduleSaving(false);
    }
  }

  // ── Promote / rollback handlers ──────────────────────────────────────────

  async function handlePromote(versionId: number) {
    if (versionActionInFlight !== null) return;
    setVersionActionInFlight(versionId);
    setPromoteWarning(null);
    setVersionActionError(null);
    try {
      const res = await fetch(`/api/admin/prompts/${promptId}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId }),
      });
      const d = await res.json();
      if (d.success) {
        const resp: PromoteResponseData = d.data;
        if (resp.regression?.warned && resp.regression.message) {
          setPromoteWarning(resp.regression.message);
        }
        load();
        loadAudit();
      } else {
        setVersionActionError(d.message ?? 'Failed to promote version');
      }
    } catch (e) {
      setVersionActionError(e instanceof Error ? e.message : 'Failed to promote version');
    } finally {
      setVersionActionInFlight(null);
      setPromoteConfirm(null);
    }
  }

  async function handleRollback(versionId: number) {
    if (versionActionInFlight !== null) return;
    setVersionActionInFlight(versionId);
    setVersionActionError(null);
    try {
      const res = await fetch(`/api/admin/prompts/${promptId}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId }),
      });
      const d = await res.json();
      if (d.success) {
        load();
        loadAudit();
      } else {
        setVersionActionError(d.message ?? 'Failed to roll back version');
      }
    } catch (e) {
      setVersionActionError(e instanceof Error ? e.message : 'Failed to roll back version');
    } finally {
      setVersionActionInFlight(null);
      setRollbackConfirm(null);
    }
  }

  // ── Audit icon helper ────────────────────────────────────────────────────

  function auditActionIcon(action: string): string {
    switch (action) {
      case 'promote': return 'trending_up';
      case 'rollback': return 'undo';
      case 'create_draft': return 'edit_note';
      case 'edit_schedule': return 'schedule';
      case 'edit_prompt': return 'edit';
      case 'create_case':
      case 'edit_case':
      case 'toggle_case': return 'dataset';
      default: return 'info';
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
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold text-foreground">{data.prompt.title}</h1>
                <Link
                  href={`/admin/prompts/${promptId}/cases`}
                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <span className="material-icons text-sm leading-none">dataset</span>
                  Edit test cases
                </Link>
              </div>
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

          {/* ── Prompt editor (admin only) ── */}
          {isAdmin && (
            <section className="bg-card border border-border rounded-xl p-4 space-y-3">
              <button
                onClick={() => {
                  setEditorOpen((o) => !o);
                  setEditorError(null);
                  // Reset body to active version on open
                  if (!editorOpen && data) {
                    const activeVer = data.versions.find((v) => v.id === data.prompt.activeVersionId);
                    if (activeVer) setEditorBody(activeVer.body);
                    setEditorNotes('');
                  }
                }}
                className="flex items-center gap-2 w-full text-left"
              >
                <span className="material-icons text-muted-foreground text-lg">
                  {editorOpen ? 'expand_less' : 'expand_more'}
                </span>
                <span className="text-sm font-semibold text-foreground uppercase tracking-wide">
                  Edit prompt
                </span>
              </button>

              {editorOpen && (
                <div className="space-y-3 pt-1">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      Prompt body
                    </label>
                    <textarea
                      value={editorBody}
                      onChange={(e) => setEditorBody(e.target.value)}
                      rows={10}
                      className="w-full text-sm font-mono border border-border rounded-lg px-3 py-2 bg-background text-foreground resize-y focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
                      disabled={editorSaving}
                      placeholder="Prompt body…"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      Notes (optional)
                    </label>
                    <input
                      type="text"
                      value={editorNotes}
                      onChange={(e) => setEditorNotes(e.target.value)}
                      className="w-full text-sm border border-border rounded-lg px-3 py-1.5 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
                      disabled={editorSaving}
                      placeholder="What changed in this version?"
                    />
                  </div>
                  {editorError && (
                    <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                      {editorError}
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleSaveDraft}
                      disabled={editorSaving || !editorBody.trim()}
                      className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <span className={`material-icons text-base leading-none ${editorSaving ? 'animate-spin' : ''}`}>
                        {editorSaving ? 'refresh' : 'save'}
                      </span>
                      {editorSaving ? 'Saving…' : 'Save as draft'}
                    </button>
                    <button
                      onClick={() => { setEditorOpen(false); setEditorError(null); }}
                      disabled={editorSaving}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Cancel
                    </button>
                    <span className="text-xs text-muted-foreground">
                      Saves a new DRAFT version — does not change production.
                    </span>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* ── Schedule control (admin only) ── */}
          {isAdmin && (
            <section className="bg-card border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="material-icons text-muted-foreground text-lg">schedule</span>
                <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                  Scheduled Eval
                </h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Opt-in cron for scheduled eval runs; leave blank to disable.
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="text"
                  value={scheduleCron}
                  onChange={(e) => { setScheduleCron(e.target.value); setScheduleSuccess(false); setScheduleError(null); }}
                  placeholder="0 9 * * 1"
                  disabled={scheduleSaving}
                  className="text-sm font-mono border border-border rounded-lg px-3 py-1.5 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 w-48"
                />
                <button
                  onClick={handleSaveSchedule}
                  disabled={scheduleSaving}
                  className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <span className={`material-icons text-base leading-none ${scheduleSaving ? 'animate-spin' : ''}`}>
                    {scheduleSaving ? 'refresh' : 'save'}
                  </span>
                  {scheduleSaving ? 'Saving…' : 'Save schedule'}
                </button>
                {scheduleSuccess && !scheduleError && (
                  <span className="text-xs text-green-700 flex items-center gap-0.5">
                    <span className="material-icons text-sm leading-none">check_circle</span>
                    Saved
                  </span>
                )}
              </div>
              {scheduleError && (
                <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                  {scheduleError}
                </div>
              )}
            </section>
          )}

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

            {promoteWarning && (
              <div className="flex items-start gap-2 text-xs text-yellow-800 bg-yellow-50 border border-yellow-200 rounded px-3 py-2">
                <span className="material-icons text-base leading-none flex-shrink-0">warning</span>
                <span>{promoteWarning}</span>
                <button onClick={() => setPromoteWarning(null)} className="ml-auto text-yellow-600 hover:text-yellow-900">
                  <span className="material-icons text-sm leading-none">close</span>
                </button>
              </div>
            )}

            {versionActionError && (
              <div className="flex items-start gap-2 text-xs text-red-800 bg-red-50 border border-red-200 rounded px-3 py-2">
                <span className="material-icons text-base leading-none flex-shrink-0">error</span>
                <span>{versionActionError}</span>
                <button onClick={() => setVersionActionError(null)} className="ml-auto text-red-600 hover:text-red-900">
                  <span className="material-icons text-sm leading-none">close</span>
                </button>
              </div>
            )}

            {data.versions.length === 0 ? (
              <p className="text-xs text-muted-foreground">No versions yet.</p>
            ) : (
              <div className="space-y-2">
                {data.versions.map((v) => {
                  const isActive = v.id === data.prompt.activeVersionId;
                  const isInFlight = versionActionInFlight === v.id;
                  const isPromoteConfirming = promoteConfirm === v.id;
                  const isRollbackConfirming = rollbackConfirm === v.id;
                  return (
                    <div
                      key={v.id}
                      className={`rounded-lg border px-3 py-2.5 transition-colors ${
                        isActive
                          ? 'bg-green-50/50 border-green-200'
                          : 'border-border bg-background'
                      }`}
                    >
                      <div className="flex items-start gap-3">
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
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {fmtAge(v.createdAt)}
                          </span>
                          {isAdmin && !isActive && (
                            v.status === 'draft' ? (
                              <button
                                onClick={() => { setPromoteConfirm(v.id); setRollbackConfirm(null); setVersionActionError(null); }}
                                disabled={isInFlight || versionActionInFlight !== null}
                                className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              >
                                <span className={`material-icons text-sm leading-none ${isInFlight ? 'animate-spin' : ''}`}>
                                  {isInFlight ? 'refresh' : 'trending_up'}
                                </span>
                                {isInFlight ? 'Promoting…' : 'Promote'}
                              </button>
                            ) : (
                              <button
                                onClick={() => { setRollbackConfirm(v.id); setPromoteConfirm(null); setVersionActionError(null); }}
                                disabled={isInFlight || versionActionInFlight !== null}
                                className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              >
                                <span className={`material-icons text-sm leading-none ${isInFlight ? 'animate-spin' : ''}`}>
                                  {isInFlight ? 'refresh' : 'undo'}
                                </span>
                                {isInFlight ? 'Rolling back…' : 'Roll back to this'}
                              </button>
                            )
                          )}
                        </div>
                      </div>

                      {/* Inline confirm row for promote */}
                      {isAdmin && isPromoteConfirming && (
                        <div className="mt-2 flex items-center gap-2 text-xs bg-primary/5 border border-primary/20 rounded px-3 py-2">
                          <span className="text-foreground">Promote v{v.version} to active? This will enqueue a regression eval.</span>
                          <button
                            onClick={() => handlePromote(v.id)}
                            disabled={isInFlight}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors font-medium"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setPromoteConfirm(null)}
                            className="px-2 py-1 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      )}

                      {/* Inline confirm row for rollback */}
                      {isAdmin && isRollbackConfirming && (
                        <div className="mt-2 flex items-center gap-2 text-xs bg-yellow-50 border border-yellow-200 rounded px-3 py-2">
                          <span className="text-yellow-900">Roll back to v{v.version}? The current active version will be archived.</span>
                          <button
                            onClick={() => handleRollback(v.id)}
                            disabled={isInFlight}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-yellow-600 text-white hover:bg-yellow-700 disabled:opacity-50 transition-colors font-medium"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setRollbackConfirm(null)}
                            className="px-2 py-1 text-yellow-700 hover:text-yellow-900 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
          {/* ── Audit Log section (all staff) ── */}
          <section className="bg-card border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="material-icons text-muted-foreground text-lg">manage_history</span>
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                Audit Log
              </h2>
            </div>

            {auditLoading ? (
              <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
                <span className="material-icons animate-spin text-base leading-none">refresh</span>
                Loading…
              </div>
            ) : auditError ? (
              <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                {auditError}
              </div>
            ) : auditEntries.length === 0 ? (
              <p className="text-xs text-muted-foreground">No audit events yet.</p>
            ) : (
              <div className="space-y-1">
                {auditEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-start gap-2.5 text-xs py-1.5 border-b border-border/50 last:border-0"
                  >
                    <span className="material-icons text-muted-foreground text-base leading-none flex-shrink-0 mt-px">
                      {auditActionIcon(entry.action)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="text-foreground font-medium">{entry.action.replace(/_/g, ' ')}</span>
                      {entry.versionId != null && (
                        <span className="text-muted-foreground ml-1.5">
                          #{entry.versionId}
                        </span>
                      )}
                      {entry.detail && Object.keys(entry.detail).length > 0 && (
                        <span className="text-muted-foreground ml-1.5 font-mono">
                          — {Object.entries(entry.detail)
                            .filter(([, v]) => v != null)
                            .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
                            .join(', ')}
                        </span>
                      )}
                    </div>
                    <span className="text-muted-foreground whitespace-nowrap">
                      {entry.actor?.email ?? 'system'}
                    </span>
                    <span className="text-muted-foreground whitespace-nowrap">
                      {fmtAge(entry.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
