import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { emailCampaigns } from '@/lib/db/schema';

/** The state predicate shares the write, preventing edits racing dispatch. */
export async function editDraftCampaign(campaignId: number, clientId: number, patch: Partial<typeof emailCampaigns.$inferInsert>) {
  const [updated] = await db.update(emailCampaigns).set(patch).where(and(
    eq(emailCampaigns.id, campaignId), eq(emailCampaigns.clientId, clientId),
    eq(emailCampaigns.status, 'draft'), isNull(emailCampaigns.dispatchPlan),
  )).returning();
  if (!updated) throw new Error('Campaign dispatch started while editing');
  return updated;
}
