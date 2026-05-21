import { db } from '@/lib/db';
import {
  brainMeetings,
  brainTasks,
  brainRelationshipOverlays,
  crmCompanies,
  crmDeals,
  type BrainTaskStatus,
} from '@/lib/db/schema';
import { eq, and, or, desc, lt, inArray, sql } from 'drizzle-orm';

export interface DashboardSummary {
  needsReviewMeetings: {
    id: number;
    title: string;
    createdAt: string;
    meetingDate: string | null;
    pendingReviewItems: number;
  }[];
  overdueTasks: DashboardTask[];
  blockedTasks: DashboardTask[];
  upcomingTasks: DashboardTask[];
  staleProspects: DashboardRelationship[];
  priorityRelationships: DashboardRelationship[];
  recentMeetings: { id: number; title: string; status: string; createdAt: string }[];
  counts: {
    pendingReviewItems: number;
    openTasks: number;
    aiCreatedTasks: number;
    relationships: number;
    glossaryTermsActive: number;
  };
}

interface DashboardTask {
  id: number;
  title: string;
  status: BrainTaskStatus;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dueDate: string | null;
  createdByAi: boolean;
  meetingId: number | null;
  companyId: number | null;
  dealId: number | null;
  /** Display name of the linked CRM record (looked up server-side). */
  linkedName: string | null;
}

interface DashboardRelationship {
  overlayId: number;
  type: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  name: string;
  underlying: 'company' | 'deal';
  lastTouchAt: string | null;
  nextReviewAt: string | null;
  daysSinceTouch: number | null;
  staleAfterDays: number | null;
  openTaskCount: number;
}

export async function getDashboardSummary(clientId: number): Promise<DashboardSummary> {
  const now = new Date();
  const nowIso = now.toISOString();

  // ── Pull a few result sets in parallel; rest are derived afterward.
  const [
    needsReviewMeetingRows,
    recentMeetingRows,
    pendingReviewItemRows,
    overdueRows,
    blockedRows,
    upcomingRows,
    overlayRows,
    countsRow,
  ] = await Promise.all([
    db.select({ id: brainMeetings.id, title: brainMeetings.title, createdAt: brainMeetings.createdAt, meetingDate: brainMeetings.meetingDate })
      .from(brainMeetings)
      .where(and(eq(brainMeetings.clientId, clientId), eq(brainMeetings.status, 'needs_review')))
      .orderBy(desc(brainMeetings.createdAt))
      .limit(5),
    db.select({ id: brainMeetings.id, title: brainMeetings.title, status: brainMeetings.status, createdAt: brainMeetings.createdAt })
      .from(brainMeetings)
      .where(eq(brainMeetings.clientId, clientId))
      .orderBy(desc(brainMeetings.createdAt))
      .limit(5),
    // Pending review items: per-meeting count for badge.
    db.execute<{ source_id: number; cnt: number }>(sql`
      SELECT source_id, COUNT(*)::int AS cnt
      FROM brain_ai_review_items
      WHERE client_id = ${clientId}
        AND source_type = 'meeting'
        AND status = 'pending'
      GROUP BY source_id
    `),
    // Overdue: open/in_progress tasks with dueDate < now.
    db.select().from(brainTasks)
      .where(and(
        eq(brainTasks.clientId, clientId),
        inArray(brainTasks.status, ['open', 'in_progress']),
        lt(brainTasks.dueDate, now),
      ))
      .orderBy(brainTasks.dueDate)
      .limit(10),
    // Blocked tasks.
    db.select().from(brainTasks)
      .where(and(eq(brainTasks.clientId, clientId), eq(brainTasks.status, 'blocked')))
      .orderBy(desc(brainTasks.createdAt))
      .limit(5),
    // Upcoming (open, due soon, not overdue): next 14 days.
    db.select().from(brainTasks)
      .where(and(
        eq(brainTasks.clientId, clientId),
        eq(brainTasks.status, 'open'),
        sql`${brainTasks.dueDate} IS NOT NULL`,
        sql`${brainTasks.dueDate} >= ${nowIso}`,
      ))
      .orderBy(brainTasks.dueDate)
      .limit(5),
    db.select().from(brainRelationshipOverlays)
      .where(and(eq(brainRelationshipOverlays.clientId, clientId), eq(brainRelationshipOverlays.status, 'active'))),
    // Counts: pending review items total, open tasks, ai-created tasks, relationships.
    db.execute<{
      pending_review: number;
      open_tasks: number;
      ai_tasks: number;
      relationships: number;
      glossary_terms_active: number;
    }>(sql`
      SELECT
        (SELECT COUNT(*)::int FROM brain_ai_review_items WHERE client_id = ${clientId} AND status = 'pending') AS pending_review,
        (SELECT COUNT(*)::int FROM brain_tasks WHERE client_id = ${clientId} AND status IN ('open','in_progress','blocked')) AS open_tasks,
        (SELECT COUNT(*)::int FROM brain_tasks WHERE client_id = ${clientId} AND created_by_ai = true) AS ai_tasks,
        (SELECT COUNT(*)::int FROM brain_relationship_overlays WHERE client_id = ${clientId}) AS relationships,
        (SELECT COUNT(*)::int FROM brain_glossary_terms WHERE client_id = ${clientId} AND status = 'active') AS glossary_terms_active
    `),
  ]);

  // ── Resolve linked CRM names for the task tiles.
  const taskCompanyIds = new Set<number>();
  const taskDealIds = new Set<number>();
  for (const t of [...overdueRows, ...blockedRows, ...upcomingRows]) {
    if (t.companyId !== null) taskCompanyIds.add(t.companyId);
    if (t.dealId !== null) taskDealIds.add(t.dealId);
  }
  const [companyMap, dealMap] = await Promise.all([
    taskCompanyIds.size > 0
      ? db.select({ id: crmCompanies.id, name: crmCompanies.name }).from(crmCompanies)
        .where(and(inArray(crmCompanies.id, [...taskCompanyIds]), eq(crmCompanies.clientId, clientId)))
      : Promise.resolve([] as { id: number; name: string }[]),
    taskDealIds.size > 0
      ? db.select({ id: crmDeals.id, title: crmDeals.title }).from(crmDeals)
        .where(and(inArray(crmDeals.id, [...taskDealIds]), eq(crmDeals.clientId, clientId)))
      : Promise.resolve([] as { id: number; title: string }[]),
  ]);
  const companyNameById = new Map(companyMap.map((c) => [c.id, c.name]));
  const dealNameById = new Map(dealMap.map((d) => [d.id, d.title]));

  const decorateTask = (t: typeof overdueRows[number]): DashboardTask => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority as DashboardTask['priority'],
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    createdByAi: t.createdByAi,
    meetingId: t.meetingId,
    companyId: t.companyId,
    dealId: t.dealId,
    linkedName: t.companyId !== null
      ? companyNameById.get(t.companyId) ?? null
      : t.dealId !== null
        ? dealNameById.get(t.dealId) ?? null
        : null,
  });

  // ── Resolve relationship-overlay underlying records + open task counts.
  const overlayCompanyIds = overlayRows.map((o) => o.companyId).filter((v): v is number => v !== null);
  const overlayDealIds = overlayRows.map((o) => o.dealId).filter((v): v is number => v !== null);

  const [overlayCompanies, overlayDeals, overlayTaskCounts] = await Promise.all([
    overlayCompanyIds.length > 0
      ? db.select({ id: crmCompanies.id, name: crmCompanies.name }).from(crmCompanies)
        .where(and(inArray(crmCompanies.id, overlayCompanyIds), eq(crmCompanies.clientId, clientId)))
      : Promise.resolve([] as { id: number; name: string }[]),
    overlayDealIds.length > 0
      ? db.select({ id: crmDeals.id, title: crmDeals.title }).from(crmDeals)
        .where(and(inArray(crmDeals.id, overlayDealIds), eq(crmDeals.clientId, clientId)))
      : Promise.resolve([] as { id: number; title: string }[]),
    overlayCompanyIds.length + overlayDealIds.length > 0
      ? db.select({
          companyId: brainTasks.companyId,
          dealId: brainTasks.dealId,
          cnt: sql<number>`count(*)::int`,
        })
        .from(brainTasks)
        .where(and(
          eq(brainTasks.clientId, clientId),
          inArray(brainTasks.status, ['open', 'in_progress', 'blocked']),
          or(
            overlayCompanyIds.length > 0 ? inArray(brainTasks.companyId, overlayCompanyIds) : sql`false`,
            overlayDealIds.length > 0 ? inArray(brainTasks.dealId, overlayDealIds) : sql`false`,
          ),
        ))
        .groupBy(brainTasks.companyId, brainTasks.dealId)
      : Promise.resolve([] as { companyId: number | null; dealId: number | null; cnt: number }[]),
  ]);

  const overlayCompanyName = new Map(overlayCompanies.map((c) => [c.id, c.name]));
  const overlayDealName = new Map(overlayDeals.map((d) => [d.id, d.title]));
  const taskCountByKey = new Map<string, number>();
  for (const r of overlayTaskCounts) {
    if (r.companyId !== null) taskCountByKey.set(`c:${r.companyId}`, r.cnt);
    if (r.dealId !== null) taskCountByKey.set(`d:${r.dealId}`, r.cnt);
  }

  const decorated: DashboardRelationship[] = overlayRows
    .map((o): DashboardRelationship | null => {
      let name: string | undefined;
      let underlying: 'company' | 'deal';
      let key = '';
      if (o.companyId !== null) {
        name = overlayCompanyName.get(o.companyId);
        underlying = 'company';
        key = `c:${o.companyId}`;
      } else if (o.dealId !== null) {
        name = overlayDealName.get(o.dealId);
        underlying = 'deal';
        key = `d:${o.dealId}`;
      } else {
        return null;
      }
      if (!name) return null;
      const daysSinceTouch = o.lastTouchAt
        ? Math.floor((now.getTime() - o.lastTouchAt.getTime()) / 86400000)
        : null;
      return {
        overlayId: o.id,
        type: o.relationshipType,
        priority: o.priority as DashboardRelationship['priority'],
        name,
        underlying,
        lastTouchAt: o.lastTouchAt ? o.lastTouchAt.toISOString() : null,
        nextReviewAt: o.nextReviewAt ? o.nextReviewAt.toISOString() : null,
        daysSinceTouch,
        staleAfterDays: o.staleAfterDays,
        openTaskCount: taskCountByKey.get(key) ?? 0,
      };
    })
    .filter((v): v is DashboardRelationship => v !== null);

  // Stale = staleAfterDays set AND daysSinceTouch > threshold.
  const staleProspects = decorated
    .filter((r) => r.staleAfterDays !== null && r.daysSinceTouch !== null && r.daysSinceTouch > r.staleAfterDays)
    .sort((a, b) => (b.daysSinceTouch ?? 0) - (a.daysSinceTouch ?? 0))
    .slice(0, 5);

  const priorityRanking: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  const priorityRelationships = decorated
    .filter((r) => r.priority === 'critical' || r.priority === 'high')
    .sort((a, b) => (priorityRanking[b.priority] ?? 0) - (priorityRanking[a.priority] ?? 0))
    .slice(0, 5);

  // Map pending review counts by meeting id.
  const pendingByMeeting = new Map<number, number>();
  for (const r of pendingReviewItemRows) {
    pendingByMeeting.set(r.source_id, r.cnt);
  }

  const counts = countsRow[0] ?? { pending_review: 0, open_tasks: 0, ai_tasks: 0, relationships: 0, glossary_terms_active: 0 };

  return {
    needsReviewMeetings: needsReviewMeetingRows.map((m) => ({
      id: m.id,
      title: m.title,
      createdAt: m.createdAt.toISOString(),
      meetingDate: m.meetingDate ? m.meetingDate.toISOString() : null,
      pendingReviewItems: pendingByMeeting.get(m.id) ?? 0,
    })),
    overdueTasks: overdueRows.map(decorateTask),
    blockedTasks: blockedRows.map(decorateTask),
    upcomingTasks: upcomingRows.map(decorateTask),
    staleProspects,
    priorityRelationships,
    recentMeetings: recentMeetingRows.map((m) => ({
      id: m.id,
      title: m.title,
      status: m.status,
      createdAt: m.createdAt.toISOString(),
    })),
    counts: {
      pendingReviewItems: counts.pending_review ?? 0,
      openTasks: counts.open_tasks ?? 0,
      aiCreatedTasks: counts.ai_tasks ?? 0,
      relationships: counts.relationships ?? 0,
      glossaryTermsActive: counts.glossary_terms_active ?? 0,
    },
  };
}
