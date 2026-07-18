/**
 * Shared inbound-email → CRM thread recorder. Used by both the Gmail ingest
 * (lib/brain/ingest-gmail-message.ts) and the Outlook ingest
 * (lib/microsoft/mail-ingest.ts) so the two providers stay DRY.
 *
 * Phase 1+3 of [[Spec - CRM Email Sync + Sequences]]: if the sender matches a
 * CRM contact for the client, record the message on its thread (idempotent on
 * client+providerMessageId) and — Phase 2 — halt that contact's active email
 * sequences (an inbound reply stops the cadence).
 *
 * The caller normalizes `senderEmail` (the existing Gmail path lowercases it);
 * matching is exact against crm_contacts.email to preserve prior behavior.
 */
import { db } from '@/lib/db';
import { crmContacts, crmEmailMessages, crmSequenceEnrollments } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

export interface InboundCrmEmail {
  clientId: number;
  senderEmail: string;
  providerMessageId: string;
  threadKey?: string | null;
  toEmail?: string | null;
  subject?: string | null;
  snippet?: string | null;
  sentAt: Date;
}

export async function recordInboundCrmEmail(m: InboundCrmEmail): Promise<{ matched: boolean }> {
  const [contact] = await db
    .select({ id: crmContacts.id })
    .from(crmContacts)
    .where(and(eq(crmContacts.clientId, m.clientId), eq(crmContacts.email, m.senderEmail)))
    .limit(1);
  if (!contact) return { matched: false };

  await db
    .insert(crmEmailMessages)
    .values({
      clientId: m.clientId,
      contactId: contact.id,
      direction: 'inbound',
      providerMessageId: m.providerMessageId,
      threadKey: m.threadKey ?? null,
      fromEmail: m.senderEmail,
      toEmail: m.toEmail ?? null,
      subject: m.subject ?? null,
      snippet: m.snippet ?? null,
      sentAt: m.sentAt,
    })
    .onConflictDoNothing();

  // Halt-on-reply: stop the contact's active sequences.
  await db
    .update(crmSequenceEnrollments)
    .set({ status: 'halted', haltedReason: 'replied' })
    .where(and(eq(crmSequenceEnrollments.contactId, contact.id), eq(crmSequenceEnrollments.status, 'active')));

  return { matched: true };
}
