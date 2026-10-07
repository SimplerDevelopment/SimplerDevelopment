import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { emailCampaigns, emailCampaignDeliveryIntents } from '@/lib/db/schema';
import { splitForAbTest } from './subject-ab';
import type { EmailPayload } from './transport';

type Campaign = typeof emailCampaigns.$inferSelect;
type Recipient = { id: number; email: string; unsubscribeToken: string };

/** Freeze every cohort, including held recipients, before the first send. */
export async function freezeCampaignRecipients(campaignId: number, campaign: Campaign, active: Recipient[]) {
  if (campaign.dispatchPlan) return campaign.dispatchPlan;
  const sorted = [...active].sort((a, b) => a.id - b.id);
  if (!sorted.length) return [];
  const split = splitForAbTest(sorted, campaign.abTestSizePct ?? 10);
  const a = new Set(split.a.map(row => row.id));
  const b = new Set(split.b.map(row => row.id));
  const testing = Boolean(campaign.abEnabled && campaign.abSubjectB?.trim() && !campaign.abDecidedAt);
  const plan = sorted.map(row => ({ ...row, variant: testing ? a.has(row.id) ? 'a' as const : b.has(row.id) ? 'b' as const : null : null }));
  const [written] = await db.update(emailCampaigns).set({ dispatchPlan: plan })
    .where(and(eq(emailCampaigns.id, campaignId), isNull(emailCampaigns.dispatchPlan)))
    .returning({ plan: emailCampaigns.dispatchPlan });
  if (written?.plan) return written.plan;
  const [raced] = await db.select({ plan: emailCampaigns.dispatchPlan }).from(emailCampaigns).where(eq(emailCampaigns.id, campaignId)).limit(1);
  if (!raced?.plan) throw new Error('Campaign dispatch plan was not persisted');
  return raced.plan;
}

export async function campaignDeliveryPayload(campaignId: number, subscriberId: number, payload: EmailPayload): Promise<EmailPayload> {
  const key = `campaign:${campaignId}:subscriber:${subscriberId}`;
  await db.insert(emailCampaignDeliveryIntents).values({ campaignId, subscriberId, payload })
    .onConflictDoNothing({ target: [emailCampaignDeliveryIntents.campaignId, emailCampaignDeliveryIntents.subscriberId] });
  const [intent] = await db.select().from(emailCampaignDeliveryIntents).where(and(
    eq(emailCampaignDeliveryIntents.campaignId, campaignId), eq(emailCampaignDeliveryIntents.subscriberId, subscriberId),
  )).limit(1);
  if (!intent) throw new Error('Campaign delivery intent was not persisted');
  if (Date.now() - intent.firstAttemptAt.getTime() >= 23 * 60 * 60 * 1000) {
    throw new Error('delivery_requires_review: provider idempotency window is closing; reconcile the stored intent before sending again');
  }
  return { ...intent.payload, idempotencyKey: key } as EmailPayload;
}
