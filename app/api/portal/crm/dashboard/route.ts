import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import {
  crmContacts,
  crmCompanies,
  crmDeals,
  crmActivities,
} from '@/lib/db/schema';
import { and, eq, desc, sql } from 'drizzle-orm';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client)
    return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  // Run all counts in parallel
  const [contactsResult, companiesResult, dealsResult, openDealsResult, wonDealsResult, recentActivities] =
    await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(crmContacts)
        .where(eq(crmContacts.clientId, client.id))
        .then((r) => r[0]),

      db
        .select({ count: sql<number>`count(*)::int` })
        .from(crmCompanies)
        .where(eq(crmCompanies.clientId, client.id))
        .then((r) => r[0]),

      db
        .select({ count: sql<number>`count(*)::int` })
        .from(crmDeals)
        .where(eq(crmDeals.clientId, client.id))
        .then((r) => r[0]),

      db
        .select({
          totalValue: sql<number>`coalesce(sum(${crmDeals.value}), 0)::int`,
        })
        .from(crmDeals)
        .where(
          and(eq(crmDeals.clientId, client.id), eq(crmDeals.status, 'open'))
        )
        .then((r) => r[0]),

      db
        .select({
          totalValue: sql<number>`coalesce(sum(${crmDeals.value}), 0)::int`,
        })
        .from(crmDeals)
        .where(
          and(eq(crmDeals.clientId, client.id), eq(crmDeals.status, 'won'))
        )
        .then((r) => r[0]),

      db
        .select()
        .from(crmActivities)
        .where(eq(crmActivities.clientId, client.id))
        .orderBy(desc(crmActivities.createdAt))
        .limit(10),
    ]);

  return NextResponse.json({
    success: true,
    data: {
      totalContacts: contactsResult.count,
      totalCompanies: companiesResult.count,
      totalDeals: dealsResult.count,
      openDealsValue: openDealsResult.totalValue,
      wonDealsValue: wonDealsResult.totalValue,
      recentActivities,
    },
  });
}
