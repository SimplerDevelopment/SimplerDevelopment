import { and, desc, eq, inArray } from 'drizzle-orm';
import type { GatewayRepos } from './gateway';
import type { RepoDb } from './repos-types';
import { chatConversations } from '@/lib/db/schema';
import { toConversationRef, parseWebchatExternalId } from './repos-types';

async function findConversationByExternal(db: RepoDb, findConnectionById: GatewayRepos['findConnectionById'], ...args: Parameters<GatewayRepos['findConversationByExternal']>): ReturnType<GatewayRepos['findConversationByExternal']> {
  const [connectionId, externalConversationId] = args;

  const connection = await findConnectionById(connectionId);
  if (!connection) return null;
  const webchatId = parseWebchatExternalId(externalConversationId);
  if (webchatId == null) return null;
  const [row] = await db
    .select()
    .from(chatConversations)
    .where(
      and(
        eq(chatConversations.id, webchatId),
        eq(chatConversations.clientId, connection.clientId),
      ),
    )
    .limit(1);
  return row ? toConversationRef(row) : null;

}

async function findOpenConversationByContact(db: RepoDb, ...args: Parameters<GatewayRepos['findOpenConversationByContact']>): ReturnType<GatewayRepos['findOpenConversationByContact']> {
  const [clientId, contactId, channel] = args;

  const [row] = await db
    .select()
    .from(chatConversations)
    .where(
      and(
        eq(chatConversations.clientId, clientId),
        eq(chatConversations.contactId, contactId),
        eq(chatConversations.channel, channel),
        inArray(chatConversations.status, ['open', 'assigned']),
      ),
    )
    .orderBy(desc(chatConversations.lastMessageAt))
    .limit(1);
  if (!row || row.status === 'closed') return null;
  return toConversationRef(row);

}

async function createConversation(db: RepoDb, ...args: Parameters<GatewayRepos['createConversation']>): ReturnType<GatewayRepos['createConversation']> {
  const [input] = args;

  const [created] = await db
    .insert(chatConversations)
    .values({
      clientId: input.clientId,
      channel: input.channel,
      provider: input.provider,
      connectionId: input.connectionId,
      contactId: input.contactId,
      externalConversationId: input.externalConversationId,
      status: 'open',
      aiMode: 'human',
    })
    .returning();
  return toConversationRef(created);

}

export function createConversationsRepos(db: RepoDb, findConnectionById: GatewayRepos['findConnectionById']): Pick<GatewayRepos, 'findConversationByExternal' | 'findOpenConversationByContact' | 'createConversation'> {
  return {
    findConversationByExternal: (...args) => findConversationByExternal(db, findConnectionById, ...args),
    findOpenConversationByContact: (...args) => findOpenConversationByContact(db, ...args),
    createConversation: (...args) => createConversation(db, ...args),
  };
}
