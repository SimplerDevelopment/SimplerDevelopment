// Pure helper used by the plugin-jobs-tick cron. Walks the
// registered_app_jobs table for enabled rows whose nextRunAt is now or past;
// for each, CAS-claims the row by stamping a fresh nextRunAt and lastRunAt
// (the CAS predicate is `WHERE nextRunAt = <observed value>` — if another
// worker beat us to it, the UPDATE returns no row and we skip).
//
// On successful claim, calls enqueueRun() to drop a queued execution into
// registered_app_runs. The drain cron picks it up on the next minute.
//
// Pure (no Request, no env reads beyond db); the route file passes through
// fireDueJobs() so we can unit-test it without a Vercel runtime.

import { db } from '@/lib/db';
import { registeredAppJobs, registeredApps } from '@/lib/db/schema';
import { and, eq, inArray, lte } from 'drizzle-orm';
import { computeNextRun } from './schedule';
import { enqueueRun, type RunKind } from './runner';

export interface FireDueJobsResult {
  jobId: number;
  runId: number;
}

const FIRE_LIMIT = 50; // safety cap — postcaptain v1 should never exceed this

/**
 * Scans for due weekly jobs and enqueues a run per claimed row. Returns one
 * { jobId, runId } per successful enqueue.
 *
 * Concurrent-tick safe: claim uses CAS on nextRunAt — two ticks observing
 * the same row will fight, and exactly one wins.
 */
export async function fireDueJobs(now: Date = new Date()): Promise<FireDueJobsResult[]> {
  const due = await db.select()
    .from(registeredAppJobs)
    .where(and(
      eq(registeredAppJobs.enabled, true),
      lte(registeredAppJobs.nextRunAt, now),
    ))
    .orderBy(registeredAppJobs.nextRunAt)
    .limit(FIRE_LIMIT);

  if (due.length === 0) return [];

  // Cache app rows by id so we don't hit the DB once per job. enqueueRun's
  // EnqueueRunOpts wants the full RegisteredApp — only `app.id` ends up
  // persisted, but we keep the contract tight.
  const appIds = Array.from(new Set(due.map(j => j.appId)));
  const appRows = await db.select()
    .from(registeredApps)
    .where(inArray(registeredApps.id, appIds));
  const appById = new Map(appRows.map(a => [a.id, a]));

  const results: FireDueJobsResult[] = [];

  for (const job of due) {
    const app = appById.get(job.appId);
    if (!app) continue; // app was deleted out from under us; skip

    const currentNextRunAt = job.nextRunAt;
    const newNextRunAt = computeNextRun(
      {
        dayOfWeek: job.dayOfWeek,
        timeUtc: job.timeUtc,
        cronExpr: job.cronExpr,
      },
      now,
    );

    // CAS-claim. Two ticks racing on the same row → only one wins because
    // the predicate uses the observed nextRunAt; whoever updates first
    // moves it forward, and the loser's update matches zero rows.
    const claimed = await db.update(registeredAppJobs)
      .set({
        lastRunAt: now,
        nextRunAt: newNextRunAt,
        updatedAt: now,
      })
      .where(and(
        eq(registeredAppJobs.id, job.id),
        eq(registeredAppJobs.nextRunAt, currentNextRunAt),
      ))
      .returning({ id: registeredAppJobs.id });

    if (claimed.length === 0) continue;

    try {
      const { runId } = await enqueueRun({
        app,
        client: { id: job.clientId },
        kind: job.kind as RunKind,
        args: job.args ?? {},
        jobId: job.id,
      });
      results.push({ jobId: job.id, runId });
    } catch {
      // Enqueue failed AFTER we already moved nextRunAt forward. We
      // deliberately do NOT roll back — better to skip a scheduled run
      // than to risk a tight retry loop. Operators can spot this via the
      // gap in registered_app_runs vs lastRunAt.
      continue;
    }
  }

  return results;
}
