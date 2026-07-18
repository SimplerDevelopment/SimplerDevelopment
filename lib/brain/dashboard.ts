import { unstable_cache, revalidateTag } from 'next/cache';
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

/**
 * Cache TTLs for the brain dashboard summary.
 *
 * The full dashboard payload is recomputed at most every {@link DASHBOARD_TTL_SECONDS},
 * and explicitly revalidated by the mutation paths in lib/brain/* via
 * {@link revalidateBrainDashboard}. The slowly-changing rollups (org units,
 * expertise tags, glossary terms) are split into their own longer-TTL cache
 * so the page can fold them in without forcing a full recompute on every nav.
 */
const DASHBOARD_TTL_SECONDS = 60;
const STATIC_COUNTS_TTL_SECONDS = 600;

/** Per-client cache tag for the full dashboard summary. */
export const brainDashboardTag = (clientId: number): string => `brain-dashboard:${clientId}`;
/** Per-client cache tag for the slowly-changing static counts subset. */
export const brainStaticCountsTag = (clientId: number): string => `brain-static-counts:${clientId}`;

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
    /** Initiatives where status='active'. Added Wave 2c. */
    initiativesActive: number;
    /** Goals where status IN ('at_risk', 'off_track'). Added Wave 2c. */
    goalsAtRisk: number;
    /** Goals where status='achieved' AND lastCheckedInAt > now() - interval '90 days'. Added Wave 2c. */
    goalsAchievedThisQuarter: number;
    peopleActive: number;
    orgUnitCount: number;
    expertiseTagsCount: number;
    glossaryTermsActive: number;
    /** Playbook runs where status='active'. Added Wave 2c. */
    playbookRunsActive: number;
    /** Playbook runs where status='paused'. Added Wave 2c. */
    playbookRunsPaused: number;
    /** Documents where status='published'. Added Wave 2c (documents). */
    documentsPublished: number;
    /** Documents where status='draft'. Added Wave 2c (documents). */
    documentsDraft: number;
    /**
     * Required-reads on the currently published version of each document
     * where the assigned person has NOT yet acknowledged. Org-unit required-
     * reads are intentionally NOT expanded here (cost) — that's what
     * brain_document_compliance_report is for. Added Wave 2c (documents).
     */
    documentsRequiredReadsPending: number;
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

interface StaticBrainCounts extends Record<string, unknown> {
  org_unit_count: number;
  expertise_tags_count: number;
  glossary_terms_active: number;
}

/**
 * Slowly-changing brain rollups (org units / expertise tags / glossary terms).
 * Cached on a longer TTL than the main dashboard so the page can fold them in
 * without forcing a full recompute on every nav. Wired into write paths that
 * touch glossary / org units / expertise via {@link revalidateBrainStaticCounts}.
 */
async function _getStaticBrainCounts(clientId: number): Promise<StaticBrainCounts> {
  const rows = await db.execute<StaticBrainCounts>(sql`
    SELECT
      (SELECT COUNT(*)::int FROM brain_org_units WHERE client_id = ${clientId}) AS org_unit_count,
      (SELECT COUNT(*)::int FROM brain_expertise_tags WHERE client_id = ${clientId}) AS expertise_tags_count,
      (SELECT COUNT(*)::int FROM brain_glossary_terms WHERE client_id = ${clientId} AND status = 'active') AS glossary_terms_active
  `);
  return rows[0] ?? { org_unit_count: 0, expertise_tags_count: 0, glossary_terms_active: 0 };
}

/**
 * Cache-wrapped accessor for {@link _getStaticBrainCounts}. We build a fresh
 * `unstable_cache` per `clientId` so we can emit a per-client tag
 * (`brain-static-counts:${clientId}`) — `unstable_cache`'s `tags` array is
 * static at definition time, so a per-client wrapper is the cleanest way to
 * get tenant-scoped invalidation. The inner cache key includes `clientId` so
 * different tenants get distinct cache entries even though the key array
 * shares the `brain-static-counts` prefix.
 */
export async function getStaticBrainCounts(clientId: number): Promise<StaticBrainCounts> {
  try {
    // `await` inside the try so the async "incrementalCache missing" rejection
    // is caught here (a bare `return promise` escapes the try/catch).
    return await unstable_cache(
      async (cid: number) => _getStaticBrainCounts(cid),
      ['brain-static-counts', String(clientId)],
      {
        revalidate: STATIC_COUNTS_TTL_SECONDS,
        tags: [brainStaticCountsTag(clientId), 'brain-static-counts'],
      },
    )(clientId);
  } catch {
    // Outside a request context (tests/cron) — incrementalCache unavailable.
    return _getStaticBrainCounts(clientId);
  }
}

async function _getDashboardSummary(clientId: number): Promise<DashboardSummary> {
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
    staticCounts,
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
    // Counts: pending review items total, open tasks, ai-created tasks, relationships,
    // initiatives active, goals at risk, goals achieved this quarter (last 90d),
    // plus people / documents / playbooks rollups. NOTE: the slowly-changing
    // org_units / expertise_tags / glossary_terms_active counts have been
    // hoisted into getStaticBrainCounts (10-minute TTL) and are merged below.
    db.execute<{
      pending_review: number;
      open_tasks: number;
      ai_tasks: number;
      relationships: number;
      initiatives_active: number;
      goals_at_risk: number;
      goals_achieved_q: number;
      people_active: number;
      playbook_runs_active: number;
      playbook_runs_paused: number;
      documents_published: number;
      documents_draft: number;
      documents_required_reads_pending: number;
    }>(sql`
      SELECT
        (SELECT COUNT(*)::int FROM brain_ai_review_items WHERE client_id = ${clientId} AND status = 'pending') AS pending_review,
        (SELECT COUNT(*)::int FROM brain_tasks WHERE client_id = ${clientId} AND status IN ('open','in_progress','blocked')) AS open_tasks,
        (SELECT COUNT(*)::int FROM brain_tasks WHERE client_id = ${clientId} AND created_by_ai = true) AS ai_tasks,
        (SELECT COUNT(*)::int FROM brain_relationship_overlays WHERE client_id = ${clientId}) AS relationships,
        (SELECT COUNT(*)::int FROM brain_initiatives WHERE client_id = ${clientId} AND status = 'active') AS initiatives_active,
        (SELECT COUNT(*)::int FROM brain_goals WHERE client_id = ${clientId} AND status IN ('at_risk','off_track')) AS goals_at_risk,
        (SELECT COUNT(*)::int FROM brain_goals WHERE client_id = ${clientId} AND status = 'achieved' AND last_checked_in_at IS NOT NULL AND last_checked_in_at > now() - interval '90 days') AS goals_achieved_q,
        (SELECT COUNT(*)::int FROM brain_people WHERE client_id = ${clientId} AND status = 'active') AS people_active,
        (SELECT COUNT(*)::int FROM brain_playbook_runs WHERE client_id = ${clientId} AND status = 'active') AS playbook_runs_active,
        (SELECT COUNT(*)::int FROM brain_playbook_runs WHERE client_id = ${clientId} AND status = 'paused') AS playbook_runs_paused,
        (SELECT COUNT(*)::int FROM brain_documents WHERE client_id = ${clientId} AND status = 'published') AS documents_published,
        (SELECT COUNT(*)::int FROM brain_documents WHERE client_id = ${clientId} AND status = 'draft') AS documents_draft,
        -- Required-reads where the assigned person hasn't acked the doc's
        -- current published version. Only person-target required-reads are
        -- counted; org_unit-target rows would require membership expansion
        -- and live behind brain_document_compliance_report instead. Two-step
        -- (rr count − matching ack count) merged into one expression.
        (
          SELECT COUNT(*)::int
          FROM brain_document_required_reads rr
          INNER JOIN brain_documents d
            ON d.id = rr.document_id
           AND d.client_id = rr.client_id
          WHERE rr.client_id = ${clientId}
            AND rr.target_type = 'person'
            AND d.current_published_version_id IS NOT NULL
            AND NOT EXISTS (
              SELECT 1
              FROM brain_document_acknowledgments a
              WHERE a.client_id = rr.client_id
                AND a.document_id = rr.document_id
                AND a.person_id = rr.target_id
                AND a.version_id = COALESCE(rr.pinned_version_id, d.current_published_version_id)
            )
        ) AS documents_required_reads_pending
    `),
    getStaticBrainCounts(clientId),
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

  const counts = countsRow[0] ?? {
    pending_review: 0,
    open_tasks: 0,
    ai_tasks: 0,
    relationships: 0,
    initiatives_active: 0,
    goals_at_risk: 0,
    goals_achieved_q: 0,
    people_active: 0,
    playbook_runs_active: 0,
    playbook_runs_paused: 0,
    documents_published: 0,
    documents_draft: 0,
    documents_required_reads_pending: 0,
  };

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
      initiativesActive: counts.initiatives_active ?? 0,
      goalsAtRisk: counts.goals_at_risk ?? 0,
      goalsAchievedThisQuarter: counts.goals_achieved_q ?? 0,
      peopleActive: counts.people_active ?? 0,
      orgUnitCount: staticCounts.org_unit_count ?? 0,
      expertiseTagsCount: staticCounts.expertise_tags_count ?? 0,
      glossaryTermsActive: staticCounts.glossary_terms_active ?? 0,
      playbookRunsActive: counts.playbook_runs_active ?? 0,
      playbookRunsPaused: counts.playbook_runs_paused ?? 0,
      documentsPublished: counts.documents_published ?? 0,
      documentsDraft: counts.documents_draft ?? 0,
      documentsRequiredReadsPending: counts.documents_required_reads_pending ?? 0,
    },
  };
}

/**
 * Public cache-wrapped dashboard summary accessor. Builds a fresh
 * `unstable_cache` per `clientId` so we can emit a per-client tag
 * (`brain-dashboard:${clientId}`) alongside the generic `brain-dashboard`
 * tag — the `tags` array in `unstable_cache` is static at definition time,
 * and we want tenant-scoped invalidation. The inner cache key includes
 * `clientId` so different tenants don't collide.
 *
 * Mutation paths in lib/brain/notes.ts, lib/brain/tasks.ts, lib/brain/decisions.ts,
 * lib/brain/documents.ts, lib/brain/initiatives.ts, lib/brain/goals.ts (and their
 * API/MCP entrypoints) should call {@link revalidateBrainDashboard} after a
 * successful write that changes a dashboard-counted entity. We accept up to
 * {@link DASHBOARD_TTL_SECONDS} staleness for entities whose write paths are
 * not yet wired.
 */
export async function getDashboardSummary(clientId: number): Promise<DashboardSummary> {
  try {
    // `await` inside the try so the async "incrementalCache missing" rejection
    // is caught here (a bare `return promise` escapes the try/catch).
    return await unstable_cache(
      async (cid: number) => _getDashboardSummary(cid),
      ['brain-dashboard', String(clientId)],
      {
        revalidate: DASHBOARD_TTL_SECONDS,
        tags: [brainDashboardTag(clientId), 'brain-dashboard'],
      },
    )(clientId);
  } catch {
    // Outside a request context (tests/cron) — incrementalCache unavailable.
    return _getDashboardSummary(clientId);
  }
}

/**
 * Revalidate the cached dashboard summary for one client. Safe to call from
 * any mutation path that changes a dashboard-counted entity (notes, tasks,
 * decisions, documents, initiatives, goals, etc.). Idempotent and cheap.
 */
export function revalidateBrainDashboard(clientId: number): void {
  // The generic tag invalidates every tenant's cache entry, but since each
  // tenant's args array (clientId) generates its own cache key under the hood
  // we still only fully recompute the one client that next requests it. We
  // also emit a per-client tag so future read-path wrappers can subscribe to
  // exactly one tenant if needed. Next 16 requires a CacheLife profile arg;
  // 'default' inherits the same revalidate/expire semantics already encoded
  // in the unstable_cache `revalidate` option on each accessor.
  try {
    revalidateTag(brainDashboardTag(clientId), 'default');
    revalidateTag('brain-dashboard', 'default');
  } catch {
    // Outside a request/action context (tests/cron) — revalidateTag is unavailable.
    // Degrade gracefully: the TTL will catch up.
  }
}

/**
 * Revalidate the cached slowly-changing brain counts (org units, expertise
 * tags, glossary terms) for one client. Call from glossary / org-unit /
 * expertise write paths so the dashboard reflects the change without waiting
 * for the 10-minute TTL. Also bumps the main dashboard cache, since the
 * static counts feed into the dashboard payload.
 */
export function revalidateBrainStaticCounts(clientId: number): void {
  try {
    revalidateTag(brainStaticCountsTag(clientId), 'default');
    revalidateTag('brain-static-counts', 'default');
  } catch {
    // Outside a request/action context (tests/cron) — revalidateTag is unavailable.
    // Degrade gracefully: the TTL will catch up.
  }
  revalidateBrainDashboard(clientId);
}
