'use client';

// "Linked entities, not just backlinks" (PUX-160, design doc screen 19): the
// contact / deal / company a note points at — real columns on brain_notes
// that nothing rendered. Resolved through the existing CRM detail routes
// (only for the ids the note has), each a link into the CRM.
import Link from 'next/link';
import { useEffect, useState } from 'react';

type Kind = 'contact' | 'deal' | 'company';
interface Linked { kind: Kind; id: number; label: string; href: string }

const META: Record<Kind, { icon: string; path: string; word: string }> = {
  contact: { icon: 'person', path: '/portal/crm/contacts', word: 'Contact' },
  deal: { icon: 'handshake', path: '/portal/crm/deals', word: 'Deal' },
  company: { icon: 'business', path: '/portal/crm/companies', word: 'Company' },
};

export function labelOf(kind: Kind, d: Record<string, unknown> | null | undefined, id: number): string {
  if (!d) return `${META[kind].word} #${id}`;
  const full = [d.firstName, d.lastName].filter(Boolean).join(' ');
  return String(d.name ?? (full || undefined) ?? d.title ?? `${META[kind].word} #${id}`);
}

export default function NoteLinkedEntities({ contactId, dealId, companyId }: { contactId: number | null; dealId: number | null; companyId: number | null }) {
  const [rows, setRows] = useState<Linked[] | null>(null);
  const wanted: [Kind, number | null][] = [['contact', contactId], ['deal', dealId], ['company', companyId]];
  const present = wanted.filter((w): w is [Kind, number] => w[1] != null);
  const key = wanted.map(([, id]) => id ?? '').join(':');

  useEffect(() => {
    if (present.length === 0) return; // nothing to resolve — rendered below without state
    const ctrl = new AbortController();
    Promise.all(present.map(async ([kind, id]) => {
      const d = await fetch(`${META[kind].path.replace('/portal/', '/api/portal/')}/${id}`, { signal: ctrl.signal }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      return { kind, id, label: labelOf(kind, d?.data, id), href: `${META[kind].path}/${id}` };
    })).then(setRows);
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the ids, which is what should retrigger
  }, [key]);

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <h3 className="flex items-center gap-2 px-3 py-2 text-[13px] font-bold text-foreground"><span className="material-icons text-base text-muted-foreground">link</span>Linked</h3>
      {present.length === 0 ? (
        <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">Not linked to a contact, deal or company yet.</p>
      ) : rows === null ? (
        <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">Loading…</p>
      ) : rows.map((r) => (
        <Link key={r.kind + r.id} href={r.href} className="flex items-center gap-2 border-t border-border px-3 py-2 text-sm text-foreground hover:bg-muted/50">
          <span className="material-icons text-base text-muted-foreground">{META[r.kind].icon}</span>
          <span className="min-w-0 flex-1 truncate">{r.label}</span>
          <span className="text-[11px] text-muted-foreground">{META[r.kind].word}</span>
        </Link>
      ))}
    </section>
  );
}
