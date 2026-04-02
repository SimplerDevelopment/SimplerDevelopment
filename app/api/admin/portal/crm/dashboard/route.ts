import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  crmContacts,
  crmCompanies,
  crmDeals,
  crmProposals,
  crmContracts,
  crmActivities,
  clients,
  users,
} from '@/lib/db/schema';
import { eq, desc, sql, count } from 'drizzle-orm';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

export async function GET() {
  if (!(await requireStaff()))
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const [
    contactStats,
    companyCount,
    dealStats,
    proposalStats,
    recentActivities,
  ] = await Promise.all([
    // Contacts by status
    db
      .select({
        status: crmContacts.status,
        count: count(),
      })
      .from(crmContacts)
      .groupBy(crmContacts.status),

    // Total companies
    db.select({ count: count() }).from(crmCompanies),

    // Deal stats by status
    db
      .select({
        status: crmDeals.status,
        count: count(),
        totalValue: sql<number>`coalesce(sum(${crmDeals.value}), 0)`.as('total_value'),
      })
      .from(crmDeals)
      .groupBy(crmDeals.status),

    // Proposal stats by status
    db
      .select({
        status: crmProposals.status,
        count: count(),
      })
      .from(crmProposals)
      .groupBy(crmProposals.status),

    // Recent activities with client info
    db
      .select({
        id: crmActivities.id,
        type: crmActivities.type,
        title: crmActivities.title,
        description: crmActivities.description,
        dueDate: crmActivities.dueDate,
        completedAt: crmActivities.completedAt,
        createdAt: crmActivities.createdAt,
        clientCompany: clients.company,
      })
      .from(crmActivities)
      .innerJoin(clients, eq(crmActivities.clientId, clients.id))
      .orderBy(desc(crmActivities.createdAt))
      .limit(10),
  ]);

  // Contract stats - query separately since table may not exist yet
  let contractStats: { status: string; count: number }[] = [];
  try {
    contractStats = await db
      .select({
        status: crmContracts.status,
        count: count(),
      })
      .from(crmContracts)
      .groupBy(crmContracts.status);
  } catch {
    // Table may not exist yet
  }

  const totalContacts = contactStats.reduce((s, r) => s + Number(r.count), 0);
  const contactsByStatus = Object.fromEntries(contactStats.map(r => [r.status, Number(r.count)]));

  const dealsByStatus: Record<string, { count: number; value: number }> = {};
  for (const r of dealStats) {
    dealsByStatus[r.status] = { count: Number(r.count), value: Number(r.totalValue) };
  }

  const proposalsByStatus = Object.fromEntries(proposalStats.map(r => [r.status, Number(r.count)]));
  const contractsByStatus = Object.fromEntries(contractStats.map(r => [r.status, Number(r.count)]));

  return NextResponse.json({
    success: true,
    data: {
      totalContacts,
      contactsByStatus,
      totalCompanies: Number(companyCount[0]?.count ?? 0),
      dealsByStatus,
      proposalsByStatus,
      contractsByStatus,
      recentActivities,
    },
  });
}
