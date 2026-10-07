/** Persist the A/B decision and queue the canonical resumable dispatcher. */
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { emailCampaigns, emailSubscribers, emailCampaignSends } from '@/lib/db/schema';
import { aggregateAbVariantCounts, pickAbWinner } from './subject-ab';
import { enqueueCampaignSend } from './campaign-send-job';
import { executeCampaignSend } from './campaign-send';

export interface AbPromotionResult {
  winner: 'a' | 'b' | 'tie'; winnerSubject: string; reason: string;
  counts: Awaited<ReturnType<typeof aggregateAbVariantCounts>>;
  sent: number; failed: number; total: number; queued?: boolean;
}

type Campaign = typeof emailCampaigns.$inferSelect;
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function assertInitialDeliveryComplete(tx: Transaction, current: Campaign) {
  if (current.status !== 'ab_testing' || !current.dispatchPlan) throw new Error('A/B initial delivery is incomplete');
  const active = await tx.select({ id: emailSubscribers.id }).from(emailSubscribers)
    .where(and(eq(emailSubscribers.listId, current.listId), eq(emailSubscribers.status, 'active')));
  const activeIds = new Set(active.map(row => row.id));
  const receipts = await tx.select({ subscriberId: emailCampaignSends.subscriberId }).from(emailCampaignSends)
    .where(eq(emailCampaignSends.campaignId, current.id));
  const delivered = new Set(receipts.map(row => row.subscriberId));
  if (current.dispatchPlan.some(row => row.variant && activeIds.has(row.id) && !delivered.has(row.id))) {
    throw new Error('A/B initial delivery is incomplete');
  }
}

async function persistPromotion(campaignId: number, winnerSubject: string) {
  return db.transaction(async tx => {
    const [current] = await tx.select().from(emailCampaigns).where(eq(emailCampaigns.id, campaignId)).for('update');
    if (!current) throw new Error('Campaign not found');
    if (!current.abEnabled || !current.abSubjectB?.trim()) throw new Error('A/B test is not configured');
    if (!current.abDecidedAt) {
      await assertInitialDeliveryComplete(tx, current);
      const [decided] = await tx.update(emailCampaigns).set({ abWinnerSubject: winnerSubject,
        abDecidedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(emailCampaigns.id, campaignId), isNull(emailCampaigns.abDecidedAt))).returning();
      Object.assign(current, decided);
    }
    if (current.clientId != null) {
      // All methods used by enqueueCampaignSend are supported by the transaction.
      await enqueueCampaignSend(campaignId, current.clientId, tx as unknown as typeof db);
    }
    return current;
  });
}

export async function executeAbPromotion(campaignId: number, campaign: Campaign): Promise<AbPromotionResult> {
  const counts = await aggregateAbVariantCounts(campaignId);
  const picked = pickAbWinner(counts, campaign.abWinnerMetric === 'click' ? 'click' : 'open');
  const current = await persistPromotion(campaignId, picked.winner === 'a' ? campaign.subject : campaign.abSubjectB!);
  const winnerSubject = current.abWinnerSubject!;
  const base = { winner: winnerSubject === current.subject ? 'a' as const : 'b' as const,
    winnerSubject, reason: picked.reason, counts };
  if (current.clientId != null) return { ...base, sent: 0, failed: 0, total: 0, queued: true };
  // Agency/global campaigns have no tenant for internal_jobs. They still use
  // the same durable provider intents and can resume the recorded decision.
  try { return { ...base, ...await executeCampaignSend(campaignId, current) }; }
  catch (error) {
    await db.update(emailCampaigns).set({ status: 'partial', updatedAt: new Date() }).where(eq(emailCampaigns.id, campaignId));
    throw error;
  }
}
