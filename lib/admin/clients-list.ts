// Shared loader for the admin clients list — used by both the
// app/api/admin/portal/clients endpoint and the admin/clients RSC page.
//
// E2 perf — the prior implementation issued six scalar correlated subqueries
// per client row (activeServices / websiteCount / activeProjects / openTickets
// / totalRevenue / MRR). New shape: one base SELECT for the page (with
// keyset cursor + limit) + six grouped aggregate queries restricted to that
// page's client ids, run in parallel. Each aggregate query lands on the new
// (clientId, status, …) indexes from 0132_perf_admin_approvals_indexes.sql.

import { db } from '@/lib/db';
import {
  clients, users, clientServices, services,
  clientWebsites, projects, supportTickets, invoices, clientMembers,
} from '@/lib/db/schema';
import { eq, sql, and, or, inArray, lt, desc } from 'drizzle-orm';
import {
  FEATURE_DOMAINS, SEAT_PRICE_CAP_CENTS, computeAccountBilling,
} from '@/lib/billing/domain-catalog';

// À-la-carte module SKUs are keyed by domain (e.g. 'crm'); tier SKUs ('plan-*')
// and add-ons (hosting, etc.) are summed at their raw monthly price.
const MODULE_CATEGORIES = new Set(FEATURE_DOMAINS.map((d) => d.key));
const monthlyCents = (price: number, cycle: string | null) =>
  cycle === 'monthly' ? price : cycle === 'annually' ? Math.round(price / 12) : 0;

export const DEFAULT_ADMIN_CLIENTS_PAGE_SIZE = 100;
export const MAX_ADMIN_CLIENTS_PAGE_SIZE = 200;

export interface AdminClientsCursor {
  createdAt: string;
  id: number;
}

export interface AdminClientRow {
  id: number;
  userId: number;
  company: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  notes: string | null;
  createdAt: Date;
  userName: string;
  userEmail: string;
  userActive: boolean;
  activeServices: number;
  websiteCount: number;
  activeProjects: number;
  openTickets: number;
  totalRevenue: number;
  mrr: number;
}

export interface AdminClientsPage {
  data: AdminClientRow[];
  nextCursor: AdminClientsCursor | null;
}

export async function listAdminClients(opts: {
  limit?: number;
  cursor?: AdminClientsCursor | null;
} = {}): Promise<AdminClientsPage> {
  const limit = Math.min(
    Math.max(opts.limit ?? DEFAULT_ADMIN_CLIENTS_PAGE_SIZE, 1),
    MAX_ADMIN_CLIENTS_PAGE_SIZE,
  );
  const cursor = opts.cursor;

  const whereExpr = cursor
    ? or(
        lt(clients.createdAt, new Date(cursor.createdAt)),
        and(eq(clients.createdAt, new Date(cursor.createdAt)), lt(clients.id, cursor.id)),
      )
    : undefined;

  const baseRows = await db
    .select({
      id: clients.id,
      userId: clients.userId,
      company: clients.company,
      phone: clients.phone,
      website: clients.website,
      address: clients.address,
      notes: clients.notes,
      createdAt: clients.createdAt,
      userName: users.name,
      userEmail: users.email,
      userActive: users.active,
    })
    .from(clients)
    .innerJoin(users, eq(clients.userId, users.id))
    .where(whereExpr)
    .orderBy(desc(clients.createdAt), desc(clients.id))
    .limit(limit + 1);

  const hasMore = baseRows.length > limit;
  const pageRows = hasMore ? baseRows.slice(0, limit) : baseRows;
  const clientIds = pageRows.map(r => r.id);

  if (clientIds.length === 0) {
    return { data: [], nextCursor: null };
  }

  const [servicesAgg, websitesAgg, projectsAgg, ticketsAgg, revenueAgg, serviceRows, seatRows] = await Promise.all([
    db
      .select({ clientId: clientServices.clientId, count: sql<number>`count(*)::int` })
      .from(clientServices)
      .where(and(inArray(clientServices.clientId, clientIds), eq(clientServices.status, 'active')))
      .groupBy(clientServices.clientId),
    db
      .select({ clientId: clientWebsites.clientId, count: sql<number>`count(*)::int` })
      .from(clientWebsites)
      .where(inArray(clientWebsites.clientId, clientIds))
      .groupBy(clientWebsites.clientId),
    db
      .select({ clientId: projects.clientId, count: sql<number>`count(*)::int` })
      .from(projects)
      .where(and(inArray(projects.clientId, clientIds), eq(projects.status, 'active')))
      .groupBy(projects.clientId),
    db
      .select({ clientId: supportTickets.clientId, count: sql<number>`count(*)::int` })
      .from(supportTickets)
      .where(and(
        inArray(supportTickets.clientId, clientIds),
        inArray(supportTickets.status, ['open', 'in_progress']),
      ))
      .groupBy(supportTickets.clientId),
    db
      .select({
        clientId: invoices.clientId,
        total: sql<number>`coalesce(sum(${invoices.total}), 0)::bigint`,
      })
      .from(invoices)
      .where(and(inArray(invoices.clientId, clientIds), eq(invoices.status, 'paid')))
      .groupBy(invoices.clientId),
    // Active recurring service rows per client — MRR is computed in JS so it can
    // apply the volume discount (modules) and the per-seat charge, which a flat
    // SUM(price) cannot. (Returns rows, not an aggregate.)
    db
      .select({
        clientId: clientServices.clientId,
        category: services.category,
        price: services.price,
        billingCycle: services.billingCycle,
      })
      .from(clientServices)
      .innerJoin(services, eq(services.id, clientServices.serviceId))
      .where(and(inArray(clientServices.clientId, clientIds), eq(clientServices.status, 'active'))),
    // Billable seats per client: the owner (always 1) + accepted members
    // (invite token cleared), deduped against the owner.
    db
      .select({
        clientId: clients.id,
        extraAccepted: sql<number>`count(distinct ${clientMembers.userId}) filter (where ${users.inviteToken} is null and ${clientMembers.userId} <> ${clients.userId})::int`,
      })
      .from(clients)
      .leftJoin(clientMembers, eq(clientMembers.clientId, clients.id))
      .leftJoin(users, eq(users.id, clientMembers.userId))
      .where(inArray(clients.id, clientIds))
      .groupBy(clients.id),
  ]);

  // ── MRR per client (modules → volume-discounted + seats; bundle → flat +
  //    seats; tiers/other → raw monthly) ──────────────────────────────────────
  const seatsByClient = new Map<number, number>(clientIds.map((id) => [id, 1]));
  for (const r of seatRows) seatsByClient.set(r.clientId, 1 + Number(r.extraAccepted ?? 0));

  const svcByClient = new Map<number, { category: string; monthly: number }[]>(clientIds.map((id) => [id, []]));
  for (const r of serviceRows) {
    svcByClient.get(r.clientId)!.push({ category: r.category, monthly: monthlyCents(r.price ?? 0, r.billingCycle) });
  }

  const mrrByClient = new Map<number, number>();
  for (const id of clientIds) {
    const seats = seatsByClient.get(id) ?? 1;
    const rows = svcByClient.get(id) ?? [];
    const modulePrices: number[] = [];
    let bundleMonthly = 0, tierAndOther = 0;
    for (const r of rows) {
      if (r.category === 'bundle') bundleMonthly += r.monthly;
      else if (MODULE_CATEGORIES.has(r.category)) modulePrices.push(r.monthly);
      else tierAndOther += r.monthly; // tier SKUs + hosting/other recurring add-ons
    }
    let base = 0;
    if (bundleMonthly > 0) {
      base = bundleMonthly + Math.min(bundleMonthly, SEAT_PRICE_CAP_CENTS) * Math.max(0, seats - 1);
    } else if (modulePrices.length > 0) {
      base = computeAccountBilling(modulePrices, seats).totalCents;
    }
    mrrByClient.set(id, base + tierAndOther);
  }

  type Counts = Pick<
    AdminClientRow,
    'activeServices' | 'websiteCount' | 'activeProjects' | 'openTickets' | 'totalRevenue' | 'mrr'
  >;
  const blank: Counts = {
    activeServices: 0, websiteCount: 0, activeProjects: 0, openTickets: 0, totalRevenue: 0, mrr: 0,
  };
  const byClient = new Map<number, Counts>();
  for (const id of clientIds) byClient.set(id, { ...blank });
  for (const row of servicesAgg) byClient.get(row.clientId)!.activeServices = Number(row.count);
  for (const row of websitesAgg) byClient.get(row.clientId)!.websiteCount = Number(row.count);
  for (const row of projectsAgg) byClient.get(row.clientId)!.activeProjects = Number(row.count);
  for (const row of ticketsAgg) byClient.get(row.clientId)!.openTickets = Number(row.count);
  for (const row of revenueAgg) byClient.get(row.clientId)!.totalRevenue = Number(row.total);
  for (const id of clientIds) byClient.get(id)!.mrr = mrrByClient.get(id) ?? 0;

  const data: AdminClientRow[] = pageRows.map(r => ({
    ...r,
    ...byClient.get(r.id)!,
  }));

  const last = pageRows[pageRows.length - 1];
  const nextCursor: AdminClientsCursor | null = hasMore && last
    ? { createdAt: last.createdAt.toISOString(), id: last.id }
    : null;

  return { data, nextCursor };
}
