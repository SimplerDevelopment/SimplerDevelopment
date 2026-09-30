'use client';

/**
 * PUX-200 (design doc screen 59): one approval, end to end. Reads the
 * existing GET /api/portal/approvals/[id], shows the change as the same
 * before/after DiffViewer the list uses, takes a note BEFORE the decision
 * (both approve and reject routes already accept `note`), and confirms in
 * place. No post-preview surface exists anywhere, so the preview column is
 * an honest ghost — rendering a staged payload without applying it is new
 * infrastructure, not this card. Flag off: back to the list with ?id=.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useFeatureFlag } from '@/components/portal/FeatureFlagsProvider';
import { DiffViewer } from '@/components/portal/approvals/DiffViewer';
import { GhostCard } from '@/components/portal/EmptyState';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pInput, sBtn, sBtnGhost } from '@/components/portal/portal-ui';
import { entityLabel } from '@/lib/approvals/entity-label';
import { relativeTime } from '@/lib/notifications/feed';

interface Detail {
  change: { id: number; entityType: string; entityId: number | null; operation: string; summary: string | null; status: string; createdAt: string; reviewNote: string | null; reviewedAt: string | null; payload: unknown; originalSnapshot: unknown };
  keyName: string | null;
  submitterName: string | null;
}

const PILL: Record<string, string> = {
  pending: 'bg-[var(--studio-gold-surface)] text-[var(--studio-gold-ink)]',
  approved: 'bg-[var(--portal-ok-bg)] text-[var(--portal-ok)]',
  applied: 'bg-[var(--portal-ok-bg)] text-[var(--portal-ok)]',
  rejected: 'bg-[var(--portal-warn-bg)] text-[var(--portal-warn)]',
};

export default function ApprovalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const studio = useFeatureFlag('portal-redesign');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);

  useEffect(() => {
    if (!studio) { window.location.replace(`/portal/approvals?id=${id}`); return; } // flag off: the list's own detail pane
    let cancelled = false;
    fetch(`/api/portal/approvals/${id}`)
      .then((r) => r.json())
      .then((d) => { if (cancelled) return; if (d.success) setDetail(d.data); else setError(d.message || 'Not found'); })
      .catch(() => { if (!cancelled) setError('Could not load this approval'); });
    return () => { cancelled = true; };
  }, [id, studio]);

  const decide = async (action: 'approve' | 'reject') => {
    if (!detail) return;
    setBusy(action); setError(null);
    try {
      const res = await fetch(`/api/portal/approvals/${detail.change.id}/${action}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: note.trim() || null }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || d.success === false) throw new Error(d.message || `Could not ${action}`);
      const status = action === 'approve' ? 'approved' : 'rejected';
      setDetail({ ...detail, change: { ...detail.change, status, reviewNote: note.trim() || null, reviewedAt: new Date().toISOString() } });
      setOutcome(action === 'approve' ? 'Approved — the change is being applied.' : 'Rejected — nothing was changed.');
    } catch (e) {
      setError(e instanceof Error ? e.message : `Could not ${action}`);
    } finally {
      setBusy(null);
    }
  };

  if (!studio) return null;
  if (error && !detail) return <p className="mx-auto max-w-4xl text-sm text-destructive">{error}</p>;
  if (!detail) return <p className="mx-auto max-w-4xl text-sm text-muted-foreground">Loading…</p>;

  const c = detail.change;
  const pending = c.status === 'pending';
  const title = c.summary || `${entityLabel(c.entityType)} · ${c.operation}`;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/portal/approvals" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><span className="material-icons text-base">arrow_back</span>Approvals</Link>
      <PortalPageHeader
        eyebrow="Approval"
        title={<span className="inline-flex flex-wrap items-center gap-3">{title}<span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${PILL[c.status] ?? 'bg-muted text-muted-foreground'}`}>{c.status}</span></span>}
        subtitle={`${entityLabel(c.entityType)}${c.entityId ? ` #${c.entityId}` : ''} · asked by ${detail.submitterName ?? detail.keyName ?? 'an MCP key'} ${relativeTime(c.createdAt)}`}
      />

      {outcome && (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-border bg-card p-3 text-sm text-foreground">
          <span className="material-icons text-base text-[var(--portal-ok)]">check_circle</span>{outcome}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="space-y-6">
          <GhostCard icon="preview" title="Preview of the change" body="A rendered preview needs a way to draw a staged payload without applying it — nothing in the portal does that yet. The diff below is the whole change." />
          <section className="rounded-2xl border border-border bg-card p-5" aria-label="What changes">
            <h2 className="font-display text-[11px] font-semibold uppercase tracking-[.08em] text-muted-foreground">What changes</h2>
            <div className="mt-3"><DiffViewer before={c.originalSnapshot} after={c.payload} /></div>
          </section>
        </div>
        <aside className="space-y-4">
          <section className="rounded-2xl border border-border bg-card p-5" aria-label="Decision">
            <label className="block text-sm font-medium text-foreground" htmlFor="approval-note">Note</label>
            <textarea id="approval-note" value={pending ? note : (c.reviewNote ?? '')} onChange={(e) => setNote(e.target.value)} disabled={!pending} rows={4}
              placeholder="Why you approved or what to change — saved with either decision." className={`${pInput} mt-1.5 resize-y`} />
            {pending ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => decide('approve')} disabled={busy !== null} className={`${sBtn} disabled:opacity-50`}>{busy === 'approve' ? 'Approving…' : 'Approve'}</button>
                <button type="button" onClick={() => decide('reject')} disabled={busy !== null} className={`${sBtnGhost} disabled:opacity-50`}>{busy === 'reject' ? 'Rejecting…' : 'Reject'}</button>
              </div>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">Decided {c.reviewedAt ? relativeTime(c.reviewedAt) : ''}.</p>
            )}
            {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}
