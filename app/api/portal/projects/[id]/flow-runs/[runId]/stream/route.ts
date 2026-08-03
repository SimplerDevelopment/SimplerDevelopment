/**
 * GET /api/portal/projects/:id/flow-runs/:runId/stream
 *
 * Server-Sent Events feed for ONE execution's event log — the fine-grained
 * channel. Pattern deliberately mirrors
 * app/api/portal/path-charts/[id]/stream/route.ts, which is the worked
 * reference in this repo for LISTEN/NOTIFY-backed SSE.
 *
 * On connect:
 *   - With a Last-Event-ID header (native EventSource reconnect) or ?since=,
 *     replay everything newer than that id first (capped), then live-stream.
 *   - Without one, replay the whole run from the start. Unlike a long-lived
 *     chart, a run's log is bounded and the client NEEDS the full history to
 *     fold per-node state (there is no per-node table by design) — so full
 *     replay is the default here rather than the exception.
 *
 * Live path: LISTEN on `agent_flow_run_${runId}`. Every NOTIFY is a wakeup,
 * not a payload of record: we re-query for rows newer than the last id sent
 * and emit `id: <eventId>\ndata: <json>\n\n`, so a native EventSource's
 * automatic Last-Event-ID reconnect does the right thing with no client
 * bookkeeping.
 *
 * Heartbeat every 15s so proxies don't kill the connection. Cleanup runs from
 * the ReadableStream `cancel()` hook.
 */

import { db } from '@/lib/db';
import { agentFlowRuns, agentFlowRunEvents, projects } from '@/lib/db/schema';
import { and, eq, gt, asc } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { isPortalStaff } from '@/lib/portal';
import { getPortalClient } from '@/lib/portal-client';
import { subscribeRunChannel } from '@/lib/agent-flows/stream';
import { TERMINAL_RUN_STATUSES, type AgentFlowRunStatus } from '@/lib/agent-flows/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// A run's log is bounded (one flow execution), so this is a safety valve for a
// pathological rework loop, not the normal path.
const REPLAY_LIMIT = 2000;
const HEARTBEAT_MS = 15_000;

/**
 * runId is never trusted alone — it is joined to a tenant-owned project, so a
 * run belonging to another project (even one owned by the same client) fails
 * closed to 404 rather than leaking that it exists.
 */
async function authorize(projectId: number, runId: number) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = parseInt(session.user.id, 10);
  const staff = await isPortalStaff();

  const [project] = await db.select({ id: projects.id, clientId: projects.clientId })
    .from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return null;

  if (!staff) {
    const client = await getPortalClient(userId);
    if (!client || client.id !== project.clientId) return null;
  }

  const [run] = await db.select({ id: agentFlowRuns.id, status: agentFlowRuns.status })
    .from(agentFlowRuns)
    .where(and(eq(agentFlowRuns.id, runId), eq(agentFlowRuns.projectId, projectId)))
    .limit(1);
  if (!run) return null;

  return { run };
}

async function fetchEventsAfter(runId: number, afterId: number) {
  return db.select({
    id: agentFlowRunEvents.id,
    type: agentFlowRunEvents.type,
    nodeId: agentFlowRunEvents.nodeId,
    status: agentFlowRunEvents.status,
    summary: agentFlowRunEvents.summary,
    model: agentFlowRunEvents.model,
    inputTokens: agentFlowRunEvents.inputTokens,
    outputTokens: agentFlowRunEvents.outputTokens,
    durationMs: agentFlowRunEvents.durationMs,
    createdAt: agentFlowRunEvents.createdAt,
  })
    .from(agentFlowRunEvents)
    .where(and(eq(agentFlowRunEvents.runId, runId), gt(agentFlowRunEvents.id, afterId)))
    .orderBy(asc(agentFlowRunEvents.id))
    .limit(REPLAY_LIMIT);
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const { id, runId: runIdRaw } = await params;
  const projectId = parseInt(id, 10);
  const runId = parseInt(runIdRaw, 10);
  if (isNaN(projectId) || isNaN(runId)) {
    return new Response('Invalid id', { status: 400 });
  }

  const access = await authorize(projectId, runId);
  if (!access) return new Response('Not found', { status: 404 });

  const url = new URL(req.url);
  const lastEventHeader = req.headers.get('last-event-id');
  const sinceParam = url.searchParams.get('since');
  // Default 0 = full replay. The client folds the log to derive node state, so
  // it genuinely needs history on a cold connect.
  let cursor = Number.parseInt(lastEventHeader ?? sinceParam ?? '0', 10);
  if (!Number.isFinite(cursor) || cursor < 0) cursor = 0;

  const encoder = new TextEncoder();
  let unsubscribe: (() => Promise<void>) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (chunk: string) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(chunk)); } catch { closed = true; }
      };

      const flush = async () => {
        const rows = await fetchEventsAfter(runId, cursor);
        for (const r of rows) {
          cursor = r.id;
          send(`id: ${r.id}\ndata: ${JSON.stringify({ ...r, runId })}\n\n`);
        }
        return rows;
      };

      await flush();

      // If the run is already over, say so and close rather than holding a
      // connection open forever on something that will never emit again.
      if (TERMINAL_RUN_STATUSES.includes(access.run.status as AgentFlowRunStatus)) {
        send(`event: done\ndata: ${JSON.stringify({ status: access.run.status })}\n\n`);
        closed = true;
        try { controller.close(); } catch { /* already closed */ }
        return;
      }

      let flushing = false;
      const sub = subscribeRunChannel(runId, () => {
        // Coalesce: a burst of NOTIFYs collapses into one re-query.
        if (flushing) return;
        flushing = true;
        void flush().finally(() => { flushing = false; });
      });
      unsubscribe = sub.unsubscribe;
      await sub.ready;

      heartbeat = setInterval(() => send(': ping\n\n'), HEARTBEAT_MS);
    },
    async cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      if (unsubscribe) await unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Nginx/proxy buffering would defeat the whole point.
      'X-Accel-Buffering': 'no',
    },
  });
}
