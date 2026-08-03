/**
 * Workflow Designer executions — Postgres LISTEN subscriber for live runs.
 *
 * Mirrors lib/pathviz/stream.ts, for the same reason it exists there: a
 * long-lived LISTEN needs its own connection, and the Drizzle pool cannot
 * park one without starving everything else. The publish side (NOTIFY) is
 * lib/agent-flows/events.ts and reuses the normal pool — this module only
 * ever LISTENs.
 *
 * Two channel scopes, matching the two views:
 *   - project → the executions list (coarse: runs starting/waiting/finishing)
 *   - run     → the detail view (fine: every node event)
 */

import postgres from 'postgres';

// -- Connection --------------------------------------------------------------

let listenerSql: ReturnType<typeof postgres> | null = null;

function getListenerSql() {
  if (!listenerSql) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set — agent-flow realtime requires Postgres');
    }
    listenerSql = postgres(process.env.DATABASE_URL, {
      // One persistent connection is enough — postgres-js multiplexes many
      // LISTEN channels onto a single backend (same as pathviz and chat).
      max: 1,
      idle_timeout: 0,
      connect_timeout: 30,
    });
  }
  return listenerSql;
}

// -- Channel naming ----------------------------------------------------------

function safeId(id: number, what: string): number {
  if (!Number.isFinite(id) || !Number.isInteger(id) || id <= 0) {
    throw new Error(`agent-flow stream: invalid ${what} ${id}`);
  }
  return id;
}

// Keep in sync with lib/agent-flows/events.ts.
export function projectChannel(projectId: number): string {
  return `agent_flow_project_${safeId(projectId, 'project id')}`;
}
export function runChannel(runId: number): string {
  return `agent_flow_run_${safeId(runId, 'run id')}`;
}

/**
 * Best-effort parse of a NOTIFY payload into an event id. The publisher sends
 * the max inserted id as a bare string, but this is only ever a WAKEUP signal:
 * the SSE route re-queries for anything newer than its own cursor, so a
 * malformed or missing payload costs nothing.
 */
function parseNotifyPayload(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// -- Subscriber --------------------------------------------------------------

export type AgentFlowSubscription = {
  /** Resolves once the LISTEN is active. */
  ready: Promise<void>;
  /** Stops the LISTEN and releases the handle. */
  unsubscribe: () => Promise<void>;
};

function subscribe(channel: string, onNotify: (eventId: number | null) => void): AgentFlowSubscription {
  const sql = getListenerSql();
  const listenReq = sql.listen(channel, (raw) => {
    try {
      onNotify(parseNotifyPayload(raw));
    } catch {
      // Never let a malformed payload or handler error kill the LISTEN.
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

/**
 * Subscribe to one run's fine-grained channel. Plug straight into a Next SSE
 * `ReadableStream` and call `unsubscribe()` from its `cancel` hook.
 */
export function subscribeRunChannel(
  runId: number,
  onNotify: (eventId: number | null) => void,
): AgentFlowSubscription {
  return subscribe(runChannel(runId), onNotify);
}

/** Subscribe to a project's coarse channel — run lifecycle only. */
export function subscribeProjectChannel(
  projectId: number,
  onNotify: (eventId: number | null) => void,
): AgentFlowSubscription {
  return subscribe(projectChannel(projectId), onNotify);
}

// -- Test hook ---------------------------------------------------------------

/** Reset the cached listener — used by unit tests after stubbing. */
export function __resetForTesting() {
  listenerSql = null;
}
