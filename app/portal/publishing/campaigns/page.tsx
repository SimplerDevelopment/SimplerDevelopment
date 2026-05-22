import { db } from '@/lib/db';
import { publishingCampaigns, kanbanCards } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { getPublishingSession } from '@/lib/publishing/active-client';
import PublishingCampaignsList from '@/components/portal/publishing/PublishingCampaignsList';

export const dynamic = 'force-dynamic';

export default async function PublishingCampaignsPage() {
  const session = await getPublishingSession();
  const canManage =
    session.isStaff || session.role === 'owner' || session.role === 'admin';

  // Load with card-count denormalized for the list view. Cheap LEFT JOIN
  // because we only have a handful of campaigns per client in practice.
  const rows = await db
    .select({
      id: publishingCampaigns.id,
      name: publishingCampaigns.name,
      slug: publishingCampaigns.slug,
      description: publishingCampaigns.description,
      color: publishingCampaigns.color,
      startDate: publishingCampaigns.startDate,
      endDate: publishingCampaigns.endDate,
      status: publishingCampaigns.status,
      cardCount: sql<number>`COUNT(${kanbanCards.id})::int`,
    })
    .from(publishingCampaigns)
    .leftJoin(kanbanCards, eq(kanbanCards.campaignId, publishingCampaigns.id))
    .where(eq(publishingCampaigns.clientId, session.clientId))
    .groupBy(publishingCampaigns.id)
    .orderBy(publishingCampaigns.createdAt);

  // Serialize Dates for client transit.
  const initialCampaigns = rows.map((r) => ({
    ...r,
    startDate: r.startDate ? r.startDate.toISOString() : null,
    endDate: r.endDate ? r.endDate.toISOString() : null,
  }));

  return <PublishingCampaignsList initial={initialCampaigns} canManage={canManage} />;
}
