/**
 * Chat realtime — Postgres LISTEN/NOTIFY publisher + subscriber helpers.
 *
 * Why Postgres NOTIFY: no new realtime infrastructure required. The existing
 * `postgres` client (postgres-js) already exposes `sql.listen()` and
 * `sql.notify()` over the same connection pool that powers Drizzle. SSE on
 * the read side keeps the visitor surface zero-dependency (no Pusher/Ably).
 *
 * Channel layout:
 *   - `chat_conv_${conversationId}`  — per-conversation message stream.
 *     Visitor SSE subscribers and the matching agent UI both LISTEN here.
 *   - `chat_inbox_${clientId}`       — per-tenant inbox stream.
 *     Portal "Inbox" pages LISTEN here for new conversations / status flips.
 *
 * Channel-name safety: NOTIFY identifiers are double-quoted at the wire
 * level by the postgres-js driver, so the identifiers we pass MUST be
 * sanitized to prevent injection. We restrict to `[a-zA-Z0-9_]` and cap
 * length, since the inputs are always `${prefix}${number}`.
 */

import postgres from 'postgres';

type ChatPayloadKind = 'message' | 'conversation';

export interface ChatRealtimePayload {
  kind: ChatPayloadKind;
  /** Server-generated event id so SSE clients can dedupe / replay. */
  eventId: string;
  occurredAt: string;
  data: Record<string, unknown>;
}

// -- Connection ------------------------------------------------------------

// We deliberately use a SEPARATE connection from the Drizzle query client.
// `sql.listen()` parks the underlying socket on a long-lived LISTEN, and
// the Drizzle pool is `max: 1` — sharing it would starve the rest of the
// app of the only connection.
let listenerSql: ReturnType<typeof postgres> | null = null;

function getListenerSql() {
  if (!listenerSql) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set — chat realtime requires Postgres');
    }
    listenerSql = postgres(process.env.DATABASE_URL, {
      // One persistent connection is enough — postgres-js multiplexes
      // multiple LISTEN channels onto a single backend.
      max: 1,
      idle_timeout: 0,
      connect_timeout: 30,
    });
  }
  return listenerSql;
}

// Reuse for NOTIFY too — keeps publishes off the Drizzle query client.
function getNotifierSql() {
  return getListenerSql();
}

// -- Channel naming --------------------------------------------------------

function safeId(n: number): string {
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw new Error(`chat realtime: invalid id ${n}`);
  }
  return String(n);
}

export function conversationChannel(conversationId: number): string {
  return `chat_conv_${safeId(conversationId)}`;
}

export function inboxChannel(clientId: number): string {
  return `chat_inbox_${safeId(clientId)}`;
}

// -- Publishers ------------------------------------------------------------

function newEventId(): string {
  // Cheap monotonic-ish id. Crypto-random is overkill — these are public
  // stream sequence numbers, not security tokens.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function publishMessage(
  conversationId: number,
  clientId: number,
  message: {
    id: number;
    conversationId: number;
    authorKind: 'visitor' | 'agent' | 'system';
    authorName: string | null;
    body: string;
    occurredAt: Date | string;
  },
): Promise<void> {
  const payload: ChatRealtimePayload = {
    kind: 'message',
    eventId: newEventId(),
    occurredAt: new Date().toISOString(),
    data: {
      id: message.id,
      conversationId: message.conversationId,
      authorKind: message.authorKind,
      authorName: message.authorName,
      body: message.body,
      occurredAt: typeof message.occurredAt === 'string' ? message.occurredAt : message.occurredAt.toISOString(),
    },
  };
  const json = JSON.stringify(payload);
  const sql = getNotifierSql();
  // Fire both — message stream for the live conversation, inbox stream so
  // the portal list view bumps unread / lastMessageAt without polling.
  await Promise.all([
    sql.notify(conversationChannel(conversationId), json),
    sql.notify(inboxChannel(clientId), json),
  ]);
}

export async function publishConversationUpdate(
  clientId: number,
  payload: {
    conversationId: number;
    status?: 'open' | 'assigned' | 'closed';
    assignedUserId?: number | null;
    visitorName?: string | null;
    lastMessageAt?: Date | string | null;
    kind?: 'created' | 'updated';
  },
): Promise<void> {
  const event: ChatRealtimePayload = {
    kind: 'conversation',
    eventId: newEventId(),
    occurredAt: new Date().toISOString(),
    data: {
      ...payload,
      lastMessageAt:
        payload.lastMessageAt instanceof Date ? payload.lastMessageAt.toISOString() : payload.lastMessageAt ?? null,
    },
  };
  await getNotifierSql().notify(inboxChannel(clientId), JSON.stringify(event));
}

// -- Subscribers ----------------------------------------------------------

export type ChatSubscription = {
  /** Resolves once the LISTEN is active. */
  ready: Promise<void>;
  /** Stops the LISTEN and releases the postgres-js handle. */
  unsubscribe: () => Promise<void>;
};

/**
 * Subscribe to a channel and forward every NOTIFY payload to `onPayload`.
 *
 * Returns immediately with a `ready` promise + an `unsubscribe` callback.
 * Designed to be plugged directly into a Next.js SSE `ReadableStream` —
 * call `unsubscribe()` from the stream's `cancel` hook.
 */
export function subscribeChannel(
  channel: string,
  onPayload: (payload: ChatRealtimePayload) => void,
): ChatSubscription {
  const sql = getListenerSql();
  const listenReq = sql.listen(channel, (raw) => {
    try {
      const parsed = JSON.parse(raw) as ChatRealtimePayload;
      onPayload(parsed);
    } catch {
      // Drop malformed payloads — never crash the stream.
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
