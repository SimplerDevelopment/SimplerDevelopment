// Drizzle-backed GatewayRepos — the production implementation of the
// ChannelGateway repository seam (lib/channels/gateway.ts).
//
// Callers authenticate the connection before entering the gateway.
// Repository message and conversation lookups enforce that tenant.

import { and, eq } from 'drizzle-orm';
import type { RepoDb } from './repos-types';
import { createContactsRepos } from './repos-contacts';
import { createConversationsRepos } from './repos-conversations';
import { createMessagesRepos } from './repos-messages';
import { createOutboxRepos } from './repos-outbox';

import { db as defaultDb } from '@/lib/db';
import { channelConnections } from '@/lib/db/schema';
import type { ChannelConnectionRef } from './types';
import type { GatewayRepos } from './gateway';

/** WebChat conversations are addressed as `webchat:<chat_conversations.id>`. */
export function webchatExternalId(conversationId: number): string {
  return `webchat:${conversationId}`;
}

/**
 * Find-or-create the channel_connections row for a WebChat widget. WebChat
 * has no provider account — one connection per (client, widget) keeps the
 * gateway's "tenant derives from connection" invariant intact.
 */
export async function ensureWebchatConnection(
  clientId: number,
  widgetId: number | null,
  db: RepoDb = defaultDb,
): Promise<ChannelConnectionRef> {
  const externalAccountId = `widget:${widgetId ?? 'none'}`;
  const findConnection = async () => {
    const [connection] = await db.select().from(channelConnections).where(and(
      eq(channelConnections.clientId, clientId),
      eq(channelConnections.provider, 'webchat'),
      eq(channelConnections.externalAccountId, externalAccountId),
    )).limit(1);
    return connection;
  };
  const existing = await findConnection();
  if (existing) return toConnectionRef(existing);
  const [created] = await db
    .insert(channelConnections)
    .values({
      clientId,
      provider: 'webchat',
      externalAccountId,
      status: 'connected',
    })
    .onConflictDoNothing({
      target: [
        channelConnections.clientId,
        channelConnections.provider,
        channelConnections.externalAccountId,
      ],
    })
    .returning();
  if (created) return toConnectionRef(created);
  const raced = await findConnection();
  if (!raced) throw new Error('ensureWebchatConnection: connection missing after upsert');
  return toConnectionRef(raced);
}

function toConnectionRef(row: typeof channelConnections.$inferSelect): ChannelConnectionRef {
  return {
    id: row.id,
    clientId: row.clientId,
    provider: row.provider as ChannelConnectionRef['provider'],
    externalAccountId: row.externalAccountId,
    status: row.status,
    credentials: {},
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  };
}


export function createDbRepos(db: RepoDb = defaultDb): GatewayRepos {
 const findConnectionById: GatewayRepos['findConnectionById'] = async (id) => {
   const [row] = await db.select().from(channelConnections).where(eq(channelConnections.id, id)).limit(1);
   return row ? toConnectionRef(row) : null;
 };
 return { findConnectionById, ...createContactsRepos(db), ...createConversationsRepos(db, findConnectionById), ...createMessagesRepos(db), ...createOutboxRepos(db) };
}
