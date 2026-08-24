/**
 * Kanban boards — Postgres LISTEN subscriber for live board updates.
 *
 * Mirrors lib/agent-flows/stream.ts and lib/pathviz/stream.ts, for the same
 * reason they exist: a long-lived LISTEN needs its own connection, and the
 * Drizzle pool cannot park one without starving everything else. The publish
 * side (NOTIFY) is lib/kanban/events.ts and reuses the normal pool — this
 * module only ever LISTENs.
 *
 * One channel scope only: per project. A board is a single view, so unlike the
 * flows subsystem there is no coarse/fine split to make. There is deliberately
 * no cross-tenant admin channel either — nothing renders every client's boards
 * at once, so the channel that would carry it has no consumer.
 *
 * NOTE ON CONNECTION COUNT: this is the fourth subsystem to open its own
 * dedicated LISTEN backend (agent-flows, pathviz, chat, now kanban). Each is
 * max:1 and postgres-js multiplexes many channels onto it, so the cost is one
 * connection per subsystem per running instance — not per subscriber. Worth
 * consolidating into a shared listener if a fifth appears; not worth refactoring
 * three working subsystems for the fourth.
 */

import postgres from 'postgres';

// -- Connection --------------------------------------------------------------

let listenerSql: ReturnType<typeof postgres> | null = null;

function getListenerSql() {
  if (!listenerSql) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set — kanban realtime requires Postgres');
    }
    listenerSql = postgres(process.env.DATABASE_URL, {
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
    throw new Error(`kanban stream: invalid ${what} ${id}`);
  }
  return id;
}

/**
 * Keep in sync with lib/kanban/events.ts. Duplicated rather than imported on
 * purpose: that module pulls in the Drizzle client, and this one must stay a
 * bare LISTEN subscriber — the same split agent-flows makes.
 */
export function boardChannel(projectId: number): string {
  return `kanban_board_${safeId(projectId, 'project id')}`;
}

// -- Subscriber --------------------------------------------------------------

export type KanbanSubscription = {
  /** Resolves once the LISTEN is active. */
  ready: Promise<void>;
  /** Stops the LISTEN and releases the handle. */
  unsubscribe: () => Promise<void>;
};

/**
 * Subscribe to one project's board channel. Plug straight into a Next SSE
 * `ReadableStream` and call `unsubscribe()` from its `cancel` hook.
 *
 * The callback takes no argument: the NOTIFY payload is empty by design (see
 * events.ts), so there is nothing to parse and nothing that a malformed payload
 * could break.
 */
export function subscribeBoardChannel(
  projectId: number,
  onNotify: () => void,
): KanbanSubscription {
  const sql = getListenerSql();
  const listenReq = sql.listen(boardChannel(projectId), () => {
    try {
      onNotify();
    } catch {
      // Never let a handler error kill the LISTEN.
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

// -- Test hook ---------------------------------------------------------------

/** Reset the cached listener — used by unit tests after stubbing. */
export function __resetForTesting() {
  listenerSql = null;
}
