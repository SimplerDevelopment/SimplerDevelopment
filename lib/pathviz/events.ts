/**
 * Path Visualizations ("Dev Paths") — shared event-append helper (Phase 2).
 *
 * Every MCP write in lib/mcp/tools/pathviz.ts funnels its resulting
 * path_chart_events row(s) through appendPathChartEvents() so the three
 * side-effects every write needs — the append-only event log, the live
 * pg_notify signal, and path_charts.updated_at — stay in lockstep instead of
 * each of the 13 tools re-deriving this by hand.
 *
 * NOTIFY approach: unlike lib/chat/realtime.ts / lib/pathviz/stream.ts (which
 * park a DEDICATED postgres-js connection for a long-lived LISTEN), this
 * module only ever NOTIFIes — a single short-lived statement — so it reuses
 * the existing Drizzle pool (`@/lib/db`) via `pg_notify(channel, payload)`
 * rather than opening a second connection. `pg_notify` takes the channel as
 * a plain text argument (not a SQL identifier), so a normal parameterized
 * `sql` template is safe with no identifier-quoting/injection concern (the
 * concern lib/chat/realtime.ts's `safeId()` guards against for the `NOTIFY
 * channel, payload` command form). lib/pathviz/stream.ts (Phase 3) is the
 * one that LISTENs, on its own dedicated connection.
 */

import { sql, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { pathChartEvents, pathCharts } from '@/lib/db/schema';

export interface PathChartEventInput {
  eventType: string;
  payload: Record<string, unknown>;
  agentLabel?: string | null;
}

// Channel: `pathviz_chart_${chartId}` — keep in sync with
// lib/pathviz/stream.ts (Phase 3), which LISTENs on this exact channel.
function chartChannel(chartId: number): string {
  return `pathviz_chart_${chartId}`;
}

/**
 * Insert one or more path_chart_events rows for a chart, bump
 * path_charts.updated_at, and NOTIFY the chart's live channel with the max
 * inserted event id (Phase 3's SSE route treats this as a wakeup signal and
 * re-queries path_chart_events — see lib/pathviz/stream.ts's
 * parseNotifyPayload doc comment — so it tolerates a best-effort id).
 *
 * The insert + updated_at bump run in a transaction (all-or-nothing); the
 * NOTIFY runs after commit and is best-effort — a notify failure must never
 * undo or fail a write that already persisted its events.
 */
export async function appendPathChartEvents(
  chartId: number,
  events: PathChartEventInput[],
): Promise<void> {
  if (events.length === 0) return;

  const maxId = await db.transaction(async (tx) => {
    const rows = await tx
      .insert(pathChartEvents)
      .values(
        events.map((e) => ({
          chartId,
          eventType: e.eventType,
          payload: e.payload,
          agentLabel: e.agentLabel ?? null,
        })),
      )
      .returning({ id: pathChartEvents.id });

    await tx
      .update(pathCharts)
      .set({ updatedAt: new Date() })
      .where(eq(pathCharts.id, chartId));

    return rows.reduce((max, r) => Math.max(max, r.id), 0);
  });

  try {
    await db.execute(sql`select pg_notify(${chartChannel(chartId)}, ${String(maxId)})`);
  } catch (err) {
    console.warn('[pathviz] pg_notify failed:', err);
  }
}
