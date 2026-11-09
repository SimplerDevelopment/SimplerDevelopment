'use client';

/**
 * PUX-164 (design doc screen 23): the active run beside its playbook.
 *
 * Studio-only — the caller gates on useFeatureFlag('portal-redesign'). Uses
 * two existing reads (GET /api/portal/brain/playbook-runs?playbookId=&status=active,
 * then GET /api/portal/brain/playbook-runs/[id], which embeds the steps with
 * their names) and the two existing writes (POST …/steps/[stepId]/complete
 * and …/skip) on the current step. "Current step" is derived — the run row
 * stores none, and a parallel branch can have several active steps — so the
 * panel acts on the first active one; the run page's stepper handles the rest.
 * ponytail: two fetches per running playbook; fold into the list API if boards grow.
 * ponytail: Skip sends no reason here; the run page's stepper still prompts for one.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { sBtn, sBtnGhost } from '@/components/portal/portal-ui';

interface RunView {
  run: { id: number; label: string | null; status: string; startedAt: string | null; startedBy: number | null };
  playbook: { id: number; name: string };
  steps: { id: number; stepId: number; name: string; status: string }[];
}

const STEP_ICON: Record<string, string> = {
  completed: 'check_circle', skipped: 'remove_circle_outline', failed: 'error',
  active: 'radio_button_checked', pending: 'radio_button_unchecked',
};

export function stepOfLabel(steps: { status: string }[]): string {
  const i = steps.findIndex((s) => s.status === 'active');
  if (i !== -1) return `Step ${i + 1} of ${steps.length}`;
  return steps.length ? 'Waiting' : 'No steps';
}

export default function ActiveRunPanel({
  playbookId, owners,
}: {
  playbookId: number;
  owners?: Record<number, { name: string | null; email: string } | undefined>;
}) {
  const [view, setView] = useState<RunView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);

  // setState only after awaits inside the IIFE (react-hooks/set-state-in-effect).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/portal/brain/playbook-runs?playbookId=${playbookId}&status=active&limit=1`);
        const json = await r.json();
        const first = json?.data?.items?.[0];
        if (cancelled) return;
        if (!r.ok || !json.success || !first) { setGone(true); return; }
        const d = await fetch(`/api/portal/brain/playbook-runs/${first.id}`);
        const dj = await d.json();
        if (cancelled) return;
        if (!d.ok || !dj.success) { setGone(true); return; }
        setView(dj.data as RunView);
      } catch {
        if (!cancelled) setError('Could not load the run.');
      }
    })();
    return () => { cancelled = true; };
  }, [playbookId, reloadKey]);

  const current = view?.steps.find((s) => s.status === 'active');

  async function act(kind: 'complete' | 'skip') {
    if (!view || !current) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/portal/brain/playbook-runs/${view.run.id}/steps/${current.stepId}/${kind}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      const json = await r.json();
      if (!r.ok || !json.success) throw new Error(json.message || `Could not ${kind} the step.`);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setBusy(false);
    }
  }

  if (gone || !view) return null;
  const by = view.run.startedBy != null ? owners?.[view.run.startedBy]?.name : null;
  const started = view.run.startedAt
    ? new Date(view.run.startedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    : null;

  return (
    <section className="rounded-2xl border border-border bg-card p-4" aria-label={`Active run: ${view.playbook.name}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/portal/brain/playbook-runs/${view.run.id}`} className="block truncate font-display text-sm font-semibold text-foreground hover:underline">
            {view.playbook.name}
          </Link>
          <p className="text-xs text-muted-foreground">
            {stepOfLabel(view.steps)}{started ? ` · Started ${started}` : ''}{by ? ` by ${by}` : ''}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-[var(--portal-ok-bg)] px-2 py-0.5 text-[11px] font-semibold text-[var(--portal-ok)]">Running</span>
      </div>
      <ol className="mt-3 space-y-1.5">
        {view.steps.map((s) => (
          <li
            key={s.id}
            className={`flex items-center gap-2 text-sm ${s.status === 'active' ? 'font-medium text-foreground' : 'text-muted-foreground'}`}
          >
            <span className={`material-icons text-[18px] ${s.status === 'completed' ? 'text-[var(--portal-ok)]' : s.status === 'active' ? 'text-primary' : ''}`}>
              {STEP_ICON[s.status] ?? 'radio_button_unchecked'}
            </span>
            <span className="truncate">{s.name}</span>
          </li>
        ))}
      </ol>
      {current && (
        <div className="mt-3 flex items-center gap-2">
          <button type="button" disabled={busy} onClick={() => act('complete')} className={`${sBtn} disabled:opacity-50`}>
            <span className="material-icons text-base">check</span>
            Complete step
          </button>
          <button type="button" disabled={busy} onClick={() => act('skip')} className={`${sBtnGhost} disabled:opacity-50`}>
            Skip
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </section>
  );
}
