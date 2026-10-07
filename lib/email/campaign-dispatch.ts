import { db } from '@/lib/db';
import { emailCampaignSends, emailCampaigns } from '@/lib/db/schema';
import { buildCampaignHtml, buildUnsubscribeUrl } from './index';
import { getOrRenderCampaignHtml, htmlToText } from './render-cache';
import { campaignDeliveryPayload } from './campaign-safety';
import { resolveResendKey } from './resolve-resend';
import { createEmailTransport, isMailpitEmailTransport, type EmailPayload, type EmailTransport } from './transport';
import type { Block } from '@/types/blocks';
import type { AbVariant } from './subject-ab';

type Campaign = typeof emailCampaigns.$inferSelect;
export type CampaignRecipient = NonNullable<Campaign['dispatchPlan']>[number];
export type DispatchBucket = { variant: AbVariant | null; subject: string; recipients: CampaignRecipient[] };

export async function campaignTransport(campaign: Campaign): Promise<EmailTransport> {
  if (isMailpitEmailTransport()) return createEmailTransport();
  const key = campaign.clientId != null
    ? (await resolveResendKey(campaign.clientId)).key : process.env.RESEND_API_KEY;
  if (!key) throw new Error('[executeCampaignSend] RESEND_API_KEY is not set');
  return createEmailTransport({ resendApiKey: key });
}

async function campaignRenderer(campaignId: number, campaign: Campaign) {
  const rendered = campaign.useBlockEditor && Array.isArray(campaign.contentBlocks)
    ? await getOrRenderCampaignHtml(campaignId, campaign.contentBlocks as Block[], { previewText: campaign.previewText, subject: campaign.subject })
    : null;
  return (recipient: CampaignRecipient, subject: string): EmailPayload => {
    const unsubscribeUrl = buildUnsubscribeUrl(recipient.unsubscribeToken);
    const html = rendered
      ? rendered.html.replace(/\{\{UNSUBSCRIBE_URL\}\}/g, unsubscribeUrl)
      : buildCampaignHtml(campaign.htmlContent, unsubscribeUrl, campaign.previewText);
    return {
      from: `${campaign.fromName} <${campaign.fromEmail}>`, to: recipient.email, subject, html,
      text: rendered?.text ? rendered.text.replace(/\{\{UNSUBSCRIBE_URL\}\}/g, unsubscribeUrl) : htmlToText(html),
      ...(campaign.replyTo ? { replyTo: campaign.replyTo } : {}),
      headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    };
  };
}

type PreparedDelivery = { recipient: CampaignRecipient; variant: AbVariant | null; payload: EmailPayload };

async function prepareDeliveries(campaignId: number, buckets: DispatchBucket[], render: Awaited<ReturnType<typeof campaignRenderer>>) {
  const ready: PreparedDelivery[] = [];
  let failed = 0;
  for (const bucket of buckets) {
    for (const recipient of bucket.recipients) {
      try {
        const payload = await campaignDeliveryPayload(campaignId, recipient.id, render(recipient, bucket.subject));
        ready.push({ recipient, variant: bucket.variant, payload });
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('delivery_requires_review:')) throw error;
        failed++;
      }
    }
  }
  return { ready, failed };
}

async function sendDeliveries(campaignId: number, ready: PreparedDelivery[], transport: EmailTransport) {
  let sent = 0;
  let failed = 0;
  for (const { recipient, variant, payload } of ready) {
    let result;
    try { result = await transport.send(payload); } catch { failed++; continue; }
    if (!result || result.error || !result.data?.id) { failed++; continue; }
    // Receipt failures escape so the queue retries the original intent/key.
    await db.insert(emailCampaignSends).values({ campaignId, subscriberId: recipient.id,
      resendEmailId: result.data.id, abVariant: variant, sentAt: new Date() })
      .onConflictDoNothing({ target: [emailCampaignSends.campaignId, emailCampaignSends.subscriberId] });
    sent++;
  }
  return { sent, failed };
}

/** Persist every eligible payload before making the first provider request. */
export async function dispatchCampaignBuckets(campaignId: number, campaign: Campaign, buckets: DispatchBucket[], transport: EmailTransport) {
  const render = await campaignRenderer(campaignId, campaign);
  const prepared = await prepareDeliveries(campaignId, buckets, render);
  const outcome = await sendDeliveries(campaignId, prepared.ready, transport);
  return { sent: outcome.sent, failed: prepared.failed + outcome.failed };
}
