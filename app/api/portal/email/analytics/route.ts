import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { emailCampaigns, emailLists, emailSubscribers } from '@/lib/db/schema';
import { eq, and, count, sum, sql, desc } from 'drizzle-orm';
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

  let totalSubscribers = 0;
  let activeSubscribers = 0;
  const listBreakdown = [];

  for (const list of lists) {
    const [total] = await db.select({ count: count() }).from(emailSubscribers).where(eq(emailSubscribers.listId, list.id));
    const [active] = await db.select({ count: count() }).from(emailSubscribers).where(and(eq(emailSubscribers.listId, list.id), eq(emailSubscribers.status, 'active')));
    totalSubscribers += total.count;
    activeSubscribers += active.count;
    listBreakdown.push({ id: list.id, name: list.name, total: total.count, active: active.count });
  }

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
