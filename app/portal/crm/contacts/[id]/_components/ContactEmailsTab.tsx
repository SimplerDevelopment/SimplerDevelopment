'use client';

/**
 * PUX-170 (design doc screen 29): the Emails tab — the contact's unified
 * thread from the existing GET /api/portal/crm/contacts/[id]/thread
 * (crm_email_messages: Gmail sync + outbound sends). Studio-only; the page
 * gates on useFeatureFlag('portal-redesign').
 */

import { useEffect, useState } from 'react';
import { EmptyState } from '@/components/portal/EmptyState';
import { relativeTime } from '@/lib/notifications/feed';

export interface ThreadMessage {
  id: number;
  direction: 'inbound' | 'outbound';
  fromEmail: string | null;
  toEmail: string | null;
  subject: string | null;
  snippet: string | null;
  sentAt: string | null;
}

export default function ContactEmailsTab({ contactId }: { contactId: string }) {
  const [messages, setMessages] = useState<ThreadMessage[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/portal/crm/contacts/${contactId}/thread`);
        const d = await r.json();
        if (!cancelled) setMessages(r.ok && d.success ? (d.data as ThreadMessage[]) : []);
      } catch {
        if (!cancelled) setMessages([]);
      }
    })();
    return () => { cancelled = true; };
  }, [contactId]);

  if (messages === null) return null;
  if (messages.length === 0) {
    return (
      <EmptyState
        title="No emails yet."
        body="Sent and received messages with this contact land here once email sync is on."
        ghostLabel="An email"
        className="p-5"
      />
    );
  }
  return (
    <ol className="divide-y divide-border">
      {[...messages].reverse().map((m) => (
        <li key={m.id} className="flex items-start gap-3 px-5 py-3">
          <span className={`material-icons mt-0.5 text-base ${m.direction === 'inbound' ? 'text-[var(--studio-gold-ink)]' : 'text-muted-foreground'}`}>
            {m.direction === 'inbound' ? 'call_received' : 'call_made'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{m.subject || '(no subject)'}</p>
            {m.snippet && <p className="truncate text-xs text-muted-foreground">{m.snippet}</p>}
          </div>
          {m.sentAt && <span className="shrink-0 text-[11px] text-muted-foreground">{relativeTime(m.sentAt)}</span>}
        </li>
      ))}
    </ol>
  );
}
