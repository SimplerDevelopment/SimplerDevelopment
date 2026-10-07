import { and, desc, eq, inArray, lt, or } from 'drizzle-orm';
import { isDeepStrictEqual } from 'node:util';
import type { GatewayRepos } from './gateway';
import type { RepoDb } from './repos-types';
import { channelConsent, channelOutbox, chatConversations, crmContacts } from '@/lib/db/schema';

async function getConsent(db: RepoDb, ...args: Parameters<GatewayRepos['getConsent']>): ReturnType<GatewayRepos['getConsent']> {
  const [contactId, channel] = args;

  const [row] = await db
    .select({ status: channelConsent.status })
    .from(channelConsent)
    .where(and(eq(channelConsent.contactId, contactId), eq(channelConsent.channel, channel)))
    .orderBy(desc(channelConsent.recordedAt))
    .limit(1);
  if (!row) return { status: null };
  return { status: row.status === 'opt_out' ? 'opt_out' : 'opt_in' };

}

type OutboxInput = Parameters<GatewayRepos['enqueueOutbox']>[0];

async function requireOutgoingOwnership(db: RepoDb, input: OutboxInput) {
  if (input.conversationId != null) {
    const [conversation] = await db.select({ id: chatConversations.id }).from(chatConversations)
      .where(and(eq(chatConversations.id, input.conversationId), eq(chatConversations.clientId, input.clientId))).limit(1);
    if (!conversation) throw new Error('Outbound conversation does not belong to connection tenant');
  }
  if (input.contactId != null) {
    const [contact] = await db.select({ id: crmContacts.id }).from(crmContacts)
      .where(and(eq(crmContacts.id, input.contactId), eq(crmContacts.clientId, input.clientId))).limit(1);
    if (!contact) throw new Error('Outbound contact does not belong to connection tenant');
  }
}

function outgoingValues(input: OutboxInput): typeof channelOutbox.$inferInsert {
  return {
    clientId: input.clientId, connectionId: input.connectionId,
    conversationId: input.conversationId, contactId: input.contactId,
    channel: input.channel, provider: input.provider,
    recipientIdentity: { ...input.recipientIdentity },
    messageType: input.messageType, body: input.body,
    media: input.media ? [...input.media] : null,
    idempotencyKey: input.idempotencyKey ?? null,
    status: 'processing', attempts: 1, nextAttemptAt: new Date(Date.now() + 60_000),
  };
}

async function enqueueOutbox(db: RepoDb, ...args: Parameters<GatewayRepos['enqueueOutbox']>): ReturnType<GatewayRepos['enqueueOutbox']> {
  const [input] = args;
  await requireOutgoingOwnership(db, input);
  const [row] = await db
    .insert(channelOutbox)
    .values(outgoingValues(input))
    .onConflictDoNothing({ target: [channelOutbox.connectionId, channelOutbox.idempotencyKey] })
    .returning();
  if (row) return { id: row.id, externalMessageId: '', claimed: true };
  return retryOutgoing(db, input);
}

async function retryOutgoing(db: RepoDb, input: OutboxInput): ReturnType<GatewayRepos['enqueueOutbox']> {
  if (!input.idempotencyKey) throw new Error('Outbox insertion returned no row');
  const [existing] = await db.select().from(channelOutbox).where(and(
    eq(channelOutbox.connectionId, input.connectionId), eq(channelOutbox.idempotencyKey, input.idempotencyKey),
    eq(channelOutbox.clientId, input.clientId),
  )).limit(1);
  if (!existing) throw new Error('Outbox key not found');
  if (!sameOutgoingMessage(existing, input)) {
    throw new Error('Outbox key reused with a different message');
  }
  if (existing.status === 'sent') return { id: existing.id, externalMessageId: existing.externalMessageId ?? '', status: 'sent' };
  const [claimed] = await db.update(channelOutbox).set({ status: 'processing', nextAttemptAt: new Date(Date.now() + 60_000) })
    .where(and(eq(channelOutbox.id, existing.id), or(
      inArray(channelOutbox.status, ['failed', 'queued', 'retrying']),
      and(eq(channelOutbox.status, 'processing'), lt(channelOutbox.nextAttemptAt, new Date())),
    ))).returning({ id: channelOutbox.id });
  return { id: existing.id, externalMessageId: existing.externalMessageId ?? '', claimed: Boolean(claimed) };

}

function sameOutgoingMessage(existing: typeof channelOutbox.$inferSelect, input: Parameters<GatewayRepos['enqueueOutbox']>[0]) {
  const canonical = (row: typeof existing | typeof input) => ({
    conversationId: row.conversationId ?? null, contactId: row.contactId ?? null,
    provider: row.provider, channel: row.channel, messageType: row.messageType,
    recipientIdentity: row.recipientIdentity, body: row.body ?? null, media: row.media ?? null,
  });
  return isDeepStrictEqual(canonical(existing), canonical(input));
}

async function markSent(db: RepoDb, ...args: Parameters<GatewayRepos['markSent']>): ReturnType<GatewayRepos['markSent']> {
  const [input] = args;

  await db
    .update(channelOutbox)
    .set({ status: 'sent', externalMessageId: input.externalMessageId, sentAt: input.sentAt })
    .where(eq(channelOutbox.id, input.id));

}

async function markFailed(db: RepoDb, ...args: Parameters<GatewayRepos['markFailed']>): ReturnType<GatewayRepos['markFailed']> {
  const [input] = args;

  await db
    .update(channelOutbox)
    .set({ status: 'failed', lastError: input.error, lastErrorCode: input.errorCode, failedAt: new Date() })
    .where(eq(channelOutbox.id, input.id));

}

export function createOutboxRepos(db: RepoDb): Pick<GatewayRepos, 'getConsent' | 'enqueueOutbox' | 'markSent' | 'markFailed'> {
  return {
    getConsent: (...args) => getConsent(db, ...args),
    enqueueOutbox: (...args) => enqueueOutbox(db, ...args),
    markSent: (...args) => markSent(db, ...args),
    markFailed: (...args) => markFailed(db, ...args),
  };
}
