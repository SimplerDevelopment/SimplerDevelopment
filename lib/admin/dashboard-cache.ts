// Cached fan-out for the admin dashboard payload (18 COUNT/SUM queries) +
// a tag-based invalidator that high-frequency mutation paths can call.
//
// Lives in lib/ so non-route files can call `revalidateAdminDashboard()`
// without taking a transitive import on app/api/admin/dashboard/route.ts
// (route files aren't supposed to be imported by other server modules —
// Next.js treats them as route definitions, not utilities).

import { unstable_cache, revalidateTag } from 'next/cache';
import { db } from '@/lib/db';
import {
  clients, users, clientServices, services, invoices, supportTickets,
  projects, clientWebsites, aiCreditBalances,
  orders, crmDeals, crmContacts, crmProposals, emailCampaigns,
  bookingPages, bookings, automationRules, hostedSites,
} from '@/lib/db/schema';
import { count, eq, sql, or } from 'drizzle-orm';

export const ADMIN_DASHBOARD_TAG = 'admin-dashboard';

async function loadAdminDashboard() {
  const [
    clientCount,
    activeClientCount,
    websiteCount,
    activeWebsiteCount,
    openTicketCount,
    activeProjectCount,
    invoiceStats,
    subscriptionStats,
    aiCreditStats,
    dealStats,
    contactCount,
    proposalStats,
    campaignCount,
    bookingStats,
    automationCount,
    hostedSiteCount,
    recentTickets,
    recentInvoices,
    recentOrders,
  ] = await Promise.all([
    db.select({ count: count() }).from(clients),
    db.select({ count: count() })
      .from(clients)
      .innerJoin(users, eq(clients.userId, users.id))
      .where(eq(users.active, true)),
    db.select({ count: count() }).from(clientWebsites),
    db.select({ count: count() }).from(clientWebsites).where(eq(clientWebsites.active, true)),
    db.select({ count: count() })
      .from(supportTickets)
      .where(or(eq(supportTickets.status, 'open'), eq(supportTickets.status, 'in_progress'))),
    db.select({ count: count() }).from(projects).where(eq(projects.status, 'active')),
    db.select({
      outstanding: sql<number>`coalesce(sum(case when ${invoices.status} in ('sent','overdue') then ${invoices.total} else 0 end), 0)`,
      collected: sql<number>`coalesce(sum(case when ${invoices.status} = 'paid' then ${invoices.total} else 0 end), 0)`,
      overdueCount: sql<number>`count(case when ${invoices.status} = 'overdue' then 1 end)`,
      totalCount: count(),
    }).from(invoices),
    db.select({
      activeCount: sql<number>`count(case when ${clientServices.status} = 'active' then 1 end)`,
      mrr: sql<number>`coalesce(sum(case when ${clientServices.status} = 'active' and ${services.billingCycle} = 'monthly' then ${services.price} when ${clientServices.status} = 'active' and ${services.billingCycle} = 'annually' then ${services.price} / 12 else 0 end), 0)`,
    }).from(clientServices).leftJoin(services, eq(clientServices.serviceId, services.id)),
    db.select({
      totalBalance: sql<number>`coalesce(sum(${aiCreditBalances.balance}), 0)`,
      totalMonthlyGrant: sql<number>`coalesce(sum(${aiCreditBalances.monthlyGrant}), 0)`,
    }).from(aiCreditBalances),
    db.select({
      openCount: sql<number>`count(case when ${crmDeals.status} = 'open' then 1 end)`,
      wonCount: sql<number>`count(case when ${crmDeals.status} = 'won' then 1 end)`,
      totalValue: sql<number>`coalesce(sum(case when ${crmDeals.status} = 'open' then ${crmDeals.value} else 0 end), 0)`,
      wonValue: sql<number>`coalesce(sum(case when ${crmDeals.status} = 'won' then ${crmDeals.value} else 0 end), 0)`,
    }).from(crmDeals),
    db.select({ count: count() }).from(crmContacts),
    db.select({
      draftCount: sql<number>`count(case when ${crmProposals.status} = 'draft' then 1 end)`,
      sentCount: sql<number>`count(case when ${crmProposals.status} = 'sent' then 1 end)`,
      acceptedCount: sql<number>`count(case when ${crmProposals.status} = 'accepted' then 1 end)`,
    }).from(crmProposals),
    db.select({ count: count() }).from(emailCampaigns),
    db.select({
      pageCount: sql<number>`(select count(*) from ${bookingPages})`,
      upcomingCount: sql<number>`count(case when ${bookings.startTime} > now() and ${bookings.status} = 'confirmed' then 1 end)`,
    }).from(bookings),
    db.select({ count: count() }).from(automationRules).where(eq(automationRules.enabled, true)),
    db.select({ count: count() }).from(hostedSites).where(eq(hostedSites.status, 'active')),
    db.select({
      id: supportTickets.id,
      number: supportTickets.number,
      subject: supportTickets.subject,
      status: supportTickets.status,
      priority: supportTickets.priority,
      createdAt: supportTickets.createdAt,
    }).from(supportTickets).orderBy(sql`${supportTickets.createdAt} desc`).limit(5),
    db.select({
      id: invoices.id,
      number: invoices.number,
      status: invoices.status,
      total: invoices.total,
      createdAt: invoices.createdAt,
    }).from(invoices).orderBy(sql`${invoices.createdAt} desc`).limit(5),
    db.select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      customerName: orders.customerName,
      total: orders.total,
      status: orders.status,
      createdAt: orders.createdAt,
    }).from(orders).orderBy(sql`${orders.createdAt} desc`).limit(5),
  ]);

  return {
    clients: {
      total: clientCount[0].count,
      active: activeClientCount[0].count,
    },
    websites: {
      total: websiteCount[0].count,
      active: activeWebsiteCount[0].count,
    },
    tickets: {
      open: openTicketCount[0].count,
    },
    projects: {
      active: activeProjectCount[0].count,
    },
    invoices: {
      outstanding: invoiceStats[0].outstanding,
      collected: invoiceStats[0].collected,
      overdueCount: invoiceStats[0].overdueCount,
      totalCount: invoiceStats[0].totalCount,
    },
    subscriptions: {
      active: subscriptionStats[0].activeCount,
      mrr: subscriptionStats[0].mrr,
    },
    aiCredits: {
      totalBalance: aiCreditStats[0].totalBalance,
      totalMonthlyGrant: aiCreditStats[0].totalMonthlyGrant,
    },
    deals: {
      open: dealStats[0].openCount,
      won: dealStats[0].wonCount,
      pipelineValue: dealStats[0].totalValue,
      wonValue: dealStats[0].wonValue,
    },
    contacts: contactCount[0].count,
    proposals: {
      draft: proposalStats[0].draftCount,
      sent: proposalStats[0].sentCount,
      accepted: proposalStats[0].acceptedCount,
    },
    campaigns: campaignCount[0].count,
    bookings: {
      pages: bookingStats[0]?.pageCount ?? 0,
      upcoming: bookingStats[0]?.upcomingCount ?? 0,
    },
    automations: automationCount[0].count,
    hostedSites: hostedSiteCount[0].count,
    recent: {
      tickets: recentTickets,
      invoices: recentInvoices,
      orders: recentOrders,
    },
  };
}

const getAdminDashboardCached = unstable_cache(
  loadAdminDashboard,
  ['admin-dashboard'],
  { revalidate: 90, tags: [ADMIN_DASHBOARD_TAG] },
);

export async function getAdminDashboard(): Promise<ReturnType<typeof loadAdminDashboard>> {
  try {
    return await getAdminDashboardCached();
  } catch {
    // Outside a request context (tests/cron/MCP) — incrementalCache unavailable.
    return loadAdminDashboard();
  }
}

/**
 * Invalidate the cached admin dashboard payload. Call from high-frequency
 * mutation paths only — ticket create/update/close, invoice paid, order
 * placed, project create. Everything else accepts the 90s TTL.
 *
 * Next 16 changed `revalidateTag` to require a profile arg — 'default'
 * inherits the same revalidate/expire semantics already encoded in the
 * unstable_cache `revalidate` option above.
 */
export function revalidateAdminDashboard() {
  try {
    revalidateTag(ADMIN_DASHBOARD_TAG, 'default');
  } catch {
    // Outside a request/action context (cron/MCP/tests) — revalidation is a
    // best-effort cache hint; the TTL will catch up.
  }
}
