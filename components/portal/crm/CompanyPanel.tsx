'use client';

/**
 * PUX-203 (design doc screen 67): the company beside the row that opened it
 * — the detail page's own reads (company GET carries its deals; contacts by
 * ?companyId=) plus "Brain knows" from the knowledge route, which already
 * accepts companyId (402 for tenants without the Brain → nothing shown).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { sBtnGhost } from '@/components/portal/portal-ui';
import { formatMoney } from '@/lib/utils/money';

type Deal = { id: number; title: string; value?: number | null; status?: string };
type Contact = { id: number; firstName: string; lastName: string; email?: string | null; title?: string | null };
type Note = { id: number; title: string; body?: string | null };

export default function CompanyPanel({ companyId, name, onClose }: { companyId: number; name: string; onClose: () => void }) {
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [notes, setNotes] = useState<Note[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const j = (r: Response) => (r.ok ? r.json() : null);
    fetch(`/api/portal/crm/companies/${companyId}`).then(j).then((d) => { if (!cancelled) setDeals(d?.data?.deals ?? []); }).catch(() => {});
    fetch(`/api/portal/crm/contacts?companyId=${companyId}&limit=10`).then(j).then((d) => { if (!cancelled) setContacts(d?.data?.contacts ?? []); }).catch(() => {});
    fetch(`/api/portal/brain/knowledge?companyId=${companyId}&limit=3`).then(j).then((d) => { if (!cancelled) setNotes(d?.data?.items ?? d?.data ?? []); }).catch(() => {});
    return () => { cancelled = true; };
  }, [companyId]);

  const open = (deals ?? []).filter((d) => d.status !== 'won' && d.status !== 'lost');
  return (
    <aside className="space-y-4 rounded-2xl border border-border bg-card p-5 lg:sticky lg:top-6" aria-label={`Company: ${name}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-[11px] font-semibold uppercase tracking-[.08em] text-muted-foreground">Company</p>
          <h2 className="font-display text-lg font-extrabold tracking-[-0.01em] text-foreground">{name}</h2>
        </div>
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close panel"><span className="material-icons text-base">close</span></button>
      </div>

      <section aria-label="People">
        <h3 className="text-[11px] font-semibold uppercase tracking-[.08em] text-muted-foreground">People</h3>
        {contacts === null ? <p className="mt-1 text-xs text-muted-foreground">Loading…</p> : contacts.length === 0 ? <p className="mt-1 text-sm text-muted-foreground">No contacts yet.</p> : (
          <ul className="mt-1.5 space-y-1 text-sm">
            {contacts.map((c) => <li key={c.id}><Link href={`/portal/crm/contacts/${c.id}`} className="text-foreground hover:underline">{c.firstName} {c.lastName}</Link>{c.title && <span className="text-muted-foreground"> · {c.title}</span>}</li>)}
          </ul>
        )}
      </section>

      <section aria-label="Open deals">
        <h3 className="text-[11px] font-semibold uppercase tracking-[.08em] text-muted-foreground">Open deals</h3>
        {deals === null ? <p className="mt-1 text-xs text-muted-foreground">Loading…</p> : open.length === 0 ? <p className="mt-1 text-sm text-muted-foreground">Nothing open.</p> : (
          <ul className="mt-1.5 space-y-1 text-sm">
            {open.map((d) => <li key={d.id} className="flex justify-between gap-2"><Link href={`/portal/crm/deals/${d.id}`} className="truncate text-foreground hover:underline">{d.title}</Link>{typeof d.value === 'number' && <span className="tabular-nums text-muted-foreground">{formatMoney(d.value)}</span>}</li>)}
          </ul>
        )}
      </section>

      {notes && notes.length > 0 && (
        <section className="rounded-xl border border-[var(--studio-gold-line)] bg-[var(--studio-gold-surface)] p-3" aria-label="Brain knows">
          <h3 className="text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--studio-gold-ink)]">Brain knows</h3>
          <ul className="mt-1.5 space-y-1 text-sm">
            {notes.map((n) => <li key={n.id}><Link href={`/portal/brain/knowledge/${n.id}`} className="text-foreground hover:underline">{n.title}</Link></li>)}
          </ul>
        </section>
      )}

      <Link href={`/portal/crm/companies/${companyId}`} className={`${sBtnGhost} w-full justify-center`}>Open full record</Link>
    </aside>
  );
}
