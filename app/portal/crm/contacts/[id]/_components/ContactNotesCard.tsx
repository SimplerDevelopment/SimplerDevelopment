'use client';

/**
 * PUX-170 (design doc screen 29): "Brain knows" — Brain notes linked to this
 * contact (brain_notes.contact_id) via the existing
 * GET /api/portal/brain/knowledge?contactId=. The route is Brain-entitlement
 * gated (402 for tenants without Brain) — then this renders nothing rather
 * than an upsell. `mode="card"` is the right-column summary; `mode="tab"` is
 * the Notes tab. Studio-only; the page gates on the flag.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';

interface NoteRow { id: number; title: string; updatedAt: string; needsReview: boolean }

export default function ContactNotesCard({ contactId, firstName, mode = 'card' }: { contactId: string; firstName: string; mode?: 'card' | 'tab' }) {
  const [notes, setNotes] = useState<NoteRow[] | null>(null);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/portal/brain/knowledge?contactId=${contactId}&limit=${mode === 'card' ? 3 : 50}`);
        const d = await r.json();
        if (cancelled) return;
        if (!r.ok || !d.success) { setNotes(null); return; }
        setNotes((d.data?.items ?? []) as NoteRow[]);
        setTotal(Number(d.data?.total ?? 0));
      } catch {
        if (!cancelled) setNotes(null);
      }
    })();
    return () => { cancelled = true; };
  }, [contactId, mode]);

  if (notes === null) return null; // no Brain, or not loaded

  const list = (
    <ul className="space-y-1.5">
      {notes.map((n) => (
        <li key={n.id}>
          <Link href={`/portal/brain/knowledge/${n.id}`} className="flex items-center gap-2 text-sm text-foreground hover:underline">
            <span className="material-icons text-base text-muted-foreground">sticky_note_2</span>
            <span className="truncate">{n.title}</span>
          </Link>
        </li>
      ))}
    </ul>
  );

  if (mode === 'tab') {
    return (
      <div className="p-5">
        {total === 0 ? <p className="text-sm text-muted-foreground">No Brain notes mention {firstName} yet.</p> : list}
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-[var(--studio-gold-line)] bg-[var(--studio-gold-surface)] p-4">
      <h3 className="mb-2 flex items-center gap-1.5 font-display text-sm font-semibold text-[var(--studio-gold-ink)]">
        <span className="material-icons text-base">psychology</span>
        Brain knows
      </h3>
      {total === 0 ? (
        <p className="text-xs text-muted-foreground">No notes mention {firstName} yet — notes linked to this contact show up here.</p>
      ) : (
        <>
          <p className="mb-2 text-xs text-muted-foreground">{total} {total === 1 ? 'note mentions' : 'notes mention'} {firstName}</p>
          {list}
        </>
      )}
    </div>
  );
}
