import { NextResponse } from 'next/server';
import { withCronHealth } from '@/lib/cron-health';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { db } from '@/lib/db';
import { automationJobs } from '@/lib/db/schema';
import { and, asc, eq, isNull, lt, lte, or } from 'drizzle-orm';
import { runHandlers } from '@/lib/automation/event-bus';
// Side-effect import: registers the automation engine handlers in THIS process
// so the cron can re-run a dropped event through the same handler set.
import '@/lib/automation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Cron: retry automation events whose in-process dispatch was dropped.
 *
 * emitEvent() journals every event to automation_jobs (pending) and marks it
 * 'completed' once handlers finish in-process. If the process died first (e.g.
 * a serverless cold-start), the row stays 'pending'; this cron re-runs it,
 * giving at-least-once delivery + retries instead of the old fire-and-forget.
 *
 * Per tick:
 *  1. Reclaim leases — 'running' rows whose lease (nextRetryAt) expired = a
 *     worker crashed mid-run → back to 'pending'.
 *  2. Claim due 'pending' rows older than GRACE_MS (so we never race the
 *     in-process dispatch still handling a fresh event), CAS pending→running
 *     with a lease, re-run handlers, mark completed; on failure apply backoff
 *     (1m/5m) and dead-letter after 3 attempts.
 */
const MAX_ATTEMPTS = 3;
const BACKOFF_MS: Record<number, number> = { 1: 60_000, 2: 5 * 60_000 };
const GRACE_MS = 90_000;        // let in-process dispatch finish before retrying
const LEASE_MS = 10 * 60_000;   // a claimed job must complete within this or be reclaimed

async function _GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const now = new Date();

  // PASS 1: reclaim expired leases (a worker claimed then crashed).
  await db
    .update(automationJobs)
    .set({ status: 'pending', nextRetryAt: null })
    .where(and(eq(automationJobs.status, 'running'), lt(automationJobs.nextRetryAt, now)));

  // PASS 2: claim due pending jobs past the grace window.
  const graceCutoff = new Date(now.getTime() - GRACE_MS);
  const due = await db
    .select()
    .from(automationJobs)
    .where(
      and(
        eq(automationJobs.status, 'pending'),
        lt(automationJobs.createdAt, graceCutoff),
        or(isNull(automationJobs.nextRetryAt), lte(automationJobs.nextRetryAt, now)),
      ),
    )
    .orderBy(asc(automationJobs.createdAt))
    .limit(100);

  let processed = 0;
  let failed = 0;
  let deadLettered = 0;

  for (const job of due) {
    // CAS claim → running with a lease.
    const claimed = await db
      .update(automationJobs)
      .set({ status: 'running', nextRetryAt: new Date(now.getTime() + LEASE_MS) })
      .where(and(eq(automationJobs.id, job.id), eq(automationJobs.status, 'pending')))
      .returning({ id: automationJobs.id });
    if (claimed.length === 0) continue; // another worker took it

    try {
      await runHandlers({
        event: job.event,
        clientId: job.clientId,
        userId: job.userId,
        payload: (job.payload ?? {}) as Record<string, unknown>,
        timestamp: job.createdAt,
      });
      await db
        .update(automationJobs)
        .set({ status: 'completed', processedAt: new Date(), nextRetryAt: null })
        .where(eq(automationJobs.id, job.id));
      processed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const attempts = job.attemptCount + 1;
      if (attempts >= MAX_ATTEMPTS) {
        await db
          .update(automationJobs)
          .set({ status: 'dead_letter', attemptCount: attempts, error: message, nextRetryAt: null })
          .where(eq(automationJobs.id, job.id));
        deadLettered++;
      } else {
        await db
          .update(automationJobs)
          .set({
            status: 'pending',
            attemptCount: attempts,
            error: message,
            nextRetryAt: new Date(now.getTime() + (BACKOFF_MS[attempts] ?? BACKOFF_MS[2])),
          })
          .where(eq(automationJobs.id, job.id));
        failed++;
      }
    }
  }

  return NextResponse.json({ success: true, processed, failed, deadLettered });
}

export const GET = withCronHealth(
  { name: 'api-cron:process-automation-jobs', area: 'api-cron' },
  _GET,
);
