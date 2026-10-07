import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { chatConversations, chatMessages } from '@/lib/db/schema';
import { ChannelGateway } from './gateway';
import { createDbRepos, ensureWebchatConnection, webchatExternalId } from './repos-db';

// No events or provider calls inside this transaction. A failed linking/update
// rolls the insert back; callers can retry with the same stable visitor key.
export async function persistWebchatInbound(input: {
  conversationId: number; clientId: number; widgetId: number | null;
  visitorIdentity: { kind: 'webchat'; value: string }; text: string; messageKey: string;
}) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${input.clientId}:${input.visitorIdentity.value}`}, 0))`);
    const [conversation] = await tx.select().from(chatConversations).where(and(
      eq(chatConversations.id, input.conversationId), eq(chatConversations.clientId, input.clientId),
    )).for('update').limit(1);
    if (!conversation || conversation.status === 'closed') throw new Error('Conversation is unavailable');
    const connection = await ensureWebchatConnection(input.clientId, input.widgetId, tx);
    const repos = createDbRepos(tx);
    const result = await new ChannelGateway({ repos, adapters: { get: () => null } }).processInbound({
      channel: 'webchat', provider: 'webchat', connectionId: connection.id,
      externalConversationId: webchatExternalId(input.conversationId), externalMessageId: input.messageKey,
      direction: 'inbound', senderIdentity: input.visitorIdentity, messageType: 'text', text: input.text,
    });
    if (result.status === 'error') throw new Error('Message persistence failed');
    const [message] = await tx.select().from(chatMessages).where(and(
      eq(chatMessages.connectionId, connection.id), eq(chatMessages.externalMessageId, input.messageKey),
      eq(chatMessages.conversationId, input.conversationId), eq(chatMessages.clientId, input.clientId),
    )).limit(1);
    if (!message || message.body !== input.text) throw new Error('Message key reused with different content');
    const contact = result.contact ?? await repos.findContactByIdentity(input.clientId, input.visitorIdentity);
    return { message, connectionId: connection.id, contactId: contact?.id ?? null, duplicate: result.status === 'duplicate' };
  });
}
