// WebChat gateway wiring — the first live circuit through ChannelGateway.
//
// Inbound: the visitor route normalizes the widget message and calls
// `processInbound` with db repos (lib/channels/repos-db.ts), so contact
// resolution, conversation linking, consent checks and events all flow
// through the gateway instead of ad-hoc inserts.
//
// Outbound: the WebChat adapter's sendFn persists the agent message with
// full omnichannel columns and publishes to the existing realtime stream
// (lib/chat/realtime.ts), so the widget sees AI/agent replies live with no
// widget changes.

import { and, eq } from 'drizzle-orm';
import { db as defaultDb } from '@/lib/db';
import { chatConversations } from '@/lib/db/schema';
import { publishConversationUpdate, publishMessage } from '@/lib/chat/realtime';
import { ChannelGateway, type EventSink, type GatewayRepos } from './gateway';
import { createAdapterRegistry } from './adapters';
import { WebChatAdapter } from './adapters/webchat';
import { createDbRepos, ensureWebchatConnection } from './repos-db';
import type { OutboundMessageRequest } from './types';

type Db = typeof defaultDb;

/** Bridge gateway domain events onto the existing realtime streams. */
function createRealtimeSink(): EventSink {
  return {
    emit(type, payload) {
      const clientId = payload.clientId as number | undefined;
      const nested = payload.conversation as { id?: unknown } | undefined;
      const nestedId = typeof nested?.id === 'number' ? nested.id : undefined;
      const conversationId = (payload.conversationId as number | undefined) ?? nestedId;
      if (typeof clientId !== 'number' || typeof conversationId !== 'number') return;
      if (type === 'conversation.created') {
        publishConversationUpdate(clientId, { conversationId, status: 'open' }).catch(() => {});
      }
    },
  };
}

/**
 * Delivery for WebChat outbound sends: persist the agent message, bump the
 * conversation timestamps, and push it down the realtime stream the widget
 * is already subscribed to. Returns a stable provider id (`wc:<rowId>`).
 */
async function deliverWebchatMessage(
  request: OutboundMessageRequest,
  db: Db = defaultDb,
): Promise<{ externalMessageId: string }> {
  const conversationId = request.conversationId;
  if (conversationId == null) {
    throw new Error('webchat send requires conversationId');
  }
  const now = new Date();
  const text = (request.text ?? '').trim();
  if (!text) throw new Error('webchat send requires text');
  const clientId = await connectionClientId(request.connectionId, db);
  if (clientId == null) throw new Error('webchat send: connection not found');
  const persisted = await db.transaction(async (tx) => createDbRepos(tx).persistMessage({
    conversationId,
    clientId,
    channel: 'webchat',
    provider: 'webchat',
    connectionId: request.connectionId,
    direction: 'outbound',
    externalMessageId: request.idempotencyKey ? `outbound:${request.idempotencyKey}` : null,
    authorKind: 'agent',
    body: text,
    messageType: request.messageType,
    media: request.media,
    senderIdentity: request.senderIdentity ?? null,
    recipientIdentity: request.recipientIdentity ?? null,
    receivedAt: null,
  }));
  // Stamp the provider id so outbound rows stay traceable end to end.
  const externalMessageId = `wc:${persisted.id}`;
  const [conversation] = await db
    .select()
    .from(chatConversations)
    .where(and(eq(chatConversations.id, conversationId), eq(chatConversations.clientId, clientId)))
    .limit(1);
  if (!conversation) throw new Error('webchat send: conversation not found');
  await publishMessage(conversation.id, conversation.clientId, {
    id: persisted.id,
    conversationId: conversation.id,
    authorKind: 'agent',
    authorName: 'Assistant',
    body: text,
    occurredAt: now,
  }).catch(() => {});
  return { externalMessageId };
}

async function connectionClientId(connectionId: number, db: Db): Promise<number | null> {
  const repos = createDbRepos(db);
  const connection = await repos.findConnectionById(connectionId);
  return connection?.clientId ?? null;
}

export interface WebchatGateway {
  gateway: ChannelGateway;
  repos: GatewayRepos;
  ensureConnection: (clientId: number, widgetId: number | null) => Promise<{ id: number; clientId: number }>;
}

/** Ready-to-use gateway for the WebChat channel (server-only: touches db). */
export function createWebchatGateway(db: Db = defaultDb): WebchatGateway {
  const repos = createDbRepos(db);
  const gateway = new ChannelGateway({
    adapters: createAdapterRegistry([new WebChatAdapter((request) => deliverWebchatMessage(request, db))]),
    repos,
    events: createRealtimeSink(),
  });
  return {
    gateway,
    repos,
    ensureConnection: (clientId, widgetId) => ensureWebchatConnection(clientId, widgetId, db),
  };
}
