'use client';

/**
 * Playbook run detail.
 *
 * Layout:
 *   [back to list]
 *   ┌────────────────────────────────────────────────────────────────────────┐
 *   │ Header: label + status + playbook link + startedBy + timing            │
 *   │                        Actions: Advance / Abort / Retry                │
 *   ├────────────────────────────────────────────────────────────────────────┤
 *   │ Context (pretty-printed JSON)                                          │
 *   │ Step stepper (PlaybookRunStepper) with inline Mark-complete / Skip     │
 *   │ Links — entity chips                                                   │
 *   └────────────────────────────────────────────────────────────────────────┘
 */

import { useCallback, useEffect, useState, use as reactUse } from 'react';
import Link from 'next/link';
import PlaybookRunStepper from '@/components/brain/PlaybookRunStepper';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnGhost, pBtnSoft, pChip } from '@/components/portal/portal-ui';
import {
  playbookLinkEntityMeta,
  playbookRunStatusChip,
  relativeTime,
  durationBetween,
  type PlaybookRow,
  type PlaybookRunDetailStep,
  type PlaybookRunLink,
  type PlaybookRunRow,
} from '@/components/brain/playbooks-shared';

interface RunDetailResponse {
  run: PlaybookRunRow;
  playbook: PlaybookRow;
  steps: PlaybookRunDetailStep[];
  links: PlaybookRunLink[];
}

export default function PlaybookRunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = reactUse(params);
  const runId = parseInt(id, 10);

  const [data, setData] = useState<RunDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isFinite(runId) || runId <= 0) {
      setError('Invalid run id');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/portal/brain/playbook-runs/${runId}`);
      const json = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'Failed to load run');
        return;
      }
      setData(json.data as RunDetailResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    load();
  }, [load]);

  // ─── actions ──────────────────────────────────────────────────────────────

  const onAdvance = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/portal/brain/playbook-runs/${runId}/advance`, {
        method: 'POST',
      });
      const json = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'Advance failed');
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }, [runId, load]);

  const onAbort = useCallback(async () => {
    const reason = window.prompt('Reason for aborting? (optional)') ?? null;
    if (reason === null && !confirm('Abort this run? It cannot be resumed.')) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/portal/brain/playbook-runs/${runId}/abort`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || undefined }),
      });
      const json = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'Abort failed');
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }, [runId, load]);

  // The advance endpoint also handles the implicit "retry" flow (it picks up
  // any pending steps the lib reset on retry). We POST to /advance after
  // surfacing the "Retry" UX rather than building a dedicated /retry route
  // — that's a backend Wave-2b consideration noted in PLAN.md.
  const onRetry = onAdvance;

  const onComplete = useCallback(
    async (stepId: number) => {
      setBusy(true);
      setError(null);
      try {
        const r = await fetch(
          `/api/portal/brain/playbook-runs/${runId}/steps/${stepId}/complete`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          },
        );
        const json = await r.json();
        if (!r.ok || !json.success) {
          setError(json.message || 'Complete step failed');
          return;
        }
        await load();
      } finally {
        setBusy(false);
      }
    },
    [runId, load],
  );

  const onSkip = useCallback(
    async (stepId: number, reason?: string) => {
      setBusy(true);
      setError(null);
      try {
        const r = await fetch(
          `/api/portal/brain/playbook-runs/${runId}/steps/${stepId}/skip`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: reason || undefined }),
          },
        );
        const json = await r.json();
        if (!r.ok || !json.success) {
          setError(json.message || 'Skip step failed');
          return;
        }
        await load();
      } finally {
        setBusy(false);
      }
    },
    [runId, load],
  );

  // ─── render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-16 flex items-center justify-center text-muted-foreground">
        <span className="material-icons animate-spin mr-2">progress_activity</span>
        Loading…
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="max-w-4xl mx-auto py-8">
        <Link
          href="/portal/brain/playbook-runs"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <span className="material-icons text-sm">chevron_left</span>
          Playbook runs
        </Link>
        <div className="mt-4 bg-destructive/10 border border-destructive/30 rounded-2xl p-4 text-sm text-destructive flex items-center gap-2">
          <span className="material-icons text-base">error_outline</span>
          {error || 'Run not found'}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { run, playbook, steps, links } = data;
  const status = playbookRunStatusChip(run.status);
  const duration =
    run.completedAt && run.startedAt ? durationBetween(run.startedAt, run.completedAt) : null;
  const isLive = run.status === 'active' || run.status === 'paused';
  const isFailed = run.status === 'failed';
  const isTerminal =
    run.status === 'completed' || run.status === 'aborted' || run.status === 'failed';

  const contextEntries = Object.entries(run.context ?? {});

  return (
    <div className="max-w-4xl mx-auto py-4 space-y-6">
      <Link
        href="/portal/brain/playbook-runs"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <span className="material-icons text-sm">chevron_left</span>
        Playbook runs
      </Link>

      <div className="bg-card border border-border rounded-2xl p-5">
        <PortalPageHeader
          eyebrow="Company Brain"
          title={
            <span className="flex items-center gap-2">
              {run.label}
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${status.className}`}>
                <span className="material-icons text-[14px]">{status.icon}</span>
                {status.label}
              </span>
            </span>
          }
          subtitle={
            <span className="flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
              <Link
                href={`/portal/brain/playbooks/${playbook.id}`}
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                <span className="material-icons text-base">play_circle</span>
                {playbook.name}
              </Link>
              {run.startedBy && (
                <span className="inline-flex items-center gap-1">
                  <span className="material-icons text-base">person</span>
                  started by user #{run.startedBy}
                </span>
              )}
              {run.startedAt && (
                <span className="inline-flex items-center gap-1">
                  <span className="material-icons text-base">schedule</span>
                  started {relativeTime(run.startedAt, { signed: true })}
                </span>
              )}
              {duration && (
                <span className="inline-flex items-center gap-1">
                  <span className="material-icons text-base">timer</span>
                  duration {duration}
                </span>
              )}
            </span>
          }
          actions={
            <div className="flex items-center gap-2 flex-wrap">
              {isLive && (
                <button
                  type="button"
                  onClick={onAdvance}
                  disabled={busy}
                  title="Resolve any branch / completed steps and chain forward"
                  className={pBtnGhost}
                >
                  <span className="material-icons text-sm">play_arrow</span>
                  Advance
                </button>
              )}
              {!isTerminal && (
                <button
                  type="button"
                  onClick={onAbort}
                  disabled={busy}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-muted-foreground transition hover:border-destructive/50 hover:text-destructive hover:bg-destructive/10 disabled:opacity-50"
                >
                  <span className="material-icons text-sm">cancel</span>
                  Abort
                </button>
              )}
              {isFailed && (
                <button
                  type="button"
                  onClick={onRetry}
                  disabled={busy}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-700 dark:text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
                >
                  <span className="material-icons text-sm">restart_alt</span>
                  Retry
                </button>
              )}
            </div>
          }
        />
        {run.abortReason && (
          <div className="mt-4 bg-muted/30 border border-border rounded-xl p-3 text-xs text-muted-foreground">
            <span className="material-icons text-sm align-middle mr-1">cancel</span>
            Aborted: {run.abortReason}
          </div>
        )}

        {error && (
          <div className="mt-4 bg-destructive/10 border border-destructive/30 rounded-xl p-3 text-xs text-destructive">
            <span className="material-icons text-sm align-middle mr-1">error_outline</span>
            {error}
          </div>
        )}
      </div>

      {/* Context */}
      <section className="bg-card border border-border rounded-2xl p-5">
        <h2 className="font-display text-[17px] font-extrabold tracking-[-0.02em] text-foreground inline-flex items-center gap-2">
          <span className="material-icons text-base text-primary">data_object</span>
          Context
        </h2>
        {contextEntries.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground italic">
            No context variables were seeded for this run.
          </p>
        ) : (
          <div className="mt-3 rounded-md border border-border bg-muted/30 p-3 overflow-auto">
            <pre className="text-[12px] font-mono text-foreground/90 whitespace-pre">
              {JSON.stringify(run.context, null, 2)}
            </pre>
          </div>
        )}
      </section>

      {/* Steps */}
      <section className="bg-card border border-border rounded-2xl p-5">
        <h2 className="font-display text-[17px] font-extrabold tracking-[-0.02em] text-foreground inline-flex items-center gap-2">
          <span className="material-icons text-base text-primary">account_tree</span>
          Steps
          <span className="text-xs text-muted-foreground font-normal">({steps.length})</span>
        </h2>
        <div className="mt-4">
          <PlaybookRunStepper
            steps={steps}
            onComplete={isLive ? onComplete : undefined}
            onSkip={isLive ? onSkip : undefined}
            busy={busy}
          />
        </div>
      </section>

      {/* Links */}
      {links.length > 0 && (
        <section className="bg-card border border-border rounded-2xl p-5">
          <h2 className="font-display text-[17px] font-extrabold tracking-[-0.02em] text-foreground inline-flex items-center gap-2">
            <span className="material-icons text-base text-primary">link</span>
            Linked entities
            <span className="text-xs text-muted-foreground font-normal">({links.length})</span>
          </h2>
          <div className="mt-3 flex items-center gap-1.5 flex-wrap">
            {links.map((l) => {
              const meta = playbookLinkEntityMeta(l.entityType);
              return (
                <span
                  key={l.id}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1 text-[12px] font-semibold text-muted-foreground"
                  title={`${meta.label} #${l.entityId}`}
                >
                  <span className="material-icons text-[14px]">{meta.icon}</span>
                  {meta.label} #{l.entityId}
                </span>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
