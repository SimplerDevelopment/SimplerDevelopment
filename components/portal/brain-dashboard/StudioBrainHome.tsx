// Brain home under the redesign (PUX-158, design doc screen 17): "Ask your
// business anything. See what it has noticed." One gold status card from
// the summary the dashboard already computes, the newest notes, the
// decisions that need an owner (the one teal: Weigh in), and a peek at the
// active playbook run. Four reads, each degrading alone. Shaping lives in
// lib/brain/home-shape.ts (pure, tested). Server component.
import Link from 'next/link';
import { getDashboardSummary } from '@/lib/brain/dashboard';
import { listNotes } from '@/lib/brain/notes';
import { listDecisions } from '@/lib/brain/decisions';
import { listRuns } from '@/lib/brain/playbook-runs';
import { brainActiveRun, brainHomeNotes, brainNeedsOwner, brainStatusRows } from '@/lib/brain/home-shape';
import { sBtn, sBtnGhost } from '@/components/portal/portal-ui';
import { EmptyState } from '@/components/portal/EmptyState';

async function safe<T>(label: string, p: Promise<T>, fallback: T): Promise<T> {
  try { return await p; } catch (err) { console.error(`[brain-home] "${label}" failed — section skipped:`, err); return fallback; }
}

const card = 'overflow-hidden rounded-2xl border border-border bg-card';
const h3 = 'flex items-center gap-2 px-4 py-3 text-[13px] font-bold tracking-[-0.01em] text-foreground';

export default async function StudioBrainHome({ clientId }: { clientId: number }) {
  const [summary, notes, decisions, runs] = await Promise.all([
    safe('summary', getDashboardSummary(clientId), null),
    safe('notes', listNotes(clientId, { sort: 'updated', order: 'desc', limit: 5 }), []),
    safe('decisions', listDecisions(clientId, { status: 'proposed', limit: 5 }), []),
    safe('runs', listRuns(clientId, { status: 'active', limit: 1 }), []),
  ]);
  const status = brainStatusRows(summary);
  const recent = brainHomeNotes(notes);
  const needsOwner = brainNeedsOwner(decisions);
  const run = brainActiveRun(runs);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5">
        {/* Gold means the Brain: the only tinted surface on the page. */}
        <section className="overflow-hidden rounded-2xl border border-[var(--studio-gold-line)] bg-[var(--studio-gold-surface)]">
          <h2 className={h3}><span className="material-icons text-[17px] text-[var(--studio-gold-ink)]">psychology</span>What it&apos;s holding for you</h2>
          <Link href="/portal/brain/agent" className="mx-4 mb-3 flex items-center gap-2 rounded-xl border border-[var(--studio-gold-line)] bg-card px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
            <span className="material-icons text-base text-[var(--studio-gold-ink)]">auto_awesome</span>Ask anything about your business…
          </Link>
          {status.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">Nothing needs a look right now — it will say so here the moment something does.</p>
          ) : status.map((r) => (
            <Link key={r.label} href={r.href} className="flex items-start gap-3 border-t border-[var(--studio-gold-line)] px-4 py-2.5 hover:bg-card/60">
              <span className="material-icons mt-0.5 text-base text-[var(--studio-gold-ink)]">{r.icon}</span>
              <span className="min-w-0"><b className="block text-sm font-semibold text-foreground">{r.label}</b><small className="block truncate text-xs text-muted-foreground">{r.detail}</small></span>
            </Link>
          ))}
        </section>

        <section className={card}>
          <h2 className={h3}><span className="material-icons text-[17px] text-muted-foreground">sticky_note_2</span>Recent notes<Link href="/portal/brain/knowledge" className="ml-auto text-xs font-normal text-muted-foreground hover:text-foreground">All knowledge</Link></h2>
          {recent.length === 0 ? (
            <EmptyState className="border-t border-border px-4 py-4" title="Your first call, doc or web page lands here." body="Paste notes, drop a recording, or connect a folder — the Brain reads it and files it by topic." cta={{ label: 'New note', href: '/portal/brain/knowledge?new=1' }} ghostLabel="Call · Doc · Meeting · Web" />
          ) : recent.map((n) => (
            <Link key={n.id} href={n.href} className="flex items-center gap-3 border-t border-border px-4 py-2.5 hover:bg-muted/50">
              <span className="material-icons text-base text-muted-foreground">{n.icon}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm text-foreground">{n.title}</span><small className="block text-xs text-muted-foreground">{n.type} · {n.when}</small></span>
              {n.needsReview ? <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-[var(--studio-gold-soft)] text-[var(--studio-gold-ink)]">Needs review</span> : <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{n.type}</span>}
            </Link>
          ))}
        </section>
      </div>

      <div className="space-y-5">
        <section className={card}>
          <h2 className={h3}><span className="material-icons text-[17px] text-muted-foreground">flag</span>Needs an owner</h2>
          {needsOwner.length === 0 ? (
            <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground">No decision is waiting for someone to own it.</p>
          ) : (
            <>
              {needsOwner.map((d) => (
                <Link key={d.id} href={d.href} className="flex items-start gap-3 border-t border-border px-4 py-2.5 hover:bg-muted/50">
                  <span className="material-icons mt-0.5 text-base text-[var(--studio-gold-ink)]">psychology</span>
                  <span className="min-w-0"><b className="block text-sm font-medium text-foreground">{d.title}</b><small className="block text-xs text-muted-foreground">{d.owned ? 'proposed' : 'no owner set'} · {d.when}</small></span>
                </Link>
              ))}
              <div className="border-t border-border px-4 py-3"><Link href={needsOwner[0].href} className={sBtn}>Weigh in</Link></div>
            </>
          )}
        </section>

        {run && (
          <section className={card}>
            <h2 className={h3}><span className="material-icons text-[17px] text-muted-foreground">account_tree</span><span className="truncate">{run.name}</span><span className="ml-auto font-mono text-[11px] font-normal text-muted-foreground">step {Math.min(run.done + 1, run.total)} of {run.total}</span></h2>
            <div className="border-t border-border px-4 py-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-muted"><i className="block h-full bg-[var(--studio-gold)]" style={{ width: `${run.total ? Math.round((run.done / run.total) * 100) : 0}%` }} /></div>
              <Link href={run.href} className={`${sBtnGhost} mt-3`}>Open the run</Link>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
