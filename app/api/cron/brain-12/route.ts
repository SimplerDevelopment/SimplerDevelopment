import { NextResponse } from 'next/server';
import { withCronHealth } from '@/lib/cron-health';
import { db } from '@/lib/db';
import { brainNotes } from '@/lib/db/schema/brain';
import { kanbanCardComments } from '@/lib/db/schema/pm';
import { and, eq, isNull, sql as drizzleSql, like } from 'drizzle-orm';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * BRAIN-12 cleanup cron — one-shot dates over a daily schedule.
 *
 * Two firing dates, both no-ops on any other day:
 *   2026-05-26 → day-14 reminder comment on card 153 (idempotent: skip if a
 *                comment with the magic prefix already exists).
 *   2026-06-06 → bulk soft-delete: set deleted_at = NOW() on all client 100
 *                brain_notes tagged `pending_deletion` that aren't already
 *                deleted. Idempotent: a re-run does nothing because the WHERE
 *                excludes already-deleted rows.
 *
 * Scoped to Post Captain (client 100). If future BRAIN cleanups need the
 * same mechanism for other clients, parameterize or fork this route.
 *
 * Auth: same pattern as other brain crons — Vercel cron header OR
 * `Authorization: Bearer ${CRON_SECRET}`.
 *
 * Suggested schedule: 7:30 UTC daily (after brain-empty-old-trash at 7:15).
 */

const CLIENT_ID = 100;
const CARD_ID = 153;
const REMINDER_DATE = '2026-05-26';
const EXECUTION_DATE = '2026-06-06';
const REMINDER_PREFIX = 'BRAIN-12 reminder (cron):';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function _GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  if (!isVercelCron && cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const t0 = Date.now();
  const day = today();
  const result: Record<string, unknown> = { date: day, action: 'noop' };

  if (day === REMINDER_DATE) {
    // Day-14 reminder. Idempotent: skip if any prior comment on this card
    // starts with REMINDER_PREFIX (we left the marker the last time we fired).
    const existing = await db
      .select({ id: kanbanCardComments.id })
      .from(kanbanCardComments)
      .where(and(eq(kanbanCardComments.cardId, CARD_ID), like(kanbanCardComments.body, `${REMINDER_PREFIX}%`)))
      .limit(1);

    if (existing.length > 0) {
      result.action = 'reminder_skipped_already_fired';
    } else {
      const pendingCount = await db
        .select({ count: drizzleSql<number>`count(*)::int` })
        .from(brainNotes)
        .where(and(
          eq(brainNotes.clientId, CLIENT_ID),
          isNull(brainNotes.deletedAt),
          drizzleSql`${brainNotes.tags}::jsonb @> '["pending_deletion"]'::jsonb`,
        ));
      const n = pendingCount[0]?.count ?? 0;

      const body = `${REMINDER_PREFIX} 14 days in (today is ${day}). **${n} notes** are still tagged \`pending_deletion\` on the Post Captain brain and will be soft-deleted on ${EXECUTION_DATE} unless you remove the tag.\n\nReview the set: /portal/brain/notes?tag=pending_deletion`;

      await db.insert(kanbanCardComments).values({
        cardId: CARD_ID,
        userId: null,
        body,
      });

      result.action = 'reminder_posted';
      result.pendingCount = n;
    }
  } else if (day === EXECUTION_DATE) {
    // Bulk soft-delete. WHERE excludes already-deleted rows, so re-runs after
    // the first execution are no-ops.
    const before = await db
      .select({ count: drizzleSql<number>`count(*)::int` })
      .from(brainNotes)
      .where(and(
        eq(brainNotes.clientId, CLIENT_ID),
        isNull(brainNotes.deletedAt),
        drizzleSql`${brainNotes.tags}::jsonb @> '["pending_deletion"]'::jsonb`,
      ));
    const toDelete = before[0]?.count ?? 0;

    await db
      .update(brainNotes)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(brainNotes.clientId, CLIENT_ID),
        isNull(brainNotes.deletedAt),
        drizzleSql`${brainNotes.tags}::jsonb @> '["pending_deletion"]'::jsonb`,
      ));

    // Receipt comment so PC sees the outcome in the card timeline.
    if (toDelete > 0) {
      const body = `${REMINDER_PREFIX.replace('reminder', 'executed')} Soft-deleted **${toDelete} notes** tagged \`pending_deletion\` (today is ${day}). They live in trash for 90 days before brain-empty-old-trash purges them. Restore: \`UPDATE brain_notes SET deleted_at = NULL WHERE id = <id>\`.`;
      await db.insert(kanbanCardComments).values({ cardId: CARD_ID, userId: null, body });
    }

    result.action = 'executed';
    result.softDeleted = toDelete;
  }

  result.durationMs = Date.now() - t0;
  return NextResponse.json({ success: true, data: result });
}

export const GET = withCronHealth(
  { name: 'api-cron:brain-12', area: 'api-cron' },
  _GET,
);

// Accept POST for manual triggers (matches other brain crons).
export const POST = GET;
