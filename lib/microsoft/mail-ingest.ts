/**
 * Outlook (Microsoft Graph) inbound mail → CRM thread.
 *
 * Phase 3 of [[Spec - CRM Email Sync + Sequences]]. Maps a Graph mail message
 * to the shared CRM-thread recorder (lib/crm/inbound-email.ts) — the same path
 * the Gmail ingest uses, so a contact's thread merges Gmail + Outlook + outbound.
 *
 * REMAINING (tenant-dependent, not locally verifiable): the Graph delta/fetch
 * (`GET /me/messages`) + change-notification subscription that DELIVER these
 * messages, mirroring lib/microsoft/transcripts-{fetch,watch,sync}.ts + the
 * microsoft-webhook routes + the renew-microsoft-subscriptions cron. This module
 * is the provider mapping + the integration point that wiring will call once the
 * Azure app registration grants the Mail.Read scope (see lib/microsoft/scopes.ts).
 */
import { recordInboundCrmEmail } from '@/lib/crm/inbound-email';

/** Minimal shape of a Microsoft Graph mail message (`/me/messages`). */
export interface GraphMailMessage {
  id: string;
  conversationId?: string | null;
  subject?: string | null;
  bodyPreview?: string | null;
  receivedDateTime?: string | null;
  from?: { emailAddress?: { address?: string | null; name?: string | null } } | null;
  toRecipients?: Array<{ emailAddress?: { address?: string | null } }> | null;
}

export async function ingestOutlookMessageIntoCrm(opts: {
  clientId: number;
  message: GraphMailMessage;
}): Promise<{ matched: boolean }> {
  const { clientId, message } = opts;
  const senderEmail = message.from?.emailAddress?.address?.toLowerCase();
  if (!senderEmail) return { matched: false };

  return recordInboundCrmEmail({
    clientId,
    senderEmail,
    providerMessageId: message.id,
    threadKey: message.conversationId ?? null,
    toEmail: message.toRecipients?.[0]?.emailAddress?.address ?? null,
    subject: message.subject ?? null,
    snippet: message.bodyPreview ?? null,
    sentAt: message.receivedDateTime ? new Date(message.receivedDateTime) : new Date(),
  });
}
