// Bridge between live application events and the visual workflow runtime.
//
// Phase 2: Instead of fire-and-forget in-process execution, each trigger now
// inserts a `workflow_runs` row (status='pending') and one
// `workflow_run_steps` row per node immediately downstream of the trigger.
// The `process-workflow-runs` cron drainer picks those rows up within the
// next tick and executes them with CAS-claim + exponential-backoff retry.

import { db } from '@/lib/db';
import { workflows, workflowRuns, workflowRunSteps } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import type {
  WorkflowAction,
  WorkflowEdge,
  WorkflowGraph,
  WorkflowNode,
  WorkflowRunContext,
  WorkflowTriggerConfig,
} from './types';

interface EnqueueOptions {
  triggeredBy?: string;
}

export async function enqueueWorkflowRunsForTrigger(
  clientId: number,
  trigger: WorkflowTriggerConfig,
  context: WorkflowRunContext,
  opts: EnqueueOptions = {},
): Promise<{ matchedWorkflowIds: number[] }> {
  // TODO(workflows): wire this into the live CRM event stream — call sites
  // for `contact.created`, `deal.stage_changed`, `form.submitted`, plus a
  // cron worker for `schedule` triggers. Today only the test-run endpoint
  // calls this directly with a synthetic context.

  const active = await db
    .select()
    .from(workflows)
    .where(and(eq(workflows.clientId, clientId), eq(workflows.status, 'active')));

  const matched = active.filter((w) =>
    triggerMatches(w.trigger as WorkflowTriggerConfig, trigger),
  );

  const enriched: WorkflowRunContext = { ...context, clientId };

  for (const wf of matched) {
    // 1. Open a run row with status='pending'. The cron drainer executes it.
    const [run] = await db
      .insert(workflowRuns)
      .values({
        workflowId: wf.id,
        clientId: wf.clientId,
        triggeredBy: opts.triggeredBy ?? 'event',
        status: 'pending',
        context: enriched,
        startedAt: new Date(),
      })
      .returning();

    // 2. Find the trigger node and enqueue its immediate downstream nodes.
    const graph = wf.graph as WorkflowGraph;
    const triggerNode = graph.nodes.find((n: WorkflowNode) => n.type === 'trigger');
    if (!triggerNode) continue;

    const nodeById = new Map(graph.nodes.map((n: WorkflowNode) => [n.id, n] as const));
    const downstreamEdges = (graph.edges as WorkflowEdge[]).filter(
      (e: WorkflowEdge) => e.source === triggerNode.id,
    );

    for (const edge of downstreamEdges) {
      const targetNode = nodeById.get(edge.target);
      if (!targetNode) continue;

      const action = targetNode.data as WorkflowAction;

      // For wait steps, pre-compute the due time so the cron knows when
      // to wake them up (avoids an extra tick for long delays).
      const nextRetryAt: Date | null =
        action.kind === 'wait' && action.ms > 0
          ? new Date(Date.now() + action.ms)
          : null;

      await db.insert(workflowRunSteps).values({
        runId: run.id,
        clientId: wf.clientId,
        nodeId: targetNode.id,
        action: action.kind,
        status: 'pending',
        attemptCount: 0,
        nextRetryAt,
        input: targetNode.data as Record<string, unknown>,
        idempotencyKey: `wf:${run.id}:${targetNode.id}`,
      });
    }
  }

  return { matchedWorkflowIds: matched.map((w) => w.id) };
}

// Keep the matcher loose for the MVP — exact `kind` match is enough for the
// demo. We intentionally don't compare optional fields like `stageId` so
// templates that omit narrowing still fire on the broad event.
function triggerMatches(
  stored: WorkflowTriggerConfig,
  incoming: WorkflowTriggerConfig,
): boolean {
  if (stored.kind !== incoming.kind) return false;

  if (stored.kind === 'deal.stage_changed' && incoming.kind === 'deal.stage_changed') {
    if (stored.stageId !== undefined && stored.stageId !== incoming.stageId) return false;
  }
  if (stored.kind === 'form.submitted' && incoming.kind === 'form.submitted') {
    if (stored.formId !== undefined && stored.formId !== incoming.formId) return false;
  }

  return true;
}
