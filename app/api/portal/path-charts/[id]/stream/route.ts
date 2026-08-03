/**
 * GET /api/portal/path-charts/:id/stream
 *
 * Server-Sent Events feed for one Path Visualizations chart's event log.
 *
 * On connect:
 *   - If a Last-Event-ID header (native EventSource reconnect) or ?since=
 *     query param is present, first replay everything in path_chart_events
 *     newer than that id (capped at REPLAY_LIMIT), THEN start live-streaming.
 *   - Otherwise, skip replay and just record the current newest event id as
 *     the baseline — the client already has (or doesn't want) history and
 *     only cares about what happens from here.
 *
 * Live path: LISTEN on `pathviz_chart_${chartId}` via lib/pathviz/stream.ts.
 * Every NOTIFY is treated as a wakeup signal (not a payload of record) — on
 * each one we re-query path_chart_events for anything newer than the last
 * id we sent and emit each row as `id: <eventId>\ndata: <json>\n\n`, which
 * lets a native EventSource's automatic Last-Event-ID reconnect header do
 * the right thing with no client-side bookkeeping.
 *
 * Heartbeat comment every 15s so intermediary proxies don't kill the
 * connection. Cleanup (LISTEN unsubscribe + heartbeat timer) runs from the
 * ReadableStream's `cancel()` hook, which Next.js invokes when the client
 * disconnects/aborts the request — same pattern as
 * app/api/portal/chat/inbox-stream/route.ts.
 */

import { db } from '@/lib/db';
import { pathChartEvents } from '@/lib/db/schema';
import { eq, and, gt, asc, desc } from 'drizzle-orm';
import { getAuthedPathChart } from '../../_lib';
import { subscribeChartChannel } from '@/lib/pathviz/stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REPLAY_LIMIT = 500;

type StreamedEvent = {
  id: number;
  eventType: string;
  payload: unknown;
  agentLabel: string | null;
  createdAt: Date;
};

async function fetchEventsAfter(chartId: number, afterId: number): Promise<StreamedEvent[]> {
  return db
    .select({
      id: pathChartEvents.id,
      eventType: pathChartEvents.eventType,
      payload: pathChartEvents.payload,
      agentLabel: pathChartEvents.agentLabel,
      createdAt: pathChartEvents.createdAt,
    })
    .from(pathChartEvents)
    .where(and(eq(pathChartEvents.chartId, chartId), gt(pathChartEvents.id, afterId)))
    .orderBy(asc(pathChartEvents.id))
    .limit(REPLAY_LIMIT);
}

async function latestEventId(chartId: number): Promise<number> {
  const [row] = await db
    .select({ id: pathChartEvents.id })
    .from(pathChartEvents)
    .where(eq(pathChartEvents.chartId, chartId))
    .orderBy(desc(pathChartEvents.id))
    .limit(1);
  return row?.id ?? 0;
}

/**
 * Resolve the replay cursor: native EventSource reconnect sends
 * `Last-Event-ID`; a fresh client can pass `?since=` explicitly. Header
 * wins if both are present. Returns null when neither is present (meaning:
 * no replay, just establish a live baseline).
 */
export function parseSince(req: Request): number | null {
  const header = req.headers.get('Last-Event-ID');
  const url = new URL(req.url);
  const raw = header ?? url.searchParams.get('since');
  if (raw == null) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const chartId = parseInt(id, 10);
  if (!Number.isFinite(chartId)) {
    return new Response(JSON.stringify({ success: false, message: 'Invalid ID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = await getAuthedPathChart(chartId);
  if ('error' in result) return result.error;

  const since = parseSince(req);
  const encoder = new TextEncoder();

  // Shared between start()/cancel() — same hoisting pattern as
  // app/api/portal/chat/inbox-stream/route.ts.
  let closed = false;
  let lastSentId = since ?? 0;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => Promise<void>) | null = null;
  let fetching = false;
  let pendingRefetch = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const safeEnqueue = (bytes: Uint8Array) => {
        if (closed) return;
        try {
          controller.enqueue(bytes);
        } catch {
          closed = true;
        }
      };

      const sendEvent = (ev: StreamedEvent) => {
        safeEnqueue(encoder.encode(`id: ${ev.id}\ndata: ${JSON.stringify(ev)}\n\n`));
      };

      // Coalesces bursts of NOTIFYs into a single re-query loop instead of
      // firing overlapping DB calls per notification.
      const pump = async () => {
        if (closed) return;
        if (fetching) {
          pendingRefetch = true;
          return;
        }
        fetching = true;
        try {
          do {
            pendingRefetch = false;
            const newer = await fetchEventsAfter(chartId, lastSentId);
            for (const ev of newer) {
              sendEvent(ev);
              lastSentId = ev.id;
            }
          } while (pendingRefetch && !closed);
        } catch {
          // Transient DB error — drop it; the next NOTIFY retries. Never
          // crash the stream over one failed poll.
        } finally {
          fetching = false;
        }
      };

      try {
        if (since != null) {
          await pump();
        } else {
          lastSentId = await latestEventId(chartId);
        }
      } catch {
        // Proceed to the live subscription regardless of a replay/baseline
        // hiccup — better a client that missed a few backlog events than
        // one that never connects.
      }

      if (closed) return;

      const sub = subscribeChartChannel(chartId, () => {
        void pump();
      });
      unsubscribe = sub.unsubscribe;

      heartbeatTimer = setInterval(() => {
        safeEnqueue(encoder.encode(': heartbeat\n\n'));
      }, 15_000);

      sub.ready.catch(() => {
        // LISTEN setup failed — shut the stream down fully so the heartbeat
        // timer doesn't keep firing into a server-closed controller (cancel()
        // only runs on client-side aborts, not server-initiated closes).
        closed = true;
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    async cancel() {
      closed = true;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (unsubscribe) await unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
