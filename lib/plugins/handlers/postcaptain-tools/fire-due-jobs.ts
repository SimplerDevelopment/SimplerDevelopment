// Pure helper used by the plugin-jobs-tick cron. Walks the
// registered_app_jobs table for enabled rows whose nextRunAt is now or past;
// for each, CAS-claims the row by stamping a fresh nextRunAt and lastRunAt
// (the CAS predicate is `WHERE id = <observed id> AND nextRunAt <= <cutoff>` —
// if another worker beat us to it, nextRunAt is already in the future so the
// UPDATE returns no row and we skip).
//
// On successful claim, calls enqueueRun() to drop a queued execution into
// registered_app_runs. The drain cron picks it up on the next minute.
//
// Pure (no Request, no env reads beyond db); the route file passes through
// fireDueJobs() so we can unit-test it without a Vercel runtime.

import { db } from '@/lib/db';
import { registeredAppJobs, registeredApps } from '@/lib/db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
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
  // Use an explicit UTC-anchored cutoff for all timestamp comparisons.
  //
  // The `next_run_at` column is `timestamp without time zone` and always holds
  // UTC values (Node always passes Date.toISOString(), which postgres-js
  // serialises as e.g. "2026-06-20T23:55:00.000Z"; Postgres strips the "Z"
  // and stores the literal UTC digits). However, when postgres-js reads the
  // value BACK it calls `new Date(raw)` on the bare string (no "Z"), which
  // V8/JSC interpret as LOCAL time — so on a machine/session where the OS
  // timezone is not UTC (e.g. America/New_York) the round-tripped Date is
  // shifted by the UTC offset.  When that shifted Date is then re-serialised
  // into the CAS UPDATE predicate the UTC digits no longer match the stored
  // row → 0 rows claimed, fired list always empty.
  //
  // Fix: never let a read-back Date re-enter a comparison.  Use a single
  // `nowIso` string derived from `now` (UTC, by definition) and inject it
  // via a typed SQL fragment so Postgres always interprets it as a UTC-epoch
  // instant (via ::timestamptz) then strips TZ for the column comparison.
  // Both the SELECT and CAS UPDATE use the identical literal, so they are
  // guaranteed to agree on which rows are due.
  const nowIso = now.toISOString(); // e.g. "2026-06-20T23:55:00.000Z"
  // Evaluates to a `timestamp without time zone` expressed in UTC, matching
  // how the column was originally written.
  const nowUtc = sql`${nowIso}::timestamptz at time zone 'UTC'`;

  const due = await db.select()
    .from(registeredAppJobs)
    .where(and(
      eq(registeredAppJobs.enabled, true),
      sql`${registeredAppJobs.nextRunAt} <= ${nowUtc}`,
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

    const newNextRunAt = computeNextRun(
      {
        dayOfWeek: job.dayOfWeek,
        timeUtc: job.timeUtc,
        cronExpr: job.cronExpr,
      },
      now,
    );

    // CAS-claim. Two ticks racing on the same row → only one wins.
    //
    // We use `nextRunAt <= nowUtc` (same predicate as the SELECT) rather than
    // exact `nextRunAt = <observed-value>` equality, because the equality form
    // requires round-tripping the read-back timestamp through a JS Date object,
    // which introduces a TZ shift on systems where the OS timezone ≠ UTC (see
    // comment at function top).  The `<= nowUtc` form is equally safe:
    //
    //   • Concurrent-tick scenario: two ticks both SELECT the same due row.
    //     Tick A updates first, bumping nextRunAt to a future value.
    //     Tick B then runs its UPDATE; nextRunAt is now in the future so
    //     `nextRunAt <= nowUtc` is FALSE → 0 rows → B skips. ✓
    //
    //   • `id` equality is still present, so the predicate is per-row.
    const claimed = await db.update(registeredAppJobs)
      .set({
        lastRunAt: now,
        nextRunAt: newNextRunAt,
        updatedAt: now,
      })
      .where(and(
        eq(registeredAppJobs.id, job.id),
        sql`${registeredAppJobs.nextRunAt} <= ${nowUtc}`,
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
