// Execution backbone for postcaptain-tools plugin runs.
//
// Wave 1 ran Anthropic + web_search inline on SD's compute. Wave 2 moved
// that to the postcaptain-tools deploy: SD now claims a queued run, posts
// a dispatch payload to the worker, and waits for an asynchronous
// completion callback (see `./complete.ts`). This file only owns the
// queue / claim / dispatch lifecycle on the SD side.
//
//   1. enqueueRun()       — inserts a registered_app_runs row with
//                           status='queued'. Used by the callback handler
//                           ('/scripts/run') and by the jobs-tick cron.
//   2. executeRun()       — CAS-claims a queued run (status='queued' →
//                           'running'), looks up the app, then calls
//                           dispatchRun(). On dispatch success the run
//                           STAYS in 'running' until the worker posts back
//                           via '/scripts/runs/:id/complete'. On dispatch
//                           failure we either revert to 'queued' (transient)
//                           or transition to 'failed' (permanent).
//   3. drainQueuedRuns()  — picks up to N queued runs and calls executeRun
//                           for each in parallel. Dispatch is fast (10s
//                           timeout); the heavy work happens on the worker
//                           and finalizes via callback.
//
// `redactLog` and `capLogTail` live in `./runner-redact.ts` so they can be
// shared with `./complete.ts`. They are re-exported here for back-compat
// with `tests/unit/plugins-runner.test.ts` which imports them from this
// module.

import { db } from '@/lib/db';
import {
  registeredAppRuns,
  registeredApps,
  type RegisteredApp,
} from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { dispatchRun } from './dispatch';
import { redactLog, capLogTail } from './runner-redact';

// Re-exported so existing callers / tests don't have to change their imports.
export { redactLog, capLogTail };

// ─── Constants ──────────────────────────────────────────────────────────────

const DRAIN_PARALLELISM = 4; // dispatch is fast (~1s), so we can fan wider than Wave 1
const ERROR_SUMMARY_MAX = 1_000;

export type RunKind = 'research-brief' | 'draft-blog-post' | 'competitor-research';

// ─── enqueueRun ─────────────────────────────────────────────────────────────

export interface EnqueueRunOpts {
  app: RegisteredApp;
  client: { id: number };
  kind: RunKind;
  args: Record<string, unknown>;
  jobId?: number | null;
}

/**
 * Inserts a queued run row. Returns the new run id. Never blocks on the
 * worker — that handshake happens on the next drain tick.
 */
export async function enqueueRun(opts: EnqueueRunOpts): Promise<{ runId: number }> {
  const [row] = await db.insert(registeredAppRuns).values({
    appId: opts.app.id,
    clientId: opts.client.id,
    jobId: opts.jobId ?? null,
    kind: opts.kind,
    args: opts.args,
    status: 'queued',
  }).returning({ id: registeredAppRuns.id });
  if (!row) throw new Error('enqueueRun: insert returned no row');
  return { runId: row.id };
}

// ─── executeRun ─────────────────────────────────────────────────────────────

export type ExecuteRunResult =
  // dispatched: claim succeeded and the worker accepted the POST; the run
  //   stays in 'running' until the worker calls back into /complete.
  | { status: 'dispatched'; reason?: string }
  // failed: permanent failure (e.g. 4xx from worker, unknown app); the run
  //   has been moved to terminal 'failed'.
  | { status: 'failed'; reason?: string }
  // requeued: transient failure (5xx, network); the run has been put back
  //   to 'queued' so the next drain tick retries.
  | { status: 'requeued'; reason?: string }
  // skipped: the CAS claim missed — another tick already grabbed it, or the
  //   row isn't in 'queued' at call time.
  | { status: 'skipped'; reason?: string };

/**
 * CAS-claims a queued run, looks up its app, and dispatches it to the
 * postcaptain-tools worker. Idempotent: a non-queued row returns 'skipped'.
 *
 * On dispatch failure we explicitly classify retriable vs not:
 *   - retriable (5xx / network) → run reverts to 'queued' for next tick
 *   - non-retriable (4xx)       → run transitions to 'failed' immediately
 *
 * This function never calls Anthropic and never persists results — both of
 * those moved to the worker + the /complete callback handler.
 */
export async function executeRun(runId: number): Promise<ExecuteRunResult> {
  // CAS-claim. RETURNING * surfaces the kind/args/appId without a second
  // round-trip.
  const claimed = await db
    .update(registeredAppRuns)
    .set({
      status: 'running',
      startedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(
      eq(registeredAppRuns.id, runId),
      eq(registeredAppRuns.status, 'queued'),
    ))
    .returning();

  if (claimed.length === 0) {
    return { status: 'skipped', reason: 'already-claimed' };
  }
  const run = claimed[0];

  // Look up the app row for hostUrl + slug. Cached at most a few hits per
  // drain tick — we don't bother memoizing here since drainQueuedRuns
  // typically processes a single app.
  const [app] = await db.select()
    .from(registeredApps)
    .where(eq(registeredApps.id, run.appId))
    .limit(1);
  if (!app) {
    // App was deleted between enqueue and drain. Surface as a permanent
    // failure so we don't keep retrying.
    await markRunFailed(runId, `unknown app id=${run.appId}`);
    return { status: 'failed', reason: 'unknown-app' };
  }

  const result = await dispatchRun(
    { id: app.id, slug: app.slug, hostUrl: app.hostUrl },
    {
      runId: run.id,
      kind: run.kind,
      args: (run.args ?? {}) as Record<string, unknown>,
      clientId: run.clientId,
    },
  );

  if (result.ok) {
    return { status: 'dispatched' };
  }

  if (result.retriable) {
    // Revert to queued so the next minute's tick tries again. We don't
    // increment any retry counter today — out of scope for Wave 2; a stuck-
    // run reaper will eventually shoot a row that's been bouncing for too
    // long once we add it.
    await db.update(registeredAppRuns).set({
      status: 'queued',
      startedAt: null,
      updatedAt: new Date(),
    }).where(eq(registeredAppRuns.id, runId));
    return { status: 'requeued', reason: result.reason };
  }

  await markRunFailed(runId, result.reason);
  return { status: 'failed', reason: result.reason };
}

async function markRunFailed(runId: number, reason: string): Promise<void> {
  await db.update(registeredAppRuns).set({
    status: 'failed',
    finishedAt: new Date(),
    updatedAt: new Date(),
    exitCode: 1,
    errorSummary: redactLog(reason).slice(0, ERROR_SUMMARY_MAX),
  }).where(eq(registeredAppRuns.id, runId));
}

// ─── drainQueuedRuns ────────────────────────────────────────────────────────

/**
 * Drains up to `max` queued runs. Each one is CAS-claimed and dispatched
 * to the worker. Dispatch itself is fast (~1s round-trip to 202); the
 * actual heavy work happens on the worker, with results posted back later
 * via the /complete callback. Concurrent ticks are safe: claim is a CAS
 * update so a race only lets one win.
 */
export async function drainQueuedRuns(max: number): Promise<{
  attempted: number;
  dispatched: number;
  failed: number;
  requeued: number;
  skipped: number;
}> {
  if (max <= 0) {
    return { attempted: 0, dispatched: 0, failed: 0, requeued: 0, skipped: 0 };
  }

  const candidates = await db.select({ id: registeredAppRuns.id })
    .from(registeredAppRuns)
    .where(eq(registeredAppRuns.status, 'queued'))
    .orderBy(registeredAppRuns.id)
    .limit(max);

  let attempted = 0;
  let dispatched = 0;
  let failed = 0;
  let requeued = 0;
  let skipped = 0;

  for (let i = 0; i < candidates.length; i += DRAIN_PARALLELISM) {
    const batch = candidates.slice(i, i + DRAIN_PARALLELISM);
    const results = await Promise.all(batch.map((c) => executeRun(c.id)));
    for (const r of results) {
      attempted += 1;
      if (r.status === 'dispatched') dispatched += 1;
      else if (r.status === 'failed') failed += 1;
      else if (r.status === 'requeued') requeued += 1;
      else if (r.status === 'skipped') skipped += 1;
    }
  }

  return { attempted, dispatched, failed, requeued, skipped };
}
