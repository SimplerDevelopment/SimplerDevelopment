/**
 * Path Visualizations ("Dev Paths") — Postgres LISTEN subscriber for live
 * chart streams (Phase 3 read/SSE side).
 *
 * Mirrors lib/chat/realtime.ts's subscriber half: a DEDICATED postgres-js
 * connection, never the shared Drizzle pool. `sql.listen()` parks the
 * underlying socket on a long-lived LISTEN, and the Drizzle pool is
 * `max: 1` — sharing it would starve the rest of the app of its only
 * connection.
 *
 * Publish side (NOTIFY) lives in lib/pathviz/events.ts (Phase 2, owned by a
 * parallel worker in this fan-out) — this module only ever LISTENs.
 *
 * Channel: `pathviz_chart_${chartId}` — keep in sync with
 * lib/pathviz/events.ts (Phase 2).
 */

import postgres from 'postgres';

// -- Connection ------------------------------------------------------------

let listenerSql: ReturnType<typeof postgres> | null = null;

function getListenerSql() {
  if (!listenerSql) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set — pathviz realtime requires Postgres');
    }
    listenerSql = postgres(process.env.DATABASE_URL, {
      // One persistent connection is enough — postgres-js multiplexes
      // multiple LISTEN channels onto a single backend (same as chat).
      max: 1,
      idle_timeout: 0,
      connect_timeout: 30,
    });
  }
  return listenerSql;
}

// -- Channel naming ---------------------------------------------------------

function safeChartId(chartId: number): number {
  if (!Number.isFinite(chartId) || !Number.isInteger(chartId) || chartId <= 0) {
    throw new Error(`pathviz stream: invalid chart id ${chartId}`);
  }
  return chartId;
}

// keep in sync with lib/pathviz/events.ts (Phase 2)
export function chartChannel(chartId: number): string {
  return `pathviz_chart_${safeChartId(chartId)}`;
}

// -- Payload parsing ---------------------------------------------------------

/**
 * Best-effort parse of a NOTIFY payload into an event id. The publisher
 * (lib/pathviz/events.ts, Phase 2) may send either a bare numeric string
 * (`sql.notify(channel, String(eventId))`) or a small JSON envelope
 * (`{"eventId": 123}`) — accept either shape.
 *
 * Callers that only need a "something changed on this chart" wakeup signal
 * (e.g. the SSE route, which always re-queries path_chart_events for
 * anything newer than the last id it sent) can safely ignore a null result
 * — it just means "go check anyway."
 */
function parseNotifyPayload(raw: string): number | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'number') return parsed;
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as { eventId?: unknown }).eventId === 'number'
    ) {
      return (parsed as { eventId: number }).eventId;
    }
  } catch {
    // not JSON — fall through to bare-integer parse
  }
  const asInt = parseInt(raw, 10);
  return Number.isFinite(asInt) ? asInt : null;
}

// -- Subscriber ---------------------------------------------------------

export type PathvizSubscription = {
  /** Resolves once the LISTEN is active. */
  ready: Promise<void>;
  /** Stops the LISTEN and releases the postgres-js handle. */
  unsubscribe: () => Promise<void>;
};

/**
 * Subscribe to one chart's NOTIFY channel (`pathviz_chart_${chartId}`).
 * `onNotify` fires on every NOTIFY with the best-effort-parsed event id (or
 * null if the payload couldn't be parsed) — treat it as a wakeup signal, not
 * a source of truth. The caller should re-query path_chart_events for
 * anything newer than its own last-sent cursor rather than trusting the
 * NOTIFY payload's contents.
 *
 * Designed to be plugged directly into a Next.js SSE `ReadableStream` — call
 * `unsubscribe()` from the stream's `cancel` hook.
 */
export function subscribeChartChannel(
  chartId: number,
  onNotify: (eventId: number | null) => void,
): PathvizSubscription {
  const sql = getListenerSql();
  const channel = chartChannel(chartId);
  const listenReq = sql.listen(channel, (raw) => {
    try {
      onNotify(parseNotifyPayload(raw));
    } catch {
      // Never let a malformed payload / handler error crash the LISTEN.
      onNotify(null);
    }
  });

  return {
    ready: listenReq.then(() => undefined),
    unsubscribe: async () => {
      try {
        const handle = await listenReq;
        await handle.unlisten();
      } catch {
        // already torn down
      }
    },
  };
}

// -- Test hook ------------------------------------------------------------

/** Reset the cached listener — used by unit tests after stubbing. */
export function __resetForTesting() {
  listenerSql = null;
}
