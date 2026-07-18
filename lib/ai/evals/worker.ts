/**
 * Eval-run queue worker (Phase 2b).
 *
 * Drains queued `eval_runs`: atomically claims the next one (so two workers
 * never grab the same row), executes it via `runEvalJob`, and reaps runs stuck
 * in 'running' after a crash. Drive it from a cron route or a long-lived
 * process; `drainQueue` does one pass (reap + up to `max` runs).
 *
 * Normal app runtime — `new Date()` / `Date.now()` are fine here.
 */
import { db } from '@/lib/db';
import { evalRuns } from '@/lib/db/schema';
import { and, eq, lt, sql } from 'drizzle-orm';
import { runEvalJob } from './job';

const DEFAULT_STALE_MS = 30 * 60 * 1000; // 30 min
const DEFAULT_MAX_PER_PASS = 10;

function rowsOf(result: unknown): Array<{ id: number }> {
  if (Array.isArray(result)) return result as Array<{ id: number }>;
  const r = (result as { rows?: unknown }).rows;
  return Array.isArray(r) ? (r as Array<{ id: number }>) : [];
}

/**
 * Atomically claim the oldest queued run: a single UPDATE guarded by
 * `FOR UPDATE SKIP LOCKED` so concurrent workers each get a distinct row (or
 * none). Returns the claimed run id, or null if the queue is empty.
 */
export async function claimNextQueuedRun(): Promise<number | null> {
  const result = await db.execute(sql`
    UPDATE eval_runs SET status = 'running', started_at = now()
    WHERE id = (
      SELECT id FROM eval_runs
      WHERE status = 'queued'
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `);
  return rowsOf(result)[0]?.id ?? null;
}

/**
 * Mark runs stuck in 'running' past the timeout as failed (a worker crashed
 * mid-run). Returns how many were reaped.
 */
export async function reapStaleRuns(timeoutMs: number = DEFAULT_STALE_MS): Promise<number> {
  const cutoff = new Date(Date.now() - timeoutMs);
  const reaped = await db
    .update(evalRuns)
    .set({ status: 'failed', error: 'worker timeout (stale running run reaped)', finishedAt: new Date() })
    .where(and(eq(evalRuns.status, 'running'), lt(evalRuns.startedAt, cutoff)))
    .returning({ id: evalRuns.id });
  return reaped.length;
}

/**
 * One drain pass: reap stale runs, then claim + execute up to `max` queued runs.
 * `mock` scores against case mockOutputs (no model calls); otherwise pass an
 * `anthropicApiKey` for live runs.
 */
export async function drainQueue(
  opts: { max?: number; reapTimeoutMs?: number; mock?: boolean; anthropicApiKey?: string; judgeModel?: string } = {},
): Promise<{ reaped: number; ran: number[] }> {
  const reaped = await reapStaleRuns(opts.reapTimeoutMs);
  const ran: number[] = [];
  const max = opts.max ?? DEFAULT_MAX_PER_PASS;
  for (let i = 0; i < max; i++) {
    const runId = await claimNextQueuedRun();
    if (runId == null) break;
    await runEvalJob(runId, { mock: opts.mock, anthropicApiKey: opts.anthropicApiKey, judgeModel: opts.judgeModel });
    ran.push(runId);
  }
  return { reaped, ran };
}
