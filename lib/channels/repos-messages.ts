import { and, eq } from 'drizzle-orm';
import type { GatewayRepos } from './gateway';
import type { RepoDb } from './repos-types';
import { chatMessages, chatConversations } from '@/lib/db/schema';

async function messageExists(db: RepoDb, ...args: Parameters<GatewayRepos['messageExists']>): ReturnType<GatewayRepos['messageExists']> {
  const [connectionId, externalMessageId] = args;

  const [row] = await db
    .select({ id: chatMessages.id })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.connectionId, connectionId),
        eq(chatMessages.externalMessageId, externalMessageId),
      ),
    )
    .limit(1);
  return !!row;

}

type MessageInput = Parameters<GatewayRepos['persistMessage']>[0];

async function requireOwnedConversation(db: RepoDb, input: MessageInput) {
  const [owned] = await db.select({ id: chatConversations.id }).from(chatConversations)
    .where(and(eq(chatConversations.id, input.conversationId), eq(chatConversations.clientId, input.clientId))).limit(1);
  if (!owned) throw new Error('Message conversation does not belong to tenant');
}

function messageValues(input: MessageInput, now: Date): typeof chatMessages.$inferInsert {
  return {
    conversationId: input.conversationId, clientId: input.clientId,
    channel: input.channel, provider: input.provider, connectionId: input.connectionId,
    direction: input.direction, externalMessageId: input.externalMessageId,
    authorKind: input.authorKind, body: input.body, messageType: input.messageType,
    media: input.media ? [...input.media] : null,
    senderIdentity: input.senderIdentity ? { ...input.senderIdentity } : null,
    recipientIdentity: input.recipientIdentity ? { ...input.recipientIdentity } : null,
    occurredAt: now,
    receivedAt: input.direction === 'inbound' ? (input.receivedAt ?? now) : null,
    sentAt: input.direction === 'outbound' ? now : null,
  };
}

async function existingMessage(db: RepoDb, input: MessageInput) {
  if (!input.connectionId || !input.externalMessageId) throw new Error('Message was not stored');
  const [existing] = await db.select().from(chatMessages).where(and(
    eq(chatMessages.connectionId, input.connectionId), eq(chatMessages.externalMessageId, input.externalMessageId),
    eq(chatMessages.conversationId, input.conversationId), eq(chatMessages.clientId, input.clientId),
  )).limit(1);
  if (existing && existing.body === input.body) return existing;
  throw new Error('Message key reused with a different message');
}

async function persistMessage(db: RepoDb, ...args: Parameters<GatewayRepos['persistMessage']>): ReturnType<GatewayRepos['persistMessage']> {
  const [input] = args;
  const now = new Date();
  await requireOwnedConversation(db, input);
  const [inserted] = await db
    .insert(chatMessages)
    .values(messageValues(input, now))
    .onConflictDoNothing({ target: [chatMessages.connectionId, chatMessages.externalMessageId] })
    .returning();
  if (!inserted) return existingMessage(db, input);
  await db
    .update(chatConversations)
    .set({
      lastMessageAt: now,
      updatedAt: now,
      ...(input.direction === 'inbound'
        ? { lastInboundAt: now }
        : { lastOutboundAt: now }),
    })
    .where(eq(chatConversations.id, input.conversationId));
  await linkMessageConversation(db, input, now);
  return {
    id: inserted.id,
    conversationId: inserted.conversationId,
    externalMessageId: inserted.externalMessageId,
  };

}

export function createMessagesRepos(db: RepoDb): Pick<GatewayRepos, 'messageExists' | 'persistMessage'> {
  return {
    messageExists: (...args) => messageExists(db, ...args),
    persistMessage: (...args) => persistMessage(db, ...args),
  };
}

async function linkMessageConversation(db: RepoDb, input: Parameters<GatewayRepos['persistMessage']>[0], now: Date) {
  // Stamp the resolved contact/connection onto conversations that
  // predate the omnichannel model (e.g. widget rows created before the
  // first gateway pass) — fill nulls only, never overwrite.
  if (input.contactId == null && input.connectionId == null) return;
  const [conv] = await db
    .select({
      contactId: chatConversations.contactId,
      connectionId: chatConversations.connectionId,
    })
    .from(chatConversations)
    .where(eq(chatConversations.id, input.conversationId))
    .limit(1);
  if (conv) {
    const patch = missingConversationLinks(conv, input);
    if (!Object.keys(patch).length) return;
    await db
      .update(chatConversations)
      .set({
        ...patch,
        updatedAt: now,
      })
      .where(eq(chatConversations.id, input.conversationId));
  }
}

function missingConversationLinks(conv: { contactId: number | null; connectionId: number | null }, input: MessageInput) {
  const patch: { contactId?: number; connectionId?: number } = {};
  if (conv.contactId == null && input.contactId != null) patch.contactId = input.contactId;
  if (conv.connectionId == null && input.connectionId != null) patch.connectionId = input.connectionId;
  return patch;
}
