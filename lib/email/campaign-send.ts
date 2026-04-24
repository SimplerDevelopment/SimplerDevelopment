/**
 * Shared campaign-send execution.
 *
 * Resume-safe: queries emailCampaignSends to skip subscribers who already
 * received this campaign. Caller is responsible for gating/auth —
 * this module only does the dispatch loop + status transitions.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  emailCampaigns,
  emailCampaignSends,
  emailSubscribers,
} from '@/lib/db/schema';
import { resend, buildCampaignHtml, buildUnsubscribeUrl } from './index';

export async function executeCampaignSend(
  campaignId: number,
  campaign: typeof emailCampaigns.$inferSelect,
): Promise<{ sent: number; failed: number; total: number }> {
  const already = await db
    .select({ subscriberId: emailCampaignSends.subscriberId })
    .from(emailCampaignSends)
    .where(eq(emailCampaignSends.campaignId, campaignId));
  const sentIds = new Set(already.map(s => s.subscriberId));

  const activeSubs = await db
    .select()
    .from(emailSubscribers)
    .where(and(eq(emailSubscribers.listId, campaign.listId), eq(emailSubscribers.status, 'active')));

  const targets = activeSubs.filter(s => !sentIds.has(s.id));
  if (targets.length === 0) throw new Error('No active subscribers remaining to send to');

  await db
    .update(emailCampaigns)
    .set({ status: 'sending', totalRecipients: targets.length, updatedAt: new Date() })
    .where(eq(emailCampaigns.id, campaignId));

  let sent = 0;
  let failed = 0;
  for (const subscriber of targets) {
    try {
      const unsubscribeUrl = buildUnsubscribeUrl(subscriber.unsubscribeToken);
      const html = buildCampaignHtml(campaign.htmlContent, unsubscribeUrl, campaign.previewText);
      const result = await resend.emails.send({
        from: `${campaign.fromName} <${campaign.fromEmail}>`,
        to: subscriber.email,
        subject: campaign.subject,
        html,
        ...(campaign.replyTo ? { replyTo: campaign.replyTo } : {}),
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      });
      await db.insert(emailCampaignSends).values({
        campaignId,
        subscriberId: subscriber.id,
        resendEmailId: result.data?.id ?? null,
        sentAt: new Date(),
      });
      sent++;
    } catch {
      failed++;
    }
  }

  await db
    .update(emailCampaigns)
    .set({ status: 'sent', sentAt: new Date(), totalSent: sent, updatedAt: new Date() })
    .where(eq(emailCampaigns.id, campaignId));

  return { sent, failed, total: targets.length };
}
