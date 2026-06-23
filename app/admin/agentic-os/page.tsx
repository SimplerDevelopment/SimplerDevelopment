'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

// ─── Types mirrored from lib/agentic-os/* (kept inline so this page is purely payload-driven) ──

type AgenticOsTrigger = 'on-demand' | 'scheduled' | 'cloud';
type AgenticOsDomain = string;
type RunStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'unavailable';

interface AgenticOsVariable {
  key: string;
  label: string;
  required: boolean;
  placeholder?: string;
  helpText?: string;
  type?: 'text' | 'textarea' | 'url' | 'select';
  options?: string[];
}

interface AgenticOsRule {
  id: string;
  title: string;
  body: string;
}

interface CatalogSkill {
  id: string;
  domain: AgenticOsDomain;
  name: string;
  description: string;
  icon: string;
  estimatedRuntime?: string;
  appliesRules?: string[];
  trigger: AgenticOsTrigger;
  promptTemplate?: string;
  variables?: AgenticOsVariable[];
  cronExpression?: string;
  manualRunPath?: string;
  webhookPath?: string;
  source?: { kind: string; path?: string; name?: string; schedule?: string };
}

interface RecentRun {
  id: number;
  skillId: string;
  status: RunStatus;
  exitCode: number | null;
  durationMs: number | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface CatalogPayload {
  skills: CatalogSkill[];
  domains: AgenticOsDomain[];
  domainLabels: Record<string, string>;
  rules: AgenticOsRule[];
  recentRuns: RecentRun[];
  counts: Partial<Record<RunStatus, number>>;
  executorAvailable: boolean;
  executorHostHint: string | null;
}

type FilterMode = 'all' | 'on-demand' | 'scheduled' | 'history';

// ─── Helpers ──────────────────────────────────────────────────────────────

function renderPromptTemplate(template: string, values: Record<string, string | undefined>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (m, key) => {
    const v = values[key];
    return v && v.length > 0 ? v : m;
  });
}

function formatDate(d: string | null) {
  if (!d) return '--';
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDuration(ms: number | null) {
  if (ms == null) return '--';
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}m ${r}s`;
}

function statusBadge(status: RunStatus) {
  const palette: Record<RunStatus, string> = {
    pending: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    running: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 animate-pulse',
    succeeded: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    cancelled: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    unavailable: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${palette[status] ?? palette.pending}`}>
      {status}
    </span>
  );
}

function triggerBadge(trigger: AgenticOsTrigger) {
  const palette: Record<AgenticOsTrigger, string> = {
    'on-demand': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
    scheduled: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    cloud: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${palette[trigger]}`}>
      <span className="material-icons text-[10px]" style={{ fontSize: '12px' }}>
        {trigger === 'on-demand' ? 'play_arrow' : trigger === 'scheduled' ? 'schedule' : 'cloud'}
      </span>
      {trigger}
    </span>
  );
}

// ─── Skill card ───────────────────────────────────────────────────────────

function SkillCard({
  skill,
  rulesById,
  onRun,
}: {
  skill: CatalogSkill;
  rulesById: Record<string, AgenticOsRule>;
  onRun: (skillId: string) => void;
}) {
  const isOnDemand = skill.trigger === 'on-demand';
  const isScheduled = skill.trigger === 'scheduled';

  return (
    <div className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-3 hover:border-foreground/20 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="material-icons text-2xl text-muted-foreground shrink-0 mt-0.5">
            {skill.icon || 'extension'}
          </span>
          <div className="min-w-0">
            <h3 className="font-semibold text-foreground leading-tight">{skill.name}</h3>
            <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate" title={skill.id}>
              {skill.id}
            </p>
          </div>
        </div>
        {triggerBadge(skill.trigger)}
      </div>

      <p
        className="text-sm text-muted-foreground"
        style={{
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {skill.description}
      </p>

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {skill.estimatedRuntime && (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <span className="material-icons" style={{ fontSize: '14px' }}>
              timer
            </span>
            {skill.estimatedRuntime}
          </span>
        )}
        {isScheduled && skill.cronExpression && (
          <span className="inline-flex items-center gap-1 text-muted-foreground font-mono">
            <span className="material-icons" style={{ fontSize: '14px' }}>
              event
            </span>
            {skill.cronExpression}
          </span>
        )}
      </div>

      {skill.appliesRules && skill.appliesRules.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {skill.appliesRules.map((rid) => (
            <span
              key={rid}
              title={rulesById[rid]?.body ?? rid}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium ring-1 ring-inset ring-border bg-muted/40 text-muted-foreground"
            >
              <span className="material-icons" style={{ fontSize: '12px' }}>
                gavel
              </span>
              {rulesById[rid]?.title ?? rid}
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto pt-2 flex items-center justify-between gap-2">
        {isOnDemand ? (
          <button
            onClick={() => onRun(skill.id)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <span className="material-icons" style={{ fontSize: '16px' }}>
              play_arrow
            </span>
            Run
          </button>
        ) : isScheduled ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="material-icons" style={{ fontSize: '16px' }}>
              schedule
            </span>
            <span>Cron-managed</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="material-icons" style={{ fontSize: '16px' }}>
              cloud
            </span>
            <span>Cloud-triggered</span>
          </div>
        )}
        {skill.manualRunPath && (
          <code className="text-[10px] text-muted-foreground font-mono truncate max-w-[140px]" title={skill.manualRunPath}>
            {skill.manualRunPath}
          </code>
        )}
      </div>
    </div>
  );
}

// ─── Run drawer ───────────────────────────────────────────────────────────

interface DrawerRunState {
  runId: number | null;
  status: RunStatus | null;
  output: string;
  error: string | null;
}

function RunDrawer({
  skill,
  executorAvailable,
  onClose,
  onRunStarted,
}: {
  skill: CatalogSkill;
  executorAvailable: boolean;
  onClose: () => void;
  onRunStarted: (run: RecentRun) => void;
}) {
  const [vars, setVars] = useState<Record<string, string>>({});
  const [runState, setRunState] = useState<DrawerRunState>({
    runId: null,
    status: null,
    output: '',
    error: null,
  });
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  const rendered = useMemo(
    () => renderPromptTemplate(skill.promptTemplate ?? '', vars),
    [skill.promptTemplate, vars],
  );

  const requiredOk = useMemo(() => {
    const required = (skill.variables ?? []).filter((v) => v.required);
    return required.every((v) => (vars[v.key] ?? '').trim().length > 0);
  }, [skill.variables, vars]);

  useEffect(() => {
    return () => {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, []);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(rendered);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  async function startRun() {
    if (!executorAvailable || !requiredOk || submitting) return;
    setSubmitting(true);
    setRunState({ runId: null, status: 'pending', output: '', error: null });
    try {
      const res = await fetch('/api/admin/agentic-os/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillId: skill.id, variables: vars }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        const msg =
          json?.message ??
          (res.status === 503
            ? 'Executor disabled on this host. Use Copy Prompt instead.'
            : `Request failed (${res.status}).`);
        setRunState({ runId: null, status: 'unavailable', output: '', error: msg });
        setSubmitting(false);
        return;
      }
      const runId: number = json.data.runId;
      const optimisticRun: RecentRun = {
        id: runId,
        skillId: skill.id,
        status: 'running',
        exitCode: null,
        durationMs: null,
        errorMessage: null,
        createdAt: new Date().toISOString(),
        completedAt: null,
      };
      onRunStarted(optimisticRun);
      setRunState({ runId, status: 'running', output: '', error: null });

      // Subscribe to SSE.
      const es = new EventSource(`/api/admin/agentic-os/runs/${runId}/stream`);
      esRef.current = es;
      es.onmessage = (ev) => {
        setRunState((s) => ({ ...s, output: s.output + ev.data }));
      };
      es.addEventListener('done', (ev) => {
        try {
          const payload = JSON.parse((ev as MessageEvent).data ?? '{}');
          const finalStatus: RunStatus = (payload?.status as RunStatus) ?? 'succeeded';
          setRunState((s) => ({ ...s, status: finalStatus }));
        } catch {
          setRunState((s) => ({ ...s, status: 'succeeded' }));
        }
        es.close();
        esRef.current = null;
        setSubmitting(false);
      });
      es.onerror = () => {
        setRunState((s) => ({
          ...s,
          status: s.status === 'running' ? 'failed' : s.status,
          error: s.error ?? 'Live stream disconnected.',
        }));
        es.close();
        esRef.current = null;
        setSubmitting(false);
      };
    } catch (err) {
      setRunState({
        runId: null,
        status: 'failed',
        output: '',
        error: err instanceof Error ? err.message : 'Request failed.',
      });
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-xl bg-background border-l border-border shadow-2xl flex flex-col">
        <header className="flex items-start justify-between gap-3 p-5 border-b border-border">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="material-icons text-xl text-muted-foreground">{skill.icon || 'extension'}</span>
              <h2 className="text-lg font-semibold text-foreground truncate">{skill.name}</h2>
            </div>
            <p className="text-xs text-muted-foreground font-mono mt-1">{skill.id}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
            aria-label="Close drawer"
          >
            <span className="material-icons">close</span>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <p className="text-sm text-muted-foreground">{skill.description}</p>

          {(skill.variables ?? []).length > 0 ? (
            <div className="space-y-3">
              <h3 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Inputs</h3>
              {(skill.variables ?? []).map((v) => {
                const value = vars[v.key] ?? '';
                const setValue = (next: string) => setVars((prev) => ({ ...prev, [v.key]: next }));
                return (
                  <div key={v.key} className="space-y-1">
                    <label className="text-xs font-medium text-foreground flex items-center gap-1">
                      {v.label}
                      {v.required && <span className="text-red-500">*</span>}
                      <span className="text-muted-foreground font-mono font-normal text-[10px]">({v.key})</span>
                    </label>
                    {v.type === 'select' && v.options ? (
                      <select
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                      >
                        <option value="">{v.placeholder ?? 'Select…'}</option>
                        {v.options.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : v.type === 'textarea' ? (
                      <textarea
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        placeholder={v.placeholder}
                        rows={5}
                        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    ) : (
                      <input
                        type={v.type === 'url' ? 'url' : 'text'}
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        placeholder={v.placeholder}
                        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    )}
                    {v.helpText && <p className="text-[11px] text-muted-foreground">{v.helpText}</p>}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">This skill takes no inputs.</p>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Rendered prompt</h3>
              <span className="text-[10px] text-muted-foreground">
                {rendered.length} chars
              </span>
            </div>
            <pre className="text-xs bg-muted/40 border border-border rounded-lg p-3 whitespace-pre-wrap break-words font-mono max-h-72 overflow-y-auto">
              {rendered || '(no prompt template)'}
            </pre>
          </div>

          {runState.error && (
            <div className="rounded-lg border border-red-500/40 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-200">
              <div className="flex items-center gap-1.5 font-medium">
                <span className="material-icons" style={{ fontSize: '16px' }}>
                  error_outline
                </span>
                Error
              </div>
              <p className="mt-1 text-xs">{runState.error}</p>
            </div>
          )}

          {runState.runId != null && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Live output</h3>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground font-mono">run #{runState.runId}</span>
                  {runState.status && statusBadge(runState.status)}
                </div>
              </div>
              <pre className="text-xs bg-black/90 text-green-200 border border-border rounded-lg p-3 whitespace-pre-wrap break-words font-mono max-h-72 overflow-y-auto min-h-[80px]">
                {runState.output || '(waiting for output…)'}
              </pre>
            </div>
          )}
        </div>

        <footer className="border-t border-border p-4 flex items-center justify-end gap-2 bg-background">
          {!executorAvailable && (
            <span className="text-[11px] text-muted-foreground mr-auto">
              Executor disabled — use Copy prompt.
            </span>
          )}
          <button
            onClick={copyPrompt}
            disabled={!rendered}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-border text-foreground hover:bg-muted disabled:opacity-50"
          >
            <span className="material-icons" style={{ fontSize: '16px' }}>
              {copied ? 'check' : 'content_copy'}
            </span>
            {copied ? 'Copied' : 'Copy prompt'}
          </button>
          <button
            onClick={startRun}
            disabled={!executorAvailable || !requiredOk || submitting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40"
            title={
              !executorAvailable
                ? 'Executor disabled on this host'
                : !requiredOk
                  ? 'Fill all required variables'
                  : 'Run skill as headless claude -p'
            }
          >
            <span className="material-icons" style={{ fontSize: '16px' }}>
              {submitting ? 'autorenew' : 'play_arrow'}
            </span>
            {submitting ? 'Running…' : 'Run'}
          </button>
        </footer>
      </aside>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────

export default function AgenticOsPage() {
  const [data, setData] = useState<CatalogPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [recentRuns, setRecentRuns] = useState<RecentRun[]>([]);
  const [showRules, setShowRules] = useState(false);

  async function refreshCatalog() {
    try {
      const res = await fetch('/api/admin/agentic-os');
      const json = await res.json();
      if (!json?.success) {
        setError(json?.message ?? 'Failed to load catalog');
        setLoading(false);
        return;
      }
      setData(json.data);
      setRecentRuns(json.data.recentRuns ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load catalog');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshCatalog();
  }, []);

  const rulesById = useMemo(() => {
    if (!data) return {} as Record<string, AgenticOsRule>;
    return Object.fromEntries(data.rules.map((r) => [r.id, r]));
  }, [data]);

  const skillsById = useMemo(() => {
    if (!data) return {} as Record<string, CatalogSkill>;
    return Object.fromEntries(data.skills.map((s) => [s.id, s]));
  }, [data]);

  const filteredSkills = useMemo(() => {
    if (!data) return [] as CatalogSkill[];
    return data.skills.filter((s) => {
      if (filter === 'on-demand') return s.trigger === 'on-demand';
      if (filter === 'scheduled') return s.trigger === 'scheduled';
      return true;
    });
  }, [data, filter]);

  const skillsByDomainGroup = useMemo(() => {
    const out: Record<string, CatalogSkill[]> = {};
    for (const s of filteredSkills) {
      (out[s.domain] ||= []).push(s);
    }
    return out;
  }, [filteredSkills]);

  const orderedDomains = useMemo(() => {
    if (!data) return [] as string[];
    return data.domains.filter((d) => (skillsByDomainGroup[d] ?? []).length > 0);
  }, [data, skillsByDomainGroup]);

  const selectedSkill = selectedSkillId ? skillsById[selectedSkillId] : null;

  // ─── Render ───
  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="text-center py-24 text-muted-foreground">
          <span className="material-icons animate-spin text-3xl">autorenew</span>
          <p className="mt-2">Loading Agentic OS…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="bg-card border border-red-500/40 rounded-xl p-6 text-center">
          <span className="material-icons text-4xl text-red-500">error_outline</span>
          <p className="mt-2 text-foreground font-semibold">Couldn&apos;t load Agentic OS</p>
          <p className="mt-1 text-sm text-muted-foreground">{error ?? 'Unknown error.'}</p>
        </div>
      </div>
    );
  }

  const totalSkills = data.skills.length;
  const onDemandCount = data.skills.filter((s) => s.trigger === 'on-demand').length;
  const scheduledCount = data.skills.filter((s) => s.trigger === 'scheduled').length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="material-icons text-2xl text-primary">smart_toy</span>
            <h1 className="text-2xl font-bold text-foreground">Agentic OS</h1>
            {data.executorAvailable ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                <span className="material-icons" style={{ fontSize: '14px' }}>
                  bolt
                </span>
                Local executor available
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                <span className="material-icons" style={{ fontSize: '14px' }}>
                  visibility
                </span>
                Catalog mode
              </span>
            )}
          </div>
          <p className="text-muted-foreground mt-1">
            Domains, skills, automations. Fire skills as headless Claude Code runs or copy a prompt.
          </p>
          {!data.executorAvailable && data.executorHostHint && (
            <p className="text-xs text-muted-foreground mt-1 max-w-2xl">{data.executorHostHint}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowRules((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              showRules
                ? 'bg-primary text-primary-foreground'
                : 'border border-border text-muted-foreground hover:bg-accent'
            }`}
          >
            <span className="material-icons" style={{ fontSize: '16px' }}>
              gavel
            </span>
            Rules ({data.rules.length})
          </button>
          <button
            onClick={refreshCatalog}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-border text-muted-foreground hover:bg-accent"
          >
            <span className="material-icons" style={{ fontSize: '16px' }}>
              refresh
            </span>
            Refresh
          </button>
        </div>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Skills', value: totalSkills, icon: 'extension' },
          { label: 'On-demand', value: onDemandCount, icon: 'play_arrow' },
          { label: 'Scheduled', value: scheduledCount, icon: 'schedule' },
          { label: 'Succeeded', value: data.counts.succeeded ?? 0, icon: 'check_circle' },
          { label: 'Failed', value: data.counts.failed ?? 0, icon: 'error_outline' },
        ].map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-3">
            <div className="flex items-center gap-2">
              <span className="material-icons text-xl text-muted-foreground">{s.icon}</span>
              <div>
                <p className="text-xl font-bold text-foreground leading-none">{s.value}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{s.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Rules drawer (inline collapsible) */}
      {showRules && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <h2 className="font-semibold text-foreground mb-3 flex items-center gap-2">
            <span className="material-icons text-muted-foreground">gavel</span>
            Cross-cutting rules
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.rules.map((r) => (
              <div key={r.id} className="rounded-xl ring-1 ring-border bg-muted/30 p-3">
                <p className="text-sm font-semibold text-foreground">{r.title}</p>
                <p className="text-xs text-muted-foreground mt-1 font-mono">{r.id}</p>
                <p className="text-xs text-muted-foreground mt-2">{r.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {(
          [
            { id: 'all', label: 'All domains', icon: 'apps' },
            { id: 'on-demand', label: 'On-demand only', icon: 'play_arrow' },
            { id: 'scheduled', label: 'Scheduled', icon: 'schedule' },
            { id: 'history', label: 'Run history', icon: 'history' },
          ] as { id: FilterMode; label: string; icon: string }[]
        ).map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f.id
                ? 'bg-primary text-primary-foreground'
                : 'border border-border text-muted-foreground hover:bg-accent'
            }`}
          >
            <span className="material-icons" style={{ fontSize: '16px' }}>
              {f.icon}
            </span>
            {f.label}
          </button>
        ))}
      </div>

      {/* Domain sections OR history */}
      {filter === 'history' ? (
        <RunHistory runs={recentRuns} skillsById={skillsById} />
      ) : (
        <div className="space-y-8">
          {orderedDomains.length === 0 && (
            <div className="bg-card border border-border rounded-2xl p-12 text-center">
              <span className="material-icons text-5xl text-muted-foreground">filter_alt_off</span>
              <p className="mt-2 text-foreground font-semibold">No skills match this filter</p>
            </div>
          )}
          {orderedDomains.map((domain) => {
            const skills = skillsByDomainGroup[domain] ?? [];
            return (
              <section key={domain} className="space-y-3">
                <div className="flex items-baseline gap-2 border-b border-border pb-2">
                  <h2 className="font-semibold text-foreground">
                    {data.domainLabels[domain] ?? domain}
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    {skills.length} skill{skills.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {skills.map((s) => (
                    <SkillCard
                      key={s.id}
                      skill={s}
                      rulesById={rulesById}
                      onRun={(id) => setSelectedSkillId(id)}
                    />
                  ))}
                </div>
              </section>
            );
          })}

          {/* Recent runs footer (always-visible compact) */}
          <RunHistory runs={recentRuns.slice(0, 8)} skillsById={skillsById} compact />
        </div>
      )}

      {selectedSkill && (
        <RunDrawer
          skill={selectedSkill}
          executorAvailable={data.executorAvailable}
          onClose={() => setSelectedSkillId(null)}
          onRunStarted={(run) => setRecentRuns((prev) => [run, ...prev].slice(0, 50))}
        />
      )}
    </div>
  );
}

function RunHistory({
  runs,
  skillsById,
  compact,
}: {
  runs: RecentRun[];
  skillsById: Record<string, CatalogSkill>;
  compact?: boolean;
}) {
  if (runs.length === 0) {
    return (
      <div className="bg-card border border-border rounded-2xl p-8 text-center">
        <span className="material-icons text-4xl text-muted-foreground">history</span>
        <p className="mt-2 text-foreground font-semibold">No runs yet</p>
        <p className="text-sm text-muted-foreground mt-1">
          Fire a skill from the catalog above to see it logged here.
        </p>
      </div>
    );
  }
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between border-b border-border pb-2">
        <h2 className="font-semibold text-foreground">{compact ? 'Recent runs' : 'Run history'}</h2>
        <span className="text-xs text-muted-foreground">{runs.length} shown</span>
      </div>
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Skill
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Duration
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Started
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Error
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {runs.map((r) => {
              const s = skillsById[r.skillId];
              return (
                <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="material-icons text-muted-foreground" style={{ fontSize: '18px' }}>
                        {s?.icon ?? 'extension'}
                      </span>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">{s?.name ?? r.skillId}</p>
                        <p className="text-[11px] text-muted-foreground font-mono truncate">{r.skillId}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">{statusBadge(r.status)}</td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">{formatDuration(r.durationMs)}</td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs whitespace-nowrap">
                    {formatDate(r.createdAt)}
                  </td>
                  <td
                    className="px-4 py-2.5 text-muted-foreground text-xs max-w-[260px] truncate"
                    title={r.errorMessage ?? ''}
                  >
                    {r.errorMessage ?? '--'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
