import { NextResponse } from 'next/server';
import { withCronHealth } from '@/lib/cron-health';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { createCrmNotification } from '@/lib/crm/notifications';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Cron: weekly scan for stale CRM deals.
 *
 * Definition of "stale": a deal whose status is still 'open' (i.e. not in a
 * terminal won/lost state — `crm_deals.status` is the canonical terminal flag;
 * `crm_pipeline_stages` has no terminal column) AND whose most recent
 * `crm_activities.created_at` is more than 30 days ago. Deals that have NEVER
 * recorded an activity also qualify, but only once they themselves are >30 days
 * old (so a brand-new deal isn't immediately flagged).
 *
 * For each match we issue a single in-app `crm_notifications` row to the deal
 * owner. Owner resolution: `crm_deals.owner_id` if set, otherwise fall back to
 * the client's primary user (`clients.user_id`) — `crm_deals` has no
 * `createdBy` column, so the client owner is the only sane backstop.
 *
 * De-dupe: skip any deal that already has a `deal_stale` notification on the
 * same `entityId` issued in the last 30 days, so a deal that stays stale
 * doesn't get notified every weekly tick.
 *
 * Auth: Vercel cron header OR `Authorization: Bearer ${CRON_SECRET}` (matches
 * `app/api/cron/process-embeddings/route.ts`).
 */
async function _GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const t0 = Date.now();

  // Single round trip: candidate deals (open status) joined with
  // last-activity timestamp + stage name + client-fallback owner. We also
  // left-join the de-dupe window so we can decide skip-vs-notify in JS
  // without a second query per deal.
  type CandidateRow = {
    dealId: number;
    clientId: number;
    title: string;
    ownerId: number | null;
    fallbackOwnerId: number;
    stageName: string;
    lastActivityAt: Date | null;
    dealCreatedAt: Date;
    recentDupId: number | null;
  };

  const rows = (await db.execute(sql`
    SELECT
      d.id AS "dealId",
      d.client_id AS "clientId",
      d.title AS "title",
      d.owner_id AS "ownerId",
      c.user_id AS "fallbackOwnerId",
      s.name AS "stageName",
      la.last_activity_at AS "lastActivityAt",
      d.created_at AS "dealCreatedAt",
      dup.id AS "recentDupId"
    FROM crm_deals d
    INNER JOIN clients c ON c.id = d.client_id
    INNER JOIN crm_pipeline_stages s ON s.id = d.stage_id
    LEFT JOIN (
      SELECT deal_id, MAX(created_at) AS last_activity_at
      FROM crm_activities
      WHERE deal_id IS NOT NULL
      GROUP BY deal_id
    ) la ON la.deal_id = d.id
    LEFT JOIN LATERAL (
      SELECT id
      FROM crm_notifications n
      WHERE n.type = 'deal_stale'
        AND n.entity_type = 'deal'
        AND n.entity_id = d.id
        AND n.created_at > NOW() - INTERVAL '30 days'
      LIMIT 1
    ) dup ON TRUE
    WHERE d.status = 'open'
      AND (
        (la.last_activity_at IS NOT NULL AND la.last_activity_at < NOW() - INTERVAL '30 days')
        OR (la.last_activity_at IS NULL AND d.created_at < NOW() - INTERVAL '30 days')
      )
  `)) as unknown as { rows: CandidateRow[] } | CandidateRow[];

  // drizzle's neon/pg drivers differ on whether .execute() returns the array
  // directly or wrapped in { rows }. Normalise.
  const candidates: CandidateRow[] = Array.isArray(rows)
    ? rows
    : (rows as { rows: CandidateRow[] }).rows ?? [];

  const scanned = candidates.length;
  let matched = 0;
  let notified = 0;
  let skippedDup = 0;

  for (const row of candidates) {
    matched += 1;

    if (row.recentDupId !== null) {
      skippedDup += 1;
      continue;
    }

    const recipientId = row.ownerId ?? row.fallbackOwnerId;
    if (!recipientId) continue;

    const lastActivityLine = row.lastActivityAt
      ? `Last activity: ${new Date(row.lastActivityAt).toISOString().slice(0, 10)}`
      : 'Last activity: (no activity recorded)';
    const stageLine = `Stage: ${row.stageName}`;

    await createCrmNotification({
      clientId: row.clientId,
      userId: recipientId,
      type: 'deal_stale',
      title: `Deal "${row.title}" — no activity in 30+ days`,
      body: `${lastActivityLine}\n${stageLine}`,
      entityType: 'deal',
      entityId: row.dealId,
    });
    notified += 1;
  }

  const durationMs = Date.now() - t0;

  return NextResponse.json({
    success: true,
    data: { scanned, matched, notified, skippedDup, durationMs },
  });
}

export const GET = withCronHealth(
  { name: 'api-cron:stale-crm-deals', area: 'api-cron' },
  _GET,
);
