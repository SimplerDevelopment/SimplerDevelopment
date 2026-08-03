/**
 * Workflow Designer executions — append-only event log + live NOTIFY.
 *
 * Every run write funnels through appendRunEvent() so the four side-effects a
 * write needs stay in lockstep instead of each MCP tool re-deriving them:
 * the event row, the run's rollups (tokens / lastEventAt / status), and the
 * two NOTIFY channels.
 *
 * Two channels on purpose (see the stream routes for the full reasoning):
 *
 *   agent_flow_project_${projectId}  — coarse. Run lifecycle only, so the
 *                                      executions list can show a run appear
 *                                      without every viewer receiving every
 *                                      node event of every run.
 *   agent_flow_run_${runId}          — fine. Everything, for the detail view.
 *
 * NOTIFY approach mirrors lib/pathviz/events.ts: this module only ever
 * NOTIFIes (a single short statement), so it reuses the Drizzle pool rather
 * than parking a dedicated connection. `pg_notify` takes the channel as a
 * plain text argument, not a SQL identifier, so a parameterized template is
 * safe with no identifier-quoting concern. lib/agent-flows/stream.ts is the
 * one that LISTENs, on its own connection.
 */

import { sql, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { agentFlowRuns, agentFlowRunEvents } from '@/lib/db/schema';
import {
  RUN_EVENT_SUMMARY_MAX,
  TERMINAL_RUN_STATUSES,
  type AgentFlowEventType,
  type AgentFlowRunStatus,
  type AgentFlowNodeRunStatus,
} from './types';

export function projectChannel(projectId: number): string {
  return `agent_flow_project_${projectId}`;
}
export function runChannel(runId: number): string {
  return `agent_flow_run_${runId}`;
}

/** Run-lifecycle events also go to the coarse project channel. Node-level
 *  chatter deliberately does not — that is the whole point of splitting. */
const PROJECT_SCOPED: ReadonlySet<AgentFlowEventType> = new Set([
  'run.started',
  'run.waiting',
  'run.finished',
]);

export interface RunEventInput {
  type: AgentFlowEventType;
  nodeId?: string | null;
  status?: AgentFlowNodeRunStatus | AgentFlowRunStatus | null;
  summary?: string | null;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  durationMs?: number | null;
}

/**
 * Append one event, update the run's derived columns, and signal both channels.
 *
 * The insert + run update run in one transaction so a viewer can never observe
 * an event whose run row has not caught up. The NOTIFYs run after commit and
 * are best-effort: a failed notify must never undo a write that persisted, and
 * the SSE route re-queries on every wakeup anyway, so a dropped signal costs
 * latency (until the next event or reconnect), not correctness.
 */
export async function appendRunEvent(
  runId: number,
  projectId: number,
  input: RunEventInput,
): Promise<{ eventId: number }> {
  const summary = input.summary == null
    ? null
    // Hard cap: this is pushed to every connected viewer on every event.
    : input.summary.slice(0, RUN_EVENT_SUMMARY_MAX);

  const eventId = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(agentFlowRunEvents)
      .values({
        runId,
        type: input.type,
        nodeId: input.nodeId ?? null,
        status: input.status ?? null,
        summary,
        model: input.model ?? null,
        inputTokens: input.inputTokens ?? null,
        outputTokens: input.outputTokens ?? null,
        durationMs: input.durationMs ?? null,
      })
      .returning({ id: agentFlowRunEvents.id });

    // Roll token usage onto the run so the executions list never aggregates
    // the log. Written as SQL increments rather than read-modify-write so two
    // concurrent events cannot lose each other's tokens.
    const updates: Record<string, unknown> = { lastEventAt: new Date() };
    if (input.inputTokens) {
      updates.inputTokens = sql`${agentFlowRuns.inputTokens} + ${input.inputTokens}`;
    }
    if (input.outputTokens) {
      updates.outputTokens = sql`${agentFlowRuns.outputTokens} + ${input.outputTokens}`;
    }

    // Status transitions are derived from the event rather than set separately,
    // so the log and the run row cannot disagree about what happened.
    if (input.type === 'run.waiting') {
      updates.status = 'waiting';
    } else if (input.type === 'run.finished') {
      const s = (input.status ?? 'succeeded') as AgentFlowRunStatus;
      updates.status = s;
      updates.finishedAt = new Date();
    } else if (input.type === 'node.status' && input.status === 'started') {
      // A node starting means a human node was answered — back to running.
      updates.status = 'running';
    }

    await tx.update(agentFlowRuns).set(updates).where(eq(agentFlowRuns.id, runId));
    return row.id;
  });

  // Wake the fine channel always, the coarse one only for lifecycle events.
  const channels = [runChannel(runId)];
  if (PROJECT_SCOPED.has(input.type)) channels.push(projectChannel(projectId));
  for (const ch of channels) {
    try {
      await db.execute(sql`select pg_notify(${ch}, ${String(eventId)})`);
    } catch (err) {
      console.warn('[agent-flows] pg_notify failed on', ch, err);
    }
  }

  return { eventId };
}

/** True once a run can never advance again. */
export function isTerminal(status: AgentFlowRunStatus): boolean {
  return TERMINAL_RUN_STATUSES.includes(status);
}
