import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { emailCampaigns, emailLists, emailSubscribers } from '@/lib/db/schema';
import { eq, and, count, sum, sql, desc, inArray } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

export async function GET() {
  const authResult = await authorizePortal({ action: 'read', requireService: 'email' });
  if (isAuthError(authResult)) return authResult.response;

  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false }, { status: 401 });
  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false }, { status: 404 });

  // Aggregate stats
  const [campaignStats] = await db.select({
    totalCampaigns: count(),
    totalSent: sum(emailCampaigns.totalSent),
    totalOpened: sum(emailCampaigns.totalOpened),
    totalClicked: sum(emailCampaigns.totalClicked),
    totalBounced: sum(emailCampaigns.totalBounced),
    totalUnsubscribed: sum(emailCampaigns.totalUnsubscribed),
  }).from(emailCampaigns)
    .where(and(eq(emailCampaigns.clientId, client.id), eq(emailCampaigns.status, 'sent')));

  const [listStats] = await db.select({
    totalLists: count(),
  }).from(emailLists).where(eq(emailLists.clientId, client.id));

  // Get subscriber counts per list
  const lists = await db.select({
    id: emailLists.id,
    name: emailLists.name,
  }).from(emailLists).where(eq(emailLists.clientId, client.id));

  // ── Single grouped count over all this client's lists ─────────────────────
  // Replaces an O(2 * lists) N+1: was running two count() queries per list.
  // One round trip returns (listId, status, count) rows; we assemble per-list
  // totals + active/unsubscribed/bounced breakdowns in memory.
  let totalSubscribers = 0;
  let activeSubscribers = 0;
  const listIds = lists.map((l) => l.id);

  type StatusCount = { listId: number; status: string; count: number };
  const counts: StatusCount[] = listIds.length === 0
    ? []
    : await db
        .select({
          listId: emailSubscribers.listId,
          status: emailSubscribers.status,
          count: sql<number>`count(*)::int`,
        })
        .from(emailSubscribers)
        .where(inArray(emailSubscribers.listId, listIds))
        .groupBy(emailSubscribers.listId, emailSubscribers.status);

  const perList = new Map<number, { total: number; active: number; unsubscribed: number; bounced: number }>();
  for (const id of listIds) perList.set(id, { total: 0, active: 0, unsubscribed: 0, bounced: 0 });
  for (const row of counts) {
    const bucket = perList.get(row.listId);
    if (!bucket) continue;
    bucket.total += row.count;
    if (row.status === 'active') bucket.active += row.count;
    else if (row.status === 'unsubscribed') bucket.unsubscribed += row.count;
    else if (row.status === 'bounced') bucket.bounced += row.count;
  }

  const listBreakdown = lists.map((list) => {
    const b = perList.get(list.id) ?? { total: 0, active: 0, unsubscribed: 0, bounced: 0 };
    totalSubscribers += b.total;
    activeSubscribers += b.active;
    return {
      id: list.id,
      name: list.name,
      total: b.total,
      active: b.active,
      unsubscribed: b.unsubscribed,
      bounced: b.bounced,
    };
  });

  // Recent campaigns with performance
  const recentCampaigns = await db.select({
    id: emailCampaigns.id,
    name: emailCampaigns.name,
    subject: emailCampaigns.subject,
    sentAt: emailCampaigns.sentAt,
    totalSent: emailCampaigns.totalSent,
    totalOpened: emailCampaigns.totalOpened,
    totalClicked: emailCampaigns.totalClicked,
    totalBounced: emailCampaigns.totalBounced,
  }).from(emailCampaigns)
    .where(and(eq(emailCampaigns.clientId, client.id), eq(emailCampaigns.status, 'sent')))
    .orderBy(desc(emailCampaigns.sentAt))
    .limit(10);

  const sent = Number(campaignStats.totalSent ?? 0);
  const opened = Number(campaignStats.totalOpened ?? 0);
  const clicked = Number(campaignStats.totalClicked ?? 0);

  return NextResponse.json({
    success: true,
    data: {
      overview: {
        totalCampaigns: campaignStats.totalCampaigns,
        totalSent: sent,
        totalOpened: opened,
        totalClicked: clicked,
        totalBounced: Number(campaignStats.totalBounced ?? 0),
        totalUnsubscribed: Number(campaignStats.totalUnsubscribed ?? 0),
        openRate: sent > 0 ? ((opened / sent) * 100).toFixed(1) : '0.0',
        clickRate: sent > 0 ? ((clicked / sent) * 100).toFixed(1) : '0.0',
      },
      subscribers: {
        total: totalSubscribers,
        active: activeSubscribers,
        totalLists: listStats.totalLists,
        listBreakdown,
      },
      recentCampaigns,
    },
  });
}
