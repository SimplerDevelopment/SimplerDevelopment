'use client';

/**
 * PUX-213 (design doc screen 77): a real room for "Automations" instead of
 * a redirect into the Brain's builder. Three cards over what exists — the
 * builder, workflows (which do not execute yet; the list's own warning is
 * kept verbatim, no invented run counts) and trigger links (whose one real
 * action is copying the /go/<slug> URL). Nothing here is primary, so no teal.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { sBtnGhost } from '@/components/portal/portal-ui';
import { relativeTime } from '@/lib/notifications/feed';

type Workflow = { id: number; name: string; status: 'draft' | 'active' | 'paused'; trigger: { kind: string }; updatedAt: string };
type TriggerLink = { id: number; slug: string; destinationUrl: string; label: string | null; contactFieldKey: string | null; clickCount: number };

const STATUS: Record<Workflow['status'], string> = {
  active: 'bg-[var(--portal-ok-bg)] text-[var(--portal-ok)]',
  paused: 'bg-[var(--portal-warn-bg)] text-[var(--portal-warn)]',
  draft: 'bg-muted text-muted-foreground',
};

export default function AutomationsHub() {
  const [workflows, setWorkflows] = useState<Workflow[] | null>(null);
  const [links, setLinks] = useState<TriggerLink[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    const j = (r: Response) => (r.ok ? r.json() : null);
    fetch('/api/portal/workflows').then(j).then((d) => { if (!cancelled) setWorkflows(d?.data ?? []); }).catch(() => { if (!cancelled) setWorkflows([]); });
    fetch('/api/portal/trigger-links').then(j).then((d) => { if (!cancelled) setLinks(d?.data?.links ?? []); }).catch(() => { if (!cancelled) setLinks([]); });
    return () => { cancelled = true; };
  }, []);
  const copy = (slug: string) => { void navigator.clipboard?.writeText(`${window.location.origin}/go/${slug}`); };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Link href="/portal/brain/automations" className="rounded-2xl border border-border bg-card p-5 transition-colors hover:border-[var(--studio-line-strong)] lg:col-span-2" aria-label="Rules builder">
        <p className="font-display text-[11px] font-semibold uppercase tracking-[.08em] text-muted-foreground">Rules</p>
        <h2 className="mt-1 font-display text-lg font-extrabold tracking-[-0.01em] text-foreground">Trigger-to-action rules that run today</h2>
        <p className="mt-1 text-sm text-muted-foreground">The builder that used to hide behind this nav item — schedules, event triggers and plugin scripts. Open it →</p>
      </Link>

      <section className="rounded-2xl border border-border bg-card p-5" aria-label="Workflows">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-[11px] font-semibold uppercase tracking-[.08em] text-muted-foreground">Workflows</h2>
          <Link href="/portal/automations/workflows" className={`${sBtnGhost} !py-1`}>Open workflows</Link>
        </div>
        <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
          <span className="font-semibold">Beta — workflows do not execute yet.</span> You can build and save workflow graphs, but activating a workflow has no runtime effect. Use <strong>Automations</strong> (Rules) for live trigger-to-action rules today.
        </p>
        {workflows === null ? <p className="mt-3 text-xs text-muted-foreground">Loading…</p> : workflows.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No workflows yet.</p> : (
          <ul className="mt-3 divide-y divide-border">
            {workflows.map((w) => (
              <li key={w.id} className="flex items-center gap-3 py-2 text-sm">
                <Link href={`/portal/automations/workflows/${w.id}`} className="min-w-0 flex-1 truncate font-medium text-foreground hover:underline">{w.name}</Link>
                <span className="text-xs text-muted-foreground">{w.trigger?.kind ?? '—'}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS[w.status] ?? STATUS.draft}`}>{w.status}</span>
                <span className="w-16 text-right text-xs tabular-nums text-muted-foreground">{relativeTime(w.updatedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5" aria-label="Trigger links">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-[11px] font-semibold uppercase tracking-[.08em] text-muted-foreground">Trigger links</h2>
          <Link href="/portal/automations/trigger-links" className={`${sBtnGhost} !py-1`}>Manage links</Link>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Opening a link tags the contact&apos;s field it names, then forwards. Firing a playbook from a click isn&apos;t wired yet.</p>
        {links === null ? <p className="mt-3 text-xs text-muted-foreground">Loading…</p> : links.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No trigger links yet.</p> : (
          <ul className="mt-3 divide-y divide-border">
            {links.map((l) => (
              <li key={l.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">{l.label || l.slug}</span>
                  <span className="block truncate text-xs text-muted-foreground">/go/{l.slug} → {l.destinationUrl}{l.contactFieldKey ? ` · tags ${l.contactFieldKey}` : ''}</span>
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">{l.clickCount} {l.clickCount === 1 ? 'click' : 'clicks'}</span>
                <button type="button" onClick={() => copy(l.slug)} aria-label={`Copy link ${l.slug}`} title="Copy public link" className="text-muted-foreground hover:text-foreground"><span className="material-icons text-base">content_copy</span></button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
