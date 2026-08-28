'use client';

/**
 * PUX-172 (design doc screen 31): a deal as a page. The stage stepper is the
 * header (PUT /api/portal/crm/deals/[id] {stageId} via api.moveDealStage —
 * the same call the board's drag uses), artifacts pinned-first (the route
 * already orders pinned DESC) with Add as the page's one teal, comments
 * beside them, details to the right. Edit reopens today's drawer via
 * ?dealId= rather than duplicating its form. Reads/writes are all the
 * drawer's existing _lib/api functions; DealDetailDrawer.tsx is untouched.
 * Probability shown is the stage's — no per-deal probability or "next step"
 * column exists on crm_deals.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import * as api from '../../_lib/api';
import { ARTIFACT_ICONS, ARTIFACT_LABELS, artifactUrl } from '../../_lib/ui';
import { stageSteps } from '../../_lib/stepper';
import type { Artifact, AvailableArtifact, Comment, Deal, Pipeline } from '../../_lib/types';
import { formatMoney } from '@/lib/utils/money';
import { relativeTime } from '@/lib/notifications/feed';
import { sBtn, sBtnGhost } from '@/components/portal/portal-ui';
import { GhostCard } from '@/components/portal/EmptyState';

const STEP: Record<'done' | 'current' | 'todo', string> = {
  done: 'bg-foreground text-background',
  current: 'bg-primary text-primary-foreground',
  todo: 'border border-border text-muted-foreground hover:border-[var(--studio-line-strong)]',
};

const initials = (name: string | null) => (name ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';

export default function DealPage({ id }: { id: number }) {
  const router = useRouter();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [available, setAvailable] = useState<AvailableArtifact[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [dealRes, p, a, av, c] = await Promise.all([
          fetch(`/api/portal/crm/deals/${id}`).then((r) => r.json()),
          api.fetchPipelines(), api.fetchArtifacts(id), api.fetchAvailableArtifacts(id), api.fetchComments(id),
        ]);
        if (cancelled) return;
        if (!dealRes?.success) { setError(dealRes?.message || 'Deal not found.'); return; }
        setDeal(dealRes.data as Deal); setPipelines(p); setArtifacts(a); setAvailable(av); setComments(c);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Network error');
      }
    })();
    return () => { cancelled = true; };
  }, [id, reloadKey]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try { await fn(); reload(); } catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong'); } finally { setBusy(false); }
  }

  if (error && !deal) return <div className="p-6 text-sm text-destructive">{error}</div>;
  if (!deal) return null;

  const stages = pipelines.find((p) => p.id === deal.pipelineId)?.stages ?? [];
  const steps = stageSteps(stages, deal.stageId);
  const current = steps.find((s) => s.state === 'current')?.stage;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/portal/crm/deals" className="text-xs text-muted-foreground hover:text-foreground">← Deals</Link>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">
              {formatMoney(deal.value)}{deal.expectedCloseDate ? ` · closes ${new Date(deal.expectedCloseDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : ''}
            </p>
            <h1 className="font-display text-[22px] font-extrabold tracking-[-0.02em] text-foreground">{deal.title}</h1>
          </div>
          <div className="flex gap-2">
            <Link href={`/portal/crm/deals?dealId=${deal.id}`} className={sBtnGhost}><span className="material-icons text-base">edit</span>Edit</Link>
            <button type="button" disabled={busy} className={`${sBtnGhost} text-destructive`} onClick={() => { if (window.confirm('Delete this deal?')) void run(async () => { await api.deleteDeal(deal.id); router.push('/portal/crm/deals'); }); }}>
              <span className="material-icons text-base">delete</span>Delete
            </button>
          </div>
        </div>
        <ol className="mt-4 flex flex-wrap gap-2" aria-label="Stage">
          {steps.map(({ stage, state }, i) => (
            <li key={stage.id}>
              <button
                type="button"
                aria-current={state === 'current' ? 'step' : undefined}
                disabled={busy || state === 'current'}
                onClick={() => run(() => api.moveDealStage(deal.id, stage.id))}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-semibold transition-colors disabled:cursor-default ${STEP[state]}`}
              >
                <span className="tabular-nums opacity-70">{i + 1}</span>{stage.name}
              </button>
            </li>
          ))}
        </ol>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 font-display text-sm font-semibold text-foreground"><span className="material-icons text-base text-muted-foreground">description</span>Artifacts</h2>
              <button type="button" onClick={() => setPicking((p) => !p)} className={picking ? sBtnGhost : sBtn}><span className="material-icons text-base">{picking ? 'close' : 'add'}</span>{picking ? 'Cancel' : 'Add artifact'}</button>
            </div>
            {picking && (
              <ul className="mb-3 max-h-56 divide-y divide-border overflow-y-auto rounded-xl border border-border">
                {available.length === 0 && <li className="px-3 py-2 text-xs text-muted-foreground">Nothing left to link.</li>}
                {available.map((a) => (
                  <li key={`${a.type}-${a.id}`}>
                    <button type="button" disabled={busy} onClick={() => { setPicking(false); void run(() => api.addArtifact(deal.id, a.type, a.id)); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent/60">
                      <span className="material-icons text-base text-muted-foreground">{ARTIFACT_ICONS[a.type] ?? 'attachment'}</span>
                      <span className="truncate">{a.title}</span>
                      <span className="ml-auto text-[11px] text-muted-foreground">{ARTIFACT_LABELS[a.type] ?? a.type}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {artifacts.length === 0 ? (
              <GhostCard icon="attach_file" title="No artifacts yet" body="Link the proposal, deck or contract this deal rides on." onClick={() => setPicking(true)} />
            ) : (
              <ul className="divide-y divide-border">
                {artifacts.map((a) => {
                  const href = artifactUrl(a.artifactType, a.artifactId);
                  return (
                    <li key={a.id} className="flex items-center gap-2 py-2">
                      <button type="button" disabled={busy} title={a.pinned ? 'Unpin' : 'Pin'} onClick={() => run(() => api.updateArtifactPin(deal.id, a.id, !a.pinned))} className={`material-icons text-base ${a.pinned ? 'text-[var(--studio-gold-ink)]' : 'text-muted-foreground/50 hover:text-foreground'}`}>push_pin</button>
                      <span className="material-icons text-base text-muted-foreground">{ARTIFACT_ICONS[a.artifactType] ?? 'attachment'}</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{a.displayTitle}</span>
                      <span className="text-[11px] text-muted-foreground">{ARTIFACT_LABELS[a.artifactType] ?? a.artifactType}</span>
                      {href && <Link href={href} className="material-icons text-base text-muted-foreground hover:text-foreground" title="Open">open_in_new</Link>}
                      <button type="button" disabled={busy} title="Unlink" onClick={() => run(() => api.removeArtifact(deal.id, a.id))} className="material-icons text-base text-muted-foreground/50 hover:text-destructive">close</button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="mb-3 flex items-center gap-1.5 font-display text-sm font-semibold text-foreground"><span className="material-icons text-base text-muted-foreground">forum</span>Comments</h2>
            <ul className="space-y-3">
              {comments.map((c) => (
                <li key={c.id} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">{initials(c.authorName)}</span>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{c.authorName ?? 'Someone'}</span> · {relativeTime(c.createdAt)}</p>
                    <p className="whitespace-pre-wrap text-sm text-foreground">{c.body}</p>
                  </div>
                </li>
              ))}
            </ul>
            <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); const body = draft.trim(); if (!body) return; setDraft(''); void run(() => api.postComment(deal.id, body, [])); }}>
              <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a comment…" aria-label="Comment" className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
              <button type="submit" disabled={busy || !draft.trim()} className={`${sBtnGhost} disabled:opacity-50`}>Post</button>
            </form>
          </section>
        </div>

        <aside className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-3 flex items-center gap-1.5 font-display text-sm font-semibold text-foreground"><span className="material-icons text-base text-muted-foreground">info</span>Details</h2>
          <dl className="space-y-2 text-sm">
            {[
              ['Contact', deal.contactId ? <Link key="c" href={`/portal/crm/contacts/${deal.contactId}`} className="text-foreground hover:underline">{deal.contactName}</Link> : '—'],
              ['Company', deal.companyName ?? '—'],
              ['Owner', deal.ownerName ?? '—'],
              ['Stage probability', current ? `${current.probability}%` : '—'],
              ['Status', deal.status],
              ['Priority', deal.priority],
            ].map(([k, v]) => (
              <div key={String(k)} className="flex justify-between gap-3"><dt className="text-muted-foreground">{k}</dt><dd className="text-right capitalize text-foreground">{v}</dd></div>
            ))}
          </dl>
        </aside>
      </div>
    </div>
  );
}
