import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { notifyAllClientUsers } from '@/lib/crm/notifications';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Cron: daily scan for automation rules whose most recent 5 runs are ALL in
 * status='failed'. For each match, file a single in-app `crm_notifications`
 * row per member of the owning tenant (broadcast via `notifyAllClientUsers`)
 * so the whole team sees the failure — automation breakage is a team concern,
 * not a single user's inbox item.
 *
 * Track B sibling of `simplerdevelopment-routines/.github/workflows/
 * sd2026-failing-automations-digest.yml` (which mails the same signal to
 * SimplerDevelopment via Resend). This route routes the SAME signal to the
 * tenant's CRM inbox instead.
 *
 * SQL approach: ports the CTE/window-function query from
 * `simplerdevelopment-routines/simplerdevelopment2026/scripts/routines/
 * failing-automations-digest.ts` verbatim — ROW_NUMBER() over rule_id
 * partitions to grab the most recent RUN_WINDOW logs per rule, then a
 * rule_summary CTE counts how many of those 5 are 'failed'. A rule is
 * "consistently failing" iff there are exactly RUN_WINDOW recent runs AND
 * every one has status='failed'. Rules with fewer than RUN_WINDOW total runs
 * are excluded (insufficient signal). 'partial' status does NOT count as
 * failure.
 *
 * De-dupe: skip any rule that already has an `automation_failing`
 * notification on the same `entityId` issued in the last 24 hours, so a
 * persistently-broken rule doesn't get re-broadcast on every daily tick.
 *
 * Auth: Vercel cron header OR `Authorization: Bearer ${CRON_SECRET}` (matches
 * `app/api/cron/process-embeddings/route.ts`).
 */

const RUN_WINDOW = 5;
const ERROR_TRUNCATE = 160;

function truncateError(s: string | null | undefined, n: number): string {
  if (!s) return '';
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : t.slice(0, n - 1) + '…';
}

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  if (!isVercelCron && cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const t0 = Date.now();

  // Single round trip: rule-summary CTE + last-error CTE + dedupe LATERAL.
  // The dedupe lookup is folded in here so we can decide skip-vs-notify in JS
  // without a second query per rule.
  type CandidateRow = {
    clientId: number;
    ruleId: number;
    ruleName: string;
    lastFailureAt: Date;
    lastErrorMessage: string | null;
    totalRuns: number;
    recentDupId: number | null;
  };

  const result = (await db.execute(sql`
    WITH ranked AS (
      SELECT
        l.id,
        l.client_id,
        l.rule_id,
        l.status,
        l.error_message,
        l.created_at,
        ROW_NUMBER() OVER (PARTITION BY l.rule_id ORDER BY l.created_at DESC) AS rn,
        COUNT(*) OVER (PARTITION BY l.rule_id) AS total_runs
      FROM automation_logs l
    ),
    recent AS (
      SELECT * FROM ranked WHERE rn <= ${RUN_WINDOW}
    ),
    rule_summary AS (
      SELECT
        rule_id,
        MIN(total_runs)::int           AS total_runs,
        COUNT(*)::int                  AS recent_count,
        SUM((status = 'failed')::int)::int AS failed_count,
        MAX(created_at)                AS last_failure_at
      FROM recent
      GROUP BY rule_id
    ),
    last_err AS (
      SELECT DISTINCT ON (rule_id)
        rule_id,
        error_message
      FROM recent
      WHERE status = 'failed'
      ORDER BY rule_id, created_at DESC
    )
    SELECT
      r.client_id          AS "clientId",
      r.id                 AS "ruleId",
      r.name               AS "ruleName",
      s.last_failure_at    AS "lastFailureAt",
      e.error_message      AS "lastErrorMessage",
      s.total_runs         AS "totalRuns",
      dup.id               AS "recentDupId"
    FROM rule_summary s
    JOIN automation_rules r ON r.id = s.rule_id
    LEFT JOIN last_err e ON e.rule_id = s.rule_id
    LEFT JOIN LATERAL (
      SELECT id
      FROM crm_notifications n
      WHERE n.type = 'automation_failing'
        AND n.entity_type = 'automation_rule'
        AND n.entity_id = r.id
        AND n.created_at > NOW() - INTERVAL '24 hours'
      LIMIT 1
    ) dup ON TRUE
    WHERE s.recent_count = ${RUN_WINDOW}
      AND s.failed_count = ${RUN_WINDOW}
    ORDER BY r.client_id ASC, s.last_failure_at DESC
  `)) as unknown as { rows: CandidateRow[] } | CandidateRow[];

  // Drizzle's neon/pg drivers differ on whether .execute() returns the array
  // directly or wrapped in { rows }. Normalise (matches stale-crm-deals).
  const candidates: CandidateRow[] = Array.isArray(result)
    ? result
    : (result as { rows: CandidateRow[] }).rows ?? [];

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

    const errSnippet = truncateError(row.lastErrorMessage, ERROR_TRUNCATE);
    const errLine = errSnippet
      ? `Most recent error: ${errSnippet}`
      : 'Most recent error: (no error message recorded)';
    const linkLine = 'Open: /portal/brain/automations';

    await notifyAllClientUsers({
      clientId: row.clientId,
      type: 'automation_failing',
      title: `Automation "${row.ruleName}" failing — ${RUN_WINDOW} consecutive errors`,
      body: `${errLine}\n${linkLine}`,
      entityType: 'automation_rule',
      entityId: row.ruleId,
    });
    notified += 1;
  }

  const durationMs = Date.now() - t0;

  return NextResponse.json({
    success: true,
    data: { scanned, matched, notified, skippedDup, durationMs },
  });
}
