import { NextResponse } from 'next/server';
import { withCronHealth } from '@/lib/cron-health';
import { db } from '@/lib/db';
import {
  workflows,
  workflowRuns,
  workflowRunSteps,
  workflowStepLogs,
} from '@/lib/db/schema';
import { and, asc, eq, inArray, isNull, lt, lte, or } from 'drizzle-orm';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { executeAction, nextNodes } from '@/lib/workflows/runtime';
import type { WorkflowAction, WorkflowGraph, WorkflowRunContext } from '@/lib/workflows/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Cron: drain the `workflow_run_steps` queue.  Runs every minute.
 *
 * Two passes per tick:
 *  1. STUCK-RUN RECOVERY — reset steps stuck in `running` > 10 min back to
 *     `pending`, consuming a retry attempt so orphaned runs still hit the
 *     dead-letter limit.
 *  2. MAIN CLAIM — CAS-claim up to 100 pending/due steps, execute each,
 *     on success enqueue downstream nodes; on failure apply exponential
 *     backoff (1 min / 5 min) and dead-letter after 3 total attempts.
 *
 * Backoff schedule (platform-wide, non-configurable in Phase 2):
 *   attempt 1 → status='failed', nextRetryAt = now + 1 min
 *   attempt 2 → status='failed', nextRetryAt = now + 5 min
 *   attempt 3 → status='dead_letter', parent run status='failed'
 *
 * Auth: Vercel cron header OR `Authorization: Bearer ${CRON_SECRET}`.
 */
async function _GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();

  // ── PASS 1: STUCK-RUN RECOVERY ────────────────────────────────────────────
  // Steps stuck in 'running' for > 10 minutes are orphaned (crashed worker or
  // Vercel timeout). Reset to 'pending' and count the cost against their retry
  // budget so they can't spin forever.
  const stuckCutoff = new Date(now.getTime() - 10 * 60 * 1000);

  const stuckSteps = await db
    .select({
      id: workflowRunSteps.id,
      runId: workflowRunSteps.runId,
      attemptCount: workflowRunSteps.attemptCount,
    })
    .from(workflowRunSteps)
    .where(
      and(
        eq(workflowRunSteps.status, 'running'),
        lt(workflowRunSteps.updatedAt, stuckCutoff),
      ),
    )
    .limit(50);

  let stuckReset = 0;
  for (const stuck of stuckSteps) {
    const newAttemptCount = stuck.attemptCount + 1;
    if (newAttemptCount >= MAX_ATTEMPTS) {
      await db
        .update(workflowRunSteps)
        .set({
          status: 'dead_letter',
          attemptCount: newAttemptCount,
          error: 'stuck: execution timed out after max retries',
          updatedAt: now,
        })
        .where(
          and(
            eq(workflowRunSteps.id, stuck.id),
            eq(workflowRunSteps.status, 'running'),
            lt(workflowRunSteps.updatedAt, stuckCutoff),
          ),
        );
      await db
        .update(workflowRuns)
        .set({ status: 'failed', completedAt: now, error: 'step timed out after max retries' })
        .where(eq(workflowRuns.id, stuck.runId));
    } else {
      await db
        .update(workflowRunSteps)
        .set({
          status: 'pending',
          attemptCount: newAttemptCount,
          nextRetryAt: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(workflowRunSteps.id, stuck.id),
            eq(workflowRunSteps.status, 'running'),
            lt(workflowRunSteps.updatedAt, stuckCutoff),
          ),
        );
    }
    stuckReset++;
  }

  // ── PASS 2: MAIN CLAIM ────────────────────────────────────────────────────
  // Select up to 100 steps that are pending and due (nextRetryAt is null or
  // in the past). Order nulls first so fresh steps are executed before delayed
  // retries.
  const due = await db
    .select()
    .from(workflowRunSteps)
    .where(
      and(
        eq(workflowRunSteps.status, 'pending'),
        or(isNull(workflowRunSteps.nextRetryAt), lte(workflowRunSteps.nextRetryAt, now)),
      ),
    )
    .orderBy(asc(workflowRunSteps.nextRetryAt))
    .limit(100);

  let processed = 0;
  let failed = 0;
  let deadLettered = 0;
  const errors: { stepId: number; message: string }[] = [];

  for (const step of due) {
    // CAS claim: atomically transition status pending → running.
    // Zero rows returned means another worker already claimed this step.
    const claimed = await db
      .update(workflowRunSteps)
      .set({ status: 'running', updatedAt: now })
      .where(
        and(
          eq(workflowRunSteps.id, step.id),
          eq(workflowRunSteps.status, 'pending'),
          or(isNull(workflowRunSteps.nextRetryAt), lte(workflowRunSteps.nextRetryAt, now)),
        ),
      )
      .returning({ id: workflowRunSteps.id });

    if (claimed.length === 0) continue;

    // Advance parent run from 'pending' to 'running' on first step claim.
    await db
      .update(workflowRuns)
      .set({ status: 'running' })
      .where(and(eq(workflowRuns.id, step.runId), eq(workflowRuns.status, 'pending')));

    try {
      await processStep(step, now);
      processed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ stepId: step.id, message });
      const willDeadLetter = step.attemptCount + 1 >= MAX_ATTEMPTS;
      await handleStepFailure(step, message, now);
      failed++;
      if (willDeadLetter) deadLettered++;
    }
  }

  return NextResponse.json({
    success: true,
    stuckReset,
    processed,
    failed,
    deadLettered,
    errors,
  });
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Total attempts before a step is dead-lettered (1 initial + 2 retries). */
const MAX_ATTEMPTS = 3;

/**
 * Retry delay per attempt number (1-indexed):
 *   attempt 1 failure → wait 1 min before retry
 *   attempt 2 failure → wait 5 min before retry
 *   attempt 3 failure → dead_letter (no further retry)
 */
const BACKOFF_MS: Record<number, number> = {
  1: 60_000,       // 1 minute
  2: 5 * 60_000,   // 5 minutes
};

// ── Step executor ────────────────────────────────────────────────────────────

async function processStep(
  step: typeof workflowRunSteps.$inferSelect,
  now: Date,
): Promise<void> {
  // Load run to get context and workflowId
  const [run] = await db
    .select()
    .from(workflowRuns)
    .where(eq(workflowRuns.id, step.runId))
    .limit(1);
  if (!run) throw new Error(`workflow_run ${step.runId} not found`);

  const context = run.context as WorkflowRunContext;
  const input = step.input;
  if (!input) throw new Error(`step ${step.id} has no input`);
  const action = input as unknown as WorkflowAction;

  // ── WAIT action: the nextRetryAt was set at insertion time (trigger.ts).
  // When the cron picks up a wait step it means the delay has already elapsed.
  // Mark it completed immediately and enqueue downstream.
  if (step.action === 'wait') {
    const ms = (action as { ms?: number }).ms ?? 0;
    await db
      .update(workflowRunSteps)
      .set({ status: 'completed', result: { waited: ms, requested: ms }, updatedAt: now })
      .where(eq(workflowRunSteps.id, step.id));
    await enqueueDownstreamSteps(step, run.workflowId, now, undefined);
    await checkAndCompleteRun(step.runId, now);
    return;
  }

  // ── All other action kinds: dispatch via shared runtime action executor ────
  const result = await executeAction(action, context, {}, run.id, step.nodeId);

  // Write append-only audit log (one entry per attempt)
  await db.insert(workflowStepLogs).values({
    runId: run.id,
    nodeId: step.nodeId,
    action: step.action,
    status: result.status,
    input: step.input,
    output: result.output,
    durationMs: result.durationMs,
    occurredAt: now,
  });

  if (result.status === 'failed') {
    // Propagate as an error so the catch block applies backoff/dead-letter.
    const errMsg =
      (result.output as { error?: string } | null)?.error ??
      (result.output as { reason?: string } | null)?.reason ??
      'step returned failed status';
    throw new Error(errMsg);
  }

  // Success or skipped — both are terminal non-error outcomes.
  await db
    .update(workflowRunSteps)
    .set({ status: 'completed', result: result.output, updatedAt: now })
    .where(eq(workflowRunSteps.id, step.id));

  // Enqueue downstream nodes (condition nodes filter by branch label).
  await enqueueDownstreamSteps(step, run.workflowId, now, result.branch);
  await checkAndCompleteRun(step.runId, now);
}

// ── Graph traversal helpers ──────────────────────────────────────────────────

async function enqueueDownstreamSteps(
  step: typeof workflowRunSteps.$inferSelect,
  workflowId: number,
  now: Date,
  branch: 'true' | 'false' | undefined,
): Promise<void> {
  const [wf] = await db
    .select()
    .from(workflows)
    .where(eq(workflows.id, workflowId))
    .limit(1);
  if (!wf) return;

  const graph = wf.graph as WorkflowGraph;
  let downstream = nextNodes(graph, step.nodeId);

  // For condition nodes, follow only the branch that matches the result.
  if (branch !== undefined) {
    downstream = downstream.filter((e) => !e.label || e.label === branch);
  }

  for (const { node } of downstream) {
    const nodeAction = node.data as WorkflowAction;

    // Pre-compute nextRetryAt for wait steps so the cron delays execution.
    const ms = nodeAction.kind === 'wait' ? (nodeAction as { ms?: number }).ms ?? 0 : 0;
    const nextRetryAt: Date | null = ms > 0 ? new Date(now.getTime() + ms) : null;

    await db.insert(workflowRunSteps).values({
      runId: step.runId,
      clientId: step.clientId,
      nodeId: node.id,
      action: nodeAction.kind,
      status: 'pending',
      attemptCount: 0,
      nextRetryAt,
      input: node.data as Record<string, unknown>,
      idempotencyKey: `wf:${step.runId}:${node.id}`,
    });
  }
}

async function checkAndCompleteRun(runId: number, now: Date): Promise<void> {
  // If no active steps remain, mark the run completed.
  // Dead-lettered steps already set run status='failed', so we only mark
  // 'completed' if the run is still 'running'.
  const remaining = await db
    .select({ id: workflowRunSteps.id })
    .from(workflowRunSteps)
    .where(
      and(
        eq(workflowRunSteps.runId, runId),
        inArray(workflowRunSteps.status, ['pending', 'running', 'failed']),
      ),
    )
    .limit(1);

  if (remaining.length === 0) {
    await db
      .update(workflowRuns)
      .set({ status: 'completed', completedAt: now })
      .where(and(eq(workflowRuns.id, runId), eq(workflowRuns.status, 'running')));
  }
}

// ── Failure / backoff / dead-letter ─────────────────────────────────────────

async function handleStepFailure(
  step: typeof workflowRunSteps.$inferSelect,
  error: string,
  now: Date,
): Promise<void> {
  const newAttemptCount = step.attemptCount + 1;

  if (newAttemptCount >= MAX_ATTEMPTS) {
    // Exhausted all attempts — dead-letter and fail the parent run.
    await db
      .update(workflowRunSteps)
      .set({
        status: 'dead_letter',
        attemptCount: newAttemptCount,
        error,
        updatedAt: now,
      })
      .where(eq(workflowRunSteps.id, step.id));

    await db
      .update(workflowRuns)
      .set({ status: 'failed', completedAt: now, error })
      .where(eq(workflowRuns.id, step.runId));
  } else {
    // Schedule a retry with exponential backoff.
    const backoffMs = BACKOFF_MS[newAttemptCount] ?? BACKOFF_MS[2];
    const nextRetryAt = new Date(now.getTime() + backoffMs);

    await db
      .update(workflowRunSteps)
      .set({
        status: 'failed',
        attemptCount: newAttemptCount,
        error,
        nextRetryAt,
        updatedAt: now,
      })
      .where(eq(workflowRunSteps.id, step.id));
  }
}

export const GET = withCronHealth(
  { name: 'api-cron:process-workflow-runs', area: 'api-cron' },
  _GET,
);
