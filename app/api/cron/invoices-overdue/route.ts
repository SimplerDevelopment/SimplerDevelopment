/**
 * Cron: mark sent invoices overdue.
 *
 * Finds invoices WHERE status = 'sent' AND due_date < NOW() and flips their
 * status to 'overdue' in a single UPDATE. The query is intentionally a bulk
 * SQL update rather than a row-by-row loop — invoice counts can be large and
 * individual round-trips would be slow and wasteful.
 *
 * Auth: Vercel cron header OR `Authorization: Bearer ${CRON_SECRET}`.
 * Schedule: every hour — granularity matches day-level due dates.
 */

import { NextResponse } from 'next/server';
import { withCronHealth } from '@/lib/cron-health';
import { and, eq, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoices } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function _GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  if (!isVercelCron && cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const t0 = Date.now();

  // Single bulk UPDATE — no row-by-row loop.
  // We use sql`NOW()` rather than new Date() so the comparison is evaluated
  // by Postgres at execution time and cannot drift from JS clock skew.
  const result = await db
    .update(invoices)
    .set({ status: 'overdue', updatedAt: new Date() })
    .where(
      and(
        eq(invoices.status, 'sent'),
        lt(invoices.dueDate, sql`NOW()`),
      ),
    )
    .returning({ id: invoices.id });

  return NextResponse.json({
    success: true,
    data: {
      marked: result.length,
      durationMs: Date.now() - t0,
    },
  });
}

export const GET = withCronHealth(
  { name: 'api-cron:invoices-overdue', area: 'api-cron' },
  _GET,
);
