// Bridge between live application events and the visual workflow runtime.
//
// MVP: this finds active workflows whose trigger config matches the incoming
// event and fires `runWorkflow` for each. It is NOT yet wired into the live
// CRM event stream — the only live caller today is the
// `/api/portal/workflows/[id]/test-run` endpoint. When we wire up real
// triggers (contact creation, deal stage moves, scheduled cron) those call
// sites should call `enqueueWorkflowRunsForTrigger` and let it dispatch.

import { db } from '@/lib/db';
import { workflows } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { runWorkflow } from './runtime';
import type { WorkflowRunContext, WorkflowTriggerConfig } from './types';

interface EnqueueOptions {
  triggeredBy?: string;
  // Tests / synthetic call sites can disable async fire-and-forget so they
  // can await the run completion. Default: false (fires async).
  awaitRuns?: boolean;
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
    .select({ id: workflows.id, trigger: workflows.trigger })
    .from(workflows)
    .where(and(eq(workflows.clientId, clientId), eq(workflows.status, 'active')));

  const matched = active.filter((w) => triggerMatches(w.trigger, trigger));

  const enriched: WorkflowRunContext = { ...context, clientId };

  if (opts.awaitRuns) {
    for (const wf of matched) {
      await runWorkflow(wf.id, enriched, { triggeredBy: opts.triggeredBy ?? 'event' });
    }
  } else {
    // Fire-and-forget. Errors are caught inside runWorkflow and logged to
    // workflow_runs.error — no need to surface them here.
    for (const wf of matched) {
      void runWorkflow(wf.id, enriched, { triggeredBy: opts.triggeredBy ?? 'event' });
    }
  }

  return { matchedWorkflowIds: matched.map((w) => w.id) };
}

// Keep the matcher loose for the MVP — exact `kind` match is enough for the
// demo. We intentionally don't compare optional fields like `stageId` so
// templates that omit narrowing still fire on the broad event.
function triggerMatches(stored: WorkflowTriggerConfig, incoming: WorkflowTriggerConfig): boolean {
  if (stored.kind !== incoming.kind) return false;

  if (stored.kind === 'deal.stage_changed' && incoming.kind === 'deal.stage_changed') {
    if (stored.stageId !== undefined && stored.stageId !== incoming.stageId) return false;
  }
  if (stored.kind === 'form.submitted' && incoming.kind === 'form.submitted') {
    if (stored.formId !== undefined && stored.formId !== incoming.formId) return false;
  }

  return true;
}
