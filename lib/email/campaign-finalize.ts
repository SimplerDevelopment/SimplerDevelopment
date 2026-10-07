import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { automationJobs, emailCampaigns, emailCampaignSends } from '@/lib/db/schema';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Campaign = typeof emailCampaigns.$inferSelect;
const terminalStates = new Set(['sent', 'cancelled']);

function deliveryStatus(testing: boolean, failed: number) {
  return failed > 0 ? 'partial' : testing ? 'ab_testing' : 'sent';
}

async function queueSentEvent(tx: Transaction, current: Campaign, status: string, totalSent: number) {
  if (status !== 'sent' || current.clientId == null) return;
  await tx.insert(automationJobs).values({ clientId: current.clientId, userId: current.createdBy ?? 0,
    event: 'email.campaign.sent', status: 'pending', payload: {
      campaignId: current.id, name: current.name, listId: current.listId, totalSent,
    },
  });
}

/** Commit terminal state and its durable automation event together. */
export async function finalizeCampaignDispatch(campaignId: number, totalRecipients: number, testing: boolean, failed: number) {
  await db.transaction(async tx => {
    const [current] = await tx.select().from(emailCampaigns).where(eq(emailCampaigns.id, campaignId)).for('update');
    if (!current || terminalStates.has(current.status)) return;
    const receipts = await tx.select({ subscriberId: emailCampaignSends.subscriberId }).from(emailCampaignSends)
      .where(eq(emailCampaignSends.campaignId, campaignId));
    const status = deliveryStatus(testing, failed);
    await tx.update(emailCampaigns).set({ status, totalRecipients, totalSent: receipts.length,
      sentAt: failed > 0 ? null : current.sentAt ?? new Date(), updatedAt: new Date(),
    }).where(eq(emailCampaigns.id, campaignId));
    await queueSentEvent(tx, current, status, receipts.length);
  });
}
