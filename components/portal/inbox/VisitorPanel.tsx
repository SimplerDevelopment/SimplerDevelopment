'use client';

/**
 * PUX-215 (design doc screen 79): who's asking, from what is actually
 * captured — name, email, the plain open / assigned / closed status, the
 * widget it came through (widgets have no name; id + position is what
 * exists) — plus a CRM link on an exact-email match and "Turn into a
 * ticket": one POST to the tickets route with the transcript as the body.
 * Nothing links a ticket back to the chat (no column) — recorded on the card.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { sBtnGhost } from '@/components/portal/portal-ui';
import { transcript } from '@/lib/chat/transcript';

type Conversation = { id: number; widgetId: number; visitorName: string | null; visitorEmail: string | null; status: 'open' | 'assigned' | 'closed' };
type Message = { authorKind: string; authorName: string | null; body: string; occurredAt: string };

const STATUS: Record<Conversation['status'], string> = {
  open: 'bg-[var(--portal-warn-bg)] text-[var(--portal-warn)]',
  assigned: 'bg-[var(--studio-gold-surface)] text-[var(--studio-gold-ink)]',
  closed: 'bg-muted text-muted-foreground',
};

export default function VisitorPanel({ conversation, messages }: { conversation: Conversation; messages: Message[] }) {
  const [contactId, setContactId] = useState<number | null>(null);
  const [ticketId, setTicketId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const email = conversation.visitorEmail;

  useEffect(() => {
    if (!email) return;
    let cancelled = false;
    fetch(`/api/portal/crm/contacts?search=${encodeURIComponent(email)}&limit=5`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const hit = d?.data?.contacts?.find((c: { email?: string | null }) => c.email?.toLowerCase() === email.toLowerCase());
        if (!cancelled) setContactId(hit?.id ?? null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [email]);

  const makeTicket = async () => {
    setBusy(true); setError(null);
    try {
      const who = conversation.visitorName || email || 'a visitor';
      const res = await fetch('/api/portal/tickets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: `Chat with ${who}`, body: transcript(messages, conversation.visitorName) || '(empty conversation)', category: 'general', priority: 'medium' }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || d.success === false) throw new Error(d.message || 'Could not create the ticket');
      setTicketId(d.data?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the ticket');
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="space-y-4 rounded-2xl border border-border bg-card p-5 lg:sticky lg:top-6" aria-label="Visitor">
      <div>
        <p className="font-display text-[11px] font-semibold uppercase tracking-[.08em] text-muted-foreground">Visitor</p>
        <p className="mt-1 font-display text-lg font-extrabold tracking-[-0.01em] text-foreground">{conversation.visitorName || 'Anonymous visitor'}</p>
        {email && <p className="text-sm text-muted-foreground">{email}</p>}
        {contactId && <Link href={`/portal/crm/contacts/${contactId}`} className="mt-1 inline-flex items-center gap-1 text-xs text-foreground hover:underline"><span className="material-icons text-sm">person</span>Open in Contacts</Link>}
      </div>
      <dl className="space-y-1.5 text-sm">
        <div className="flex justify-between"><dt className="text-muted-foreground">Status</dt><dd><span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS[conversation.status]}`}>{conversation.status}</span></dd></div>
        <div className="flex justify-between"><dt className="text-muted-foreground">Widget</dt><dd className="tabular-nums text-foreground">#{conversation.widgetId}</dd></div>
      </dl>
      <p className="text-xs text-muted-foreground">Page, device and order history aren&apos;t captured by the widget yet — only who wrote and where from.</p>
      {ticketId ? (
        <Link href={`/portal/tickets/${ticketId}`} className={`${sBtnGhost} w-full justify-center`} role="status">Ticket #{ticketId} created — open it</Link>
      ) : (
        <button type="button" onClick={makeTicket} disabled={busy} className={`${sBtnGhost} w-full justify-center disabled:opacity-50`}>{busy ? 'Creating…' : 'Turn into a ticket'}</button>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </aside>
  );
}
