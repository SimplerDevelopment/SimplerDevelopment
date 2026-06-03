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
  clientWebsites, projects, supportTickets, invoices,
} from '@/lib/db/schema';
import { eq, sql, and, or, inArray, lt, desc } from 'drizzle-orm';

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

  const [servicesAgg, websitesAgg, projectsAgg, ticketsAgg, revenueAgg, mrrAgg] = await Promise.all([
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
    db
      .select({
        clientId: clientServices.clientId,
        mrr: sql<number>`coalesce(sum(case when ${services.billingCycle} = 'monthly' then ${services.price} when ${services.billingCycle} = 'annually' then ${services.price} / 12 else 0 end), 0)::bigint`,
      })
      .from(clientServices)
      .innerJoin(services, eq(services.id, clientServices.serviceId))
      .where(and(inArray(clientServices.clientId, clientIds), eq(clientServices.status, 'active')))
      .groupBy(clientServices.clientId),
  ]);

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
  for (const row of mrrAgg) byClient.get(row.clientId)!.mrr = Number(row.mrr);

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
