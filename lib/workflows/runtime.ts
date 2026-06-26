// In-process workflow executor. Walks the graph from the trigger node,
// executes each downstream action sequentially, logs each step. NOT
// production-grade — no retries, no durable queue, no parallelism. The point
// is to make the canvas demoable end-to-end.

import { db } from '@/lib/db';
import {
  workflows,
  workflowRuns,
  workflowStepLogs,
  emailTemplates,
  emailSubscribers,
  kanbanCards,
  kanbanColumns,
  kanbanCardAssignees,
  projects as projectsTable,
} from '@/lib/db/schema';
import { eq, asc, and } from 'drizzle-orm';
import { resolveResendKey } from '@/lib/email/resolve-resend';
import { Resend } from 'resend';
import { randomBytes } from 'crypto';
import type {
  WorkflowAction,
  WorkflowEdge,
  WorkflowGraph,
  WorkflowNode,
  WorkflowRunContext,
  WorkflowStepStatus,
} from './types';

interface RunOptions {
  triggeredBy?: string;
  // Wait actions can sleep up to a configurable cap so the demo doesn't hang
  // for an hour. Default: 5s. Tests can pass 0.
  maxWaitMs?: number;
}

interface StepResult {
  status: WorkflowStepStatus;
  output: Record<string, unknown> | null;
  durationMs: number;
  // For 'condition' nodes — chooses which branch to follow next.
  branch?: 'true' | 'false';
}

const DEFAULT_MAX_WAIT_MS = 5_000;

export async function runWorkflow(
  workflowId: number,
  triggerContext: WorkflowRunContext,
  opts: RunOptions = {},
): Promise<{ runId: number; status: 'completed' | 'failed'; error?: string }> {
  const [wf] = await db.select().from(workflows).where(eq(workflows.id, workflowId)).limit(1);
  if (!wf) throw new Error(`workflow ${workflowId} not found`);

  // Open a run row. Status starts 'running' once we begin executing.
  const [run] = await db
    .insert(workflowRuns)
    .values({
      workflowId: wf.id,
      clientId: wf.clientId,
      triggeredBy: opts.triggeredBy ?? 'manual',
      status: 'running',
      context: { ...triggerContext, _trigger: wf.trigger },
      startedAt: new Date(),
    })
    .returning();

  const graph = wf.graph as WorkflowGraph;
  const triggerNode = graph.nodes.find((n) => n.type === 'trigger');

  if (!triggerNode) {
    const err = 'workflow has no trigger node';
    await markFailed(run.id, err);
    return { runId: run.id, status: 'failed', error: err };
  }

  try {
    await walk(graph, triggerNode, run.id, { ...triggerContext, _trigger: wf.trigger }, opts);
    await db
      .update(workflowRuns)
      .set({ status: 'completed', completedAt: new Date() })
      .where(eq(workflowRuns.id, run.id));
    return { runId: run.id, status: 'completed' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markFailed(run.id, message);
    return { runId: run.id, status: 'failed', error: message };
  }
}

async function markFailed(runId: number, error: string) {
  await db
    .update(workflowRuns)
    .set({ status: 'failed', completedAt: new Date(), error })
    .where(eq(workflowRuns.id, runId));
}

async function walk(
  graph: WorkflowGraph,
  startNode: WorkflowNode,
  runId: number,
  context: WorkflowRunContext,
  opts: RunOptions,
) {
  // Iterative DFS — supports the fan-out shape in the "stage advance" template.
  // Cycle guard: each node fires at most once per run.
  const visited = new Set<string>();
  // The trigger itself counts as visited so we don't re-fire it if it sits
  // downstream of a fan-out.
  visited.add(startNode.id);

  // Log the trigger as the first step (no side-effect, just a marker).
  await db.insert(workflowStepLogs).values({
    runId,
    nodeId: startNode.id,
    action: 'trigger',
    status: 'success',
    input: cloneRecord(startNode.data as unknown as Record<string, unknown>),
    output: { kind: 'trigger' },
    durationMs: 0,
    occurredAt: new Date(),
  });

  const stack: { node: WorkflowNode }[] = [];
  for (const next of nextNodes(graph, startNode.id)) {
    stack.push({ node: next.node });
  }

  while (stack.length > 0) {
    const frame = stack.pop();
    if (!frame) break;
    const { node } = frame;
    if (visited.has(node.id)) continue;
    visited.add(node.id);

    const result = await executeStep(node, runId, context, opts);

    if (node.type === 'condition') {
      // Branch on the condition's result.true/false output. Plain action edges
      // (no label) are also allowed downstream but condition nodes prefer
      // matching label branches.
      const branch = result.branch ?? 'false';
      for (const next of nextNodes(graph, node.id)) {
        if (!next.label || next.label === branch) {
          stack.push({ node: next.node });
        }
      }
    } else if (result.status !== 'failed') {
      for (const next of nextNodes(graph, node.id)) {
        stack.push({ node: next.node });
      }
    }
  }
}

interface NextEdge {
  node: WorkflowNode;
  label?: WorkflowEdge['label'];
}

function nextNodes(graph: WorkflowGraph, fromId: string): NextEdge[] {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n] as const));
  const out: NextEdge[] = [];
  for (const edge of graph.edges) {
    if (edge.source !== fromId) continue;
    const target = nodeById.get(edge.target);
    if (!target) continue;
    const entry: NextEdge = { node: target };
    if (edge.label !== undefined) entry.label = edge.label;
    out.push(entry);
  }
  return out;
}

async function executeStep(
  node: WorkflowNode,
  runId: number,
  context: WorkflowRunContext,
  opts: RunOptions,
): Promise<StepResult> {
  const start = Date.now();
  let result: StepResult;
  try {
    result = await executeAction(node.data as WorkflowAction, context, opts, runId, node.id);
    result.durationMs = Date.now() - start;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result = {
      status: 'failed',
      output: { error: message },
      durationMs: Date.now() - start,
    };
  }

  // For condition nodes node.type === 'condition' and data.kind === 'condition'.
  // Guard against any node whose data lacks a kind (e.g. legacy/corrupt graphs)
  // so the NOT NULL constraint on workflow_step_logs.action is always satisfied.
  const action = (node.data as WorkflowAction).kind ?? node.type;
  await db.insert(workflowStepLogs).values({
    runId,
    nodeId: node.id,
    action,
    status: result.status,
    input: cloneRecord(node.data as unknown as Record<string, unknown>),
    output: result.output,
    durationMs: result.durationMs,
    occurredAt: new Date(),
  });

  return result;
}

async function executeAction(
  action: WorkflowAction,
  context: WorkflowRunContext,
  opts: RunOptions,
  runId?: number,
  nodeId?: string,
): Promise<StepResult> {
  switch (action.kind) {
    case 'wait': {
      const ms = Math.max(0, Math.min(action.ms, opts.maxWaitMs ?? DEFAULT_MAX_WAIT_MS));
      if (ms > 0) await new Promise((r) => setTimeout(r, ms));
      return { status: 'success', output: { waited: ms, requested: action.ms }, durationMs: 0 };
    }

    case 'webhook': {
      try {
        const res = await fetch(action.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(action.payload ?? {}),
        });
        return {
          status: res.ok ? 'success' : 'failed',
          output: { url: action.url, status: res.status },
          durationMs: 0,
        };
      } catch (err) {
        return {
          status: 'failed',
          output: { url: action.url, error: err instanceof Error ? err.message : String(err) },
          durationMs: 0,
        };
      }
    }

    case 'condition': {
      // MVP — never wires a real expression evaluator. Honour an explicit
      // override on the run context (`context.conditions[expression]`), else
      // default to `true` so downstream branches still fire in the demo.
      const expression = action.expression;
      const value = pickConditionResult(context, expression);
      return {
        status: 'success',
        output: { expression, value },
        durationMs: 0,
        branch: value ? 'true' : 'false',
      };
    }

    case 'create_task': {
      // Find any kanban project for this client and drop a card on its first
      // column. Best-effort — if there's no project, log the intent and move on.
      const clientId = typeof context.clientId === 'number' ? context.clientId : null;
      if (!clientId) {
        return {
          status: 'skipped',
          output: { reason: 'no clientId in context', title: action.title },
          durationMs: 0,
        };
      }

      const [project] = await db
        .select({ id: projectsTable.id })
        .from(projectsTable)
        .where(eq(projectsTable.clientId, clientId))
        .limit(1);

      if (!project) {
        return {
          status: 'skipped',
          output: { reason: 'no kanban project for client', title: action.title },
          durationMs: 0,
        };
      }

      const [column] = await db
        .select({ id: kanbanColumns.id })
        .from(kanbanColumns)
        .where(eq(kanbanColumns.projectId, project.id))
        .orderBy(asc(kanbanColumns.order))
        .limit(1);

      if (!column) {
        return {
          status: 'skipped',
          output: { reason: 'project has no columns', title: action.title },
          durationMs: 0,
        };
      }

      const [card] = await db
        .insert(kanbanCards)
        .values({
          columnId: column.id,
          projectId: project.id,
          title: action.title,
          order: 0,
        })
        .returning({ id: kanbanCards.id });

      if (card && action.assigneeId) {
        await db.insert(kanbanCardAssignees).values({
          cardId: card.id,
          userId: action.assigneeId,
        });
      }

      return {
        status: 'success',
        output: { cardId: card?.id ?? null, projectId: project.id, columnId: column.id },
        durationMs: 0,
      };
    }

    case 'send_email': {
      const clientId = typeof context.clientId === 'number' ? context.clientId : null;
      if (!clientId) {
        return { status: 'skipped', output: { reason: 'no clientId in context' }, durationMs: 0 };
      }

      // Idempotency: if a prior success log exists for this run+node, skip the send.
      if (runId != null && nodeId) {
        const [prior] = await db
          .select({ id: workflowStepLogs.id })
          .from(workflowStepLogs)
          .where(
            and(
              eq(workflowStepLogs.runId, runId),
              eq(workflowStepLogs.nodeId, nodeId),
              eq(workflowStepLogs.status, 'success'),
            ),
          )
          .limit(1);
        if (prior) {
          return {
            status: 'skipped',
            output: { idempotency: 'already_sent', priorLogId: prior.id },
            durationMs: 0,
          };
        }
      }

      // Resolve recipient email from run context.
      let toEmail: string;
      if (action.to === 'contact') {
        const contactEmail = typeof context.contactEmail === 'string' ? context.contactEmail : null;
        if (!contactEmail) {
          return { status: 'skipped', output: { reason: 'no contactEmail in context' }, durationMs: 0 };
        }
        toEmail = contactEmail;
      } else if (action.to === 'owner') {
        const ownerEmail = typeof context.ownerEmail === 'string' ? context.ownerEmail : null;
        if (!ownerEmail) {
          return { status: 'skipped', output: { reason: 'no ownerEmail in context' }, durationMs: 0 };
        }
        toEmail = ownerEmail;
      } else {
        toEmail = action.to;
      }

      // Look up the email template.
      const [template] = await db
        .select()
        .from(emailTemplates)
        .where(eq(emailTemplates.id, action.templateId))
        .limit(1);

      if (!template) {
        return {
          status: 'failed',
          output: { reason: `template ${action.templateId} not found` },
          durationMs: 0,
        };
      }

      // Send via Resend with idempotency header.
      try {
        const { key } = await resolveResendKey(clientId);
        const resend = new Resend(key);
        const idempotencyKey =
          runId != null && nodeId ? `wf:${runId}:${nodeId}` : undefined;
        const fromEmail =
          process.env.DEFAULT_FROM_EMAIL ?? 'noreply@simplerdevelopment.com';

        const result = await resend.emails.send({
          from: fromEmail,
          to: toEmail,
          subject: template.subject ?? '(no subject)',
          html: template.htmlContent,
          ...(idempotencyKey
            ? { headers: { 'Idempotency-Key': idempotencyKey } }
            : {}),
        });

        return {
          status: 'success',
          output: {
            resendId: result.data?.id ?? null,
            to: toEmail,
            templateId: action.templateId,
          },
          durationMs: 0,
        };
      } catch (err) {
        return {
          status: 'failed',
          output: {
            error: err instanceof Error ? err.message : String(err),
            to: toEmail,
            templateId: action.templateId,
          },
          durationMs: 0,
        };
      }
    }

    case 'add_to_list': {
      const contactEmail = typeof context.contactEmail === 'string' ? context.contactEmail : null;
      if (!contactEmail) {
        return {
          status: 'skipped',
          output: { reason: 'no contactEmail in context', listId: action.listId },
          durationMs: 0,
        };
      }

      // Generate an unsubscribe token — required by emailSubscribers schema.
      // onConflictDoNothing() makes this idempotent: re-running for the same
      // (listId, email) pair is a no-op (unique index on list_id + email).
      const unsubscribeToken = randomBytes(32).toString('hex');

      await db
        .insert(emailSubscribers)
        .values({
          listId: action.listId,
          email: contactEmail,
          unsubscribeToken,
          // status defaults to 'active', subscribedAt defaults to now()
        })
        .onConflictDoNothing();

      return {
        status: 'success',
        output: { listId: action.listId, email: contactEmail },
        durationMs: 0,
      };
    }

    default: {
      // Exhaustiveness guard — keeps the switch honest if a new action kind
      // is added to types.ts without a handler here.
      const _exhaustive: never = action;
      void _exhaustive;
      return { status: 'skipped', output: { unknownAction: true }, durationMs: 0 };
    }
  }
}

// Look up a per-expression condition override in context. Tests pass
// `{ conditions: { 'deal.stale': true } }` to choose a branch.
function pickConditionResult(context: WorkflowRunContext, expression: string): boolean {
  const conditions = context.conditions;
  if (conditions && typeof conditions === 'object') {
    const map = conditions as Record<string, boolean>;
    if (expression in map) return Boolean(map[expression]);
  }
  return true;
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  // Avoids mutating caller objects when we round-trip through the log table.
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}
