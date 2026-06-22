import { after } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { brainMeetings, brainProfiles, clients, crmContacts, crmEmailMessages } from '@/lib/db/schema';
import { processBrainMeeting } from '@/lib/brain/process-meeting';
import type { FetchedMessage } from '@/lib/google/gmail-history';

/**
 * Brain-ingest a single Gmail message for a tenant.
 *
 * Mirrors the existing MX-routed inbound path
 * (app/api/email/inbound/route.ts → handleBrainIngest) so the resulting
 * brain_meetings row is indistinguishable from one ingested via email
 * forwarding — except `source` is 'gmail-api' and `sourceMetadata` carries
 * Gmail-specific identifiers (threadId, labels, the Gmail message id).
 *
 * Idempotent on (clientId, sourceRef) — the unique index dedupes redelivery
 * from Pub/Sub retries OR a successive history.list returning the same
 * messageAdded event.
 *
 * Auto-processing: if brainProfiles.autoProcessEmail is true for this tenant,
 * the AI pipeline is scheduled via after() — same contract as MX path.
 */
export async function ingestGmailMessageIntoBrain(opts: {
  clientId: number;
  message: FetchedMessage;
  storeBodies: boolean;
  /**
   * Already-fetched + already-uploaded attachments for this message, in the
   * same shape the MX path uses. Caller should run fetchAndUploadGmailAttachments
   * (lib/google/gmail-attachments.ts) and pass the result through. We don't
   * fetch attachments inline here so the orchestrating webhook stays in control
   * of timeouts and retry semantics.
   */
  attachments?: { key: string; filename: string; contentType: string; size: number }[];
}): Promise<{ meetingId: number | null; status: 'inserted' | 'updated' | 'skipped'; reason?: string }> {
  const { clientId, message, storeBodies } = opts;
  const attachments = opts.attachments ?? [];

  const [profile] = await db
    .select({
      id: brainProfiles.id,
      enabled: brainProfiles.enabled,
      autoProcessEmail: brainProfiles.autoProcessEmail,
    })
    .from(brainProfiles)
    .where(eq(brainProfiles.clientId, clientId))
    .limit(1);

  if (!profile) {
    return { meetingId: null, status: 'skipped', reason: 'no_brain_profile' };
  }
  if (!profile.enabled) {
    return { meetingId: null, status: 'skipped', reason: 'brain_disabled' };
  }

  const senderEmail = message.from.toLowerCase().replace(/.*<([^>]+)>.*/, '$1');
  const sourceRef = message.internetMessageId;

  const transcript = storeBodies ? message.bodyText : message.snippet;

  const sourceMetadata = {
    source: 'gmail-api',
    gmailMessageId: message.id,
    gmailThreadId: message.threadId,
    labelIds: message.labelIds,
    from: message.from,
    to: message.to,
    senderEmail,
    receivedAt: message.receivedAt.toISOString(),
    storedBody: storeBodies,
    attachments,
  };

  const [meetingRow] = await db
    .insert(brainMeetings)
    .values({
      clientId,
      title: message.subject || '(email)',
      meetingDate: message.receivedAt,
      transcript,
      status: 'draft',
      source: 'gmail-api',
      sourceRef,
      sourceMetadata,
    })
    .onConflictDoUpdate({
      target: [brainMeetings.clientId, brainMeetings.sourceRef],
      set: {
        title: message.subject || '(email)',
        meetingDate: message.receivedAt,
        transcript,
        sourceMetadata,
        updatedAt: new Date(),
      },
    })
    .returning({ id: brainMeetings.id });

  if (!meetingRow) {
    return { meetingId: null, status: 'skipped', reason: 'insert_returned_no_row' };
  }

  // CRM email thread (Phase 1 — [[Spec - CRM Email Sync + Sequences]]). If the
  // sender matches a CRM contact for this client, record the inbound message on
  // its thread. Best-effort + idempotent (unique client+providerMessageId);
  // decoupled from the async AI classification that may also create a contact.
  try {
    const [crmContact] = await db
      .select({ id: crmContacts.id })
      .from(crmContacts)
      .where(and(eq(crmContacts.clientId, clientId), eq(crmContacts.email, senderEmail)))
      .limit(1);
    if (crmContact) {
      await db
        .insert(crmEmailMessages)
        .values({
          clientId,
          contactId: crmContact.id,
          direction: 'inbound',
          providerMessageId: message.id,
          threadKey: message.threadId,
          fromEmail: senderEmail,
          toEmail: message.to ?? null,
          subject: message.subject ?? null,
          snippet: message.snippet ?? null,
          sentAt: message.receivedAt,
        })
        .onConflictDoNothing();
    }
  } catch (threadErr) {
    console.error('[ingest-gmail] crm email-thread upsert failed', threadErr);
  }

  // Auto-process the AI pipeline post-response, matching MX path semantics.
  if (profile.autoProcessEmail) {
    const meetingId = meetingRow.id;
    after(async () => {
      try {
        const [client] = await db
          .select({ userId: clients.userId })
          .from(clients)
          .where(eq(clients.id, clientId))
          .limit(1);
        if (!client) {
          console.error(`[ingest-gmail] auto-process: client ${clientId} not found`);
          return;
        }
        await processBrainMeeting({ clientId, meetingId, userId: client.userId });
      } catch (err) {
        console.error(`[ingest-gmail] auto-process failed for meeting=${meetingId}`, err);
      }
    });
  }

  return { meetingId: meetingRow.id, status: 'inserted' };
}
