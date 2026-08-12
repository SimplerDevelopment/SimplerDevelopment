// Internal background-work queue: enqueue, handlers, drain.
//
// Why this exists: work that MUST happen after a request returns, where losing
// it costs money. The motivating case is POD fulfillment — the Stripe webhook
// used to do `submitPODOrder(orderId).catch(console.error)` fire-and-forget, so
// a Printful outage (or the lambda freezing once the webhook responded) meant a
// paid order never reached the printer and the only trace was a log line.
//
// The state machine is lifted from process-automation-jobs, which has been
// proven in prod: lease reclaim → CAS claim → run → completed, or backoff and
// eventually dead_letter. One difference: automation_jobs needs a grace window
// because emitEvent ALSO dispatches in-process and the cron must not race it.
// Here the queue is the only dispatch path, so a job is claimable immediately.

import { and, asc, eq, isNull, lt, lte, or } from 'drizzle-orm';
import { db as defaultDb } from '@/lib/db';
import { internalJobs, type InternalJobType } from '@/lib/db/schema';

type Db = typeof defaultDb;

export const MAX_ATTEMPTS = 3;
/** Attempt n → wait before attempt n+1. Beyond the table, hold at the last value. */
export const BACKOFF_MS: Record<number, number> = { 1: 60_000, 2: 5 * 60_000 };
/** A claimed job must finish within this or a later tick reclaims it. */
export const LEASE_MS = 10 * 60_000;
/** Cap per tick so one backlog can't run the function past its time limit. */
export const DRAIN_BATCH = 50;

// ─── handlers ────────────────────────────────────────────────────────────────

/**
 * One entry per InternalJobType. A throw here is the retry signal — the drain
 * applies backoff and dead-letters after MAX_ATTEMPTS, so a handler should
 * throw on "try again later" AND on "this can never work" alike. Distinguishing
 * the two is not worth a taxonomy: three attempts then a dead_letter row an
 * operator can see is the same outcome, reached slightly later.
 *
 * Handlers `await import(...)` their implementation rather than importing it at
 * module scope. Producers import this module only to call enqueueJob, and a
 * static import would pull every handler's dependency graph into every route
 * that queues work — the Stripe webhook would carry the Printful client (and,
 * once more job types land, the email and AI stacks) just to run one INSERT.
 * The original fire-and-forget code used a dynamic import for the same reason.
 * Inside the drain the extra module resolution costs nothing.
 */
export const JOB_HANDLERS: Record<
  InternalJobType,
  (payload: Record<string, unknown>, db: Db) => Promise<void>
> = {
  'pod.submit': async (payload, db) => {
    const orderId = payload.orderId;
    if (typeof orderId !== 'number') {
      throw new Error(`pod.submit: payload.orderId must be a number, got ${typeof orderId}`);
    }
    const { submitPODOrder } = await import('@/lib/fulfillment/pod');
    // Idempotent on its own (returns early once printfulOrderId is set), so a
    // duplicate delivery is a no-op rather than a second printed garment.
    await submitPODOrder(orderId, db);
  },
};

// ─── enqueue ─────────────────────────────────────────────────────────────────

export interface EnqueueJobParams {
  /** Tenant that owns the work. Cascade-deletes with the client. */
  clientId: number;
  type: InternalJobType;
  payload: Record<string, unknown>;
  /**
   * Idempotency key, unique table-wide. Omit only when duplicate work is
   * genuinely harmless. Convention: `<type>:<entity id>`.
   */
  dedupeKey?: string;
}

/**
 * Enqueue a job. Safe to call twice with the same dedupeKey — the second is
 * dropped by the unique index, not by a read-then-write race.
 *
 * Callers should AWAIT this. It is one INSERT; making it fire-and-forget would
 * reintroduce exactly the durability hole the queue exists to close.
 */
export async function enqueueJob(
  params: EnqueueJobParams,
  db: Db = defaultDb,
): Promise<void> {
  await db
    .insert(internalJobs)
    .values({
      clientId: params.clientId,
      type: params.type,
      payload: params.payload,
      dedupeKey: params.dedupeKey ?? null,
    })
    .onConflictDoNothing({ target: internalJobs.dedupeKey });
}

// ─── drain ───────────────────────────────────────────────────────────────────

export interface DrainResult {
  processed: number;
  failed: number;
  deadLettered: number;
}

/**
 * Process one batch of due jobs. Called by the process-internal-jobs cron;
 * exported so the state machine can be tested without standing up a request.
 *
 * Concurrent ticks are safe: every job is taken with a CAS update that only
 * succeeds from 'pending', so a row claimed by another worker is skipped.
 */
export async function drainInternalJobs(db: Db = defaultDb): Promise<DrainResult> {
  const now = new Date();

  // PASS 1: reclaim expired leases — a worker claimed the row then died.
  //
  // ponytail: a reclaim does NOT count as an attempt, matching automation_jobs.
  // Ceiling: a job that kills its worker every time (OOM, infinite loop) never
  // reaches MAX_ATTEMPTS and retries forever at one per lease. Acceptable while
  // handlers are single outbound HTTP calls. If a heavier handler lands here,
  // bump attempt_count on reclaim too — the reason it isn't done now is that it
  // would also penalise a legitimately slow job that outran its lease.
  await db
    .update(internalJobs)
    .set({ status: 'pending', nextRetryAt: null })
    .where(and(eq(internalJobs.status, 'running'), lt(internalJobs.nextRetryAt, now)));

  // PASS 2: claim jobs that are pending and due.
  const due = await db
    .select()
    .from(internalJobs)
    .where(
      and(
        eq(internalJobs.status, 'pending'),
        or(isNull(internalJobs.nextRetryAt), lte(internalJobs.nextRetryAt, now)),
      ),
    )
    .orderBy(asc(internalJobs.createdAt))
    .limit(DRAIN_BATCH);

  const result: DrainResult = { processed: 0, failed: 0, deadLettered: 0 };

  for (const job of due) {
    const claimed = await db
      .update(internalJobs)
      .set({ status: 'running', nextRetryAt: new Date(Date.now() + LEASE_MS) })
      .where(and(eq(internalJobs.id, job.id), eq(internalJobs.status, 'pending')))
      .returning({ id: internalJobs.id });
    if (claimed.length === 0) continue; // another worker took it

    try {
      const handler = JOB_HANDLERS[job.type];
      if (!handler) throw new Error(`No handler registered for job type '${job.type}'`);
      await handler((job.payload ?? {}) as Record<string, unknown>, db);

      await db
        .update(internalJobs)
        .set({ status: 'completed', processedAt: new Date(), nextRetryAt: null, error: null })
        .where(eq(internalJobs.id, job.id));
      result.processed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const attempts = job.attemptCount + 1;

      if (attempts >= MAX_ATTEMPTS) {
        await db
          .update(internalJobs)
          .set({ status: 'dead_letter', attemptCount: attempts, error: message, nextRetryAt: null })
          .where(eq(internalJobs.id, job.id));
        result.deadLettered++;
      } else {
        await db
          .update(internalJobs)
          .set({
            status: 'pending',
            attemptCount: attempts,
            error: message,
            nextRetryAt: new Date(Date.now() + (BACKOFF_MS[attempts] ?? BACKOFF_MS[2])),
          })
          .where(eq(internalJobs.id, job.id));
        result.failed++;
      }
    }
  }

  return result;
}
