/** Canonical, resumable dispatcher for initial campaigns and A/B winners. */
import { and, eq, ne } from 'drizzle-orm';
import { db } from '@/lib/db';
import { emailCampaigns, emailCampaignSends, emailSubscribers } from '@/lib/db/schema';
import { freezeCampaignRecipients } from './campaign-safety';
import { campaignTransport, dispatchCampaignBuckets, type DispatchBucket } from './campaign-dispatch';
import { finalizeCampaignDispatch } from './campaign-finalize';

type Campaign = typeof emailCampaigns.$inferSelect;

function dispatchBuckets(campaign: Campaign, targets: NonNullable<Campaign['dispatchPlan']>): DispatchBucket[] {
  if (campaign.abEnabled && campaign.abSubjectB?.trim() && !campaign.abDecidedAt) {
    return [
      { variant: 'a', subject: campaign.subject, recipients: targets.filter(row => row.variant === 'a') },
      { variant: 'b', subject: campaign.abSubjectB, recipients: targets.filter(row => row.variant === 'b') },
    ];
  }
  if (campaign.abDecidedAt && !campaign.abWinnerSubject) throw new Error('A/B winner subject is missing; review the campaign');
  return [{ variant: campaign.abDecidedAt ? 'winner' : null,
    subject: campaign.abWinnerSubject ?? campaign.subject, recipients: targets }];
}

export async function executeCampaignSend(campaignId: number, campaign: Campaign): Promise<{
  sent: number; failed: number; total: number; ab?: { phase: 'testing'; held: number };
}> {
  const already = await db.select({ subscriberId: emailCampaignSends.subscriberId })
    .from(emailCampaignSends).where(eq(emailCampaignSends.campaignId, campaignId));
  const sentIds = new Set(already.map(row => row.subscriberId));
  if (campaign.abEnabled && already.length && !campaign.dispatchPlan) {
    throw new Error('delivery_requires_review: legacy A/B cohort was not frozen; reconcile before resuming');
  }
  const currentSubs = await db.select().from(emailSubscribers)
    .where(and(eq(emailSubscribers.listId, campaign.listId), eq(emailSubscribers.status, 'active')));
  const frozen = await freezeCampaignRecipients(campaignId, campaign, currentSubs);
  if (!frozen.length) throw new Error('No active subscribers remaining to send to');
  const activeIds = new Set(currentSubs.map(row => row.id));
  const targets = frozen.filter(row => activeIds.has(row.id) && !sentIds.has(row.id));
  const buckets = dispatchBuckets(campaign, targets);
  const total = buckets.reduce((count, bucket) => count + bucket.recipients.length, 0);
  const testing = Boolean(campaign.abEnabled && campaign.abSubjectB?.trim() && !campaign.abDecidedAt);
  let outcome = { sent: 0, failed: 0 };
  if (total > 0) {
    const transport = await campaignTransport(campaign);
    await db.update(emailCampaigns).set({ status: 'sending', totalRecipients: frozen.length, updatedAt: new Date() })
      .where(eq(emailCampaigns.id, campaignId));
    try { outcome = await dispatchCampaignBuckets(campaignId, campaign, buckets, transport); }
    catch (error) {
      await db.update(emailCampaigns).set({ status: 'partial', updatedAt: new Date() })
        .where(and(eq(emailCampaigns.id, campaignId), ne(emailCampaigns.status, 'sent'), ne(emailCampaigns.status, 'cancelled')));
      throw error;
    }
  }
  await finalizeCampaignDispatch(campaignId, frozen.length, testing, outcome.failed);
  return testing ? { ...outcome, total, ab: { phase: 'testing', held: targets.length - total } } : { ...outcome, total };
}
