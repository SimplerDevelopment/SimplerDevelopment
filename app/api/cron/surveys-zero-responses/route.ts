import { NextResponse } from 'next/server';
import { withCronHealth } from '@/lib/cron-health';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { surveys, surveyResponses } from '@/lib/db/schema/surveys';
import { crmNotifications } from '@/lib/db/schema/crm';
import { createCrmNotification } from '@/lib/crm/notifications';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Cron: weekly scan for "active" surveys (the published-equivalent status in
 * this schema — values are draft/active/closed) that have been live for at
 * least 14 days but no more than 60 days and have not yet received a single
 * response. For each match we file an in-app CRM notification to the survey
 * owner (surveys.createdBy) so they can act before the survey gets stale.
 *
 * No schema changes — dedupe is enforced by querying crm_notifications for
 * an existing notification with type='survey_zero_responses' and
 * entityType='survey', entityId=<survey.id> issued in the last 14 days. If
 * one exists we skip. Cadence target is weekly, so a 14-day window safely
 * covers two consecutive cron firings without flapping.
 *
 * Auth: Vercel cron header OR `Authorization: Bearer ${CRON_SECRET}`.
 */
async function _GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  if (!isVercelCron && cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const t0 = Date.now();
  const now = Date.now();
  const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
  const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;
  const lowerBound = new Date(now - SIXTY_DAYS_MS); // oldest survey still in window
  const upperBound = new Date(now - FOURTEEN_DAYS_MS); // youngest survey eligible
  const dedupeSince = new Date(now - FOURTEEN_DAYS_MS);

  // Candidate surveys: status='active' (published-equivalent), createdAt
  // between 14 and 60 days ago, zero rows in survey_responses. We use a
  // correlated NOT EXISTS via raw SQL — hard-coding the table.column on the
  // outer ref because Drizzle's ${table.col} interpolation emits the column
  // unqualified inside subqueries (per the team learning on this).
  const candidates = await db
    .select({
      id: surveys.id,
      title: surveys.title,
      clientId: surveys.clientId,
      createdBy: surveys.createdBy,
      createdAt: surveys.createdAt,
    })
    .from(surveys)
    .where(
      and(
        eq(surveys.status, 'active'),
        gte(surveys.createdAt, lowerBound),
        lte(surveys.createdAt, upperBound),
        sql`NOT EXISTS (SELECT 1 FROM survey_responses WHERE survey_responses.survey_id = surveys.id)`,
      ),
    );

  const scanned = candidates.length;
  let matched = 0;
  let notified = 0;
  let skippedDup = 0;
  let skippedNoOwner = 0;

  for (const s of candidates) {
    matched++;

    // Owner FK can be null (onDelete: set null). If we don't know who to
    // notify, skip — falling back to client-wide broadcast would be noisy
    // for a stale-survey nudge.
    if (s.createdBy == null) {
      skippedNoOwner++;
      continue;
    }

    // Dedupe: skip if a survey_zero_responses notification for this survey
    // was already filed in the last 14 days.
    const [existing] = await db
      .select({ id: crmNotifications.id })
      .from(crmNotifications)
      .where(
        and(
          eq(crmNotifications.type, 'survey_zero_responses'),
          eq(crmNotifications.entityType, 'survey'),
          eq(crmNotifications.entityId, s.id),
          gte(crmNotifications.createdAt, dedupeSince),
        ),
      )
      .limit(1);

    if (existing) {
      skippedDup++;
      continue;
    }

    await createCrmNotification({
      clientId: s.clientId,
      userId: s.createdBy,
      type: 'survey_zero_responses',
      title: `Survey "${s.title}" has 0 responses after 14 days`,
      body: 'This survey has been live for two weeks without a response. Try sharing the link in an email campaign, embedding it on your site, or checking that the distribution channel is working.',
      entityType: 'survey',
      entityId: s.id,
    });
    notified++;
  }

  const durationMs = Date.now() - t0;

  return NextResponse.json({
    success: true,
    data: {
      scanned,
      matched,
      notified,
      skippedDup,
      skippedNoOwner,
      durationMs,
    },
  });
}

export const GET = withCronHealth(
  { name: 'api-cron:surveys-zero-responses', area: 'api-cron' },
  _GET,
);
