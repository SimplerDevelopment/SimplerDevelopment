import { beforeEach, describe, expect, it, vi } from 'vitest';

// Only the realtime transport is replaced: every repository, transaction and
// adapter persistence operation below uses the isolated PostgreSQL fixture.
vi.mock('@/lib/chat/realtime', () => ({
  publishMessage: vi.fn().mockResolvedValue(undefined),
  publishConversationUpdate: vi.fn().mockResolvedValue(undefined),
}));
import { db } from '@/lib/db';
import { channelConnections, channelOutbox, chatConversations, chatMessages, contactIdentities, crmContacts } from '@/lib/db/schema';
import { persistWebchatInbound } from '@/lib/channels/webchat-inbound';
import { createWebchatGateway } from '@/lib/channels/webchat-flow';
import type { OutboundMessageRequest } from '@/lib/channels/types';
import { publishMessage } from '@/lib/chat/realtime';
import { eq } from 'drizzle-orm';
import { twoTenants, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

describe('Webchat transactional recovery and message keys @tenancy @channels', () => {
  let tenant: TenantCtx;
  let foreign: TenantCtx;
  let conversationId: number;
  let foreignConversationId: number;

  beforeEach(async () => {
    ({ A: tenant, B: foreign } = await twoTenants());
    const conversations = await db.insert(chatConversations).values([
      { clientId: tenant.client.id, visitorId: 'visitor-a', status: 'open' },
      { clientId: foreign.client.id, visitorId: 'visitor-b', status: 'open' },
    ]).returning();
    conversationId = conversations[0].id;
    foreignConversationId = conversations[1].id;
    vi.mocked(publishMessage).mockClear();
  });

  function inbound(messageKey = 'visitor-stable-key', text = 'Hello') {
    return { conversationId, clientId: tenant.client.id, widgetId: null,
      visitorIdentity: { kind: 'webchat' as const, value: 'visitor-a' }, text, messageKey };
  }

  async function outbound() {
    const circuit = createWebchatGateway();
    const connection = await circuit.ensureConnection(tenant.client.id, null);
    const request: OutboundMessageRequest = {
      channel: 'webchat', provider: 'webchat', connectionId: connection.id, conversationId,
      recipientIdentity: { kind: 'webchat', value: 'visitor-a' }, messageType: 'text',
      text: 'Agent reply', idempotencyKey: 'outbound-stable-key',
    };
    return { ...circuit, request };
  }

  it('rolls back the message, contact, identity and connection if linking fails; the same key can recover', async () => {
    const sql = getTestSql();
    await sql`ALTER TABLE ${sql(TEST_SCHEMA)}.chat_conversations ADD CONSTRAINT test_channel_link_failure CHECK (contact_id IS NULL)`;
    try {
      await expect(persistWebchatInbound(inbound())).rejects.toThrow();
      expect(await db.select().from(chatMessages)).toHaveLength(0);
      expect(await db.select().from(crmContacts)).toHaveLength(0);
      expect(await db.select().from(contactIdentities)).toHaveLength(0);
      expect(await db.select().from(channelConnections)).toHaveLength(0);
    } finally {
      await sql`ALTER TABLE ${sql(TEST_SCHEMA)}.chat_conversations DROP CONSTRAINT test_channel_link_failure`;
    }
    const recovered = await persistWebchatInbound(inbound());
    expect(recovered.duplicate).toBe(false);
    expect(recovered.contactId).toBeTypeOf('number');
    const [conversation] = await db.select().from(chatConversations).where(eq(chatConversations.id, conversationId));
    expect(conversation.contactId).toBe(recovered.contactId);
    expect(conversation.connectionId).toBe(recovered.connectionId);
    expect(await db.select().from(chatMessages)).toHaveLength(1);
  });

  it('concurrent and lost-response retries persist one inbound message and one contact', async () => {
    const results = await Promise.all([persistWebchatInbound(inbound()), persistWebchatInbound(inbound())]);
    expect(results.map(result => result.duplicate).sort()).toEqual([false, true]);
    expect(results[0].message.id).toBe(results[1].message.id);
    const replay = await persistWebchatInbound(inbound());
    expect(replay.duplicate).toBe(true);
    expect(replay.message.id).toBe(results[0].message.id);
    for (const table of [chatMessages, crmContacts, contactIdentities, channelConnections]) {
      expect(await db.select().from(table)).toHaveLength(1);
    }
  });

  it('rejects an inbound key reused for different text or a different conversation', async () => {
    await persistWebchatInbound(inbound());
    await expect(persistWebchatInbound(inbound('visitor-stable-key', 'Changed'))).rejects.toThrow('different content');
    const [other] = await db.insert(chatConversations).values({ clientId: tenant.client.id, visitorId: 'other' }).returning();
    await expect(persistWebchatInbound({ ...inbound(), conversationId: other.id })).rejects.toThrow('different content');
    const messages = await db.select().from(chatMessages);
    expect(messages).toHaveLength(1);
    expect(messages[0].body).toBe('Hello');
    expect(messages[0].conversationId).toBe(conversationId);
  });

  it('rejects foreign and closed inbound conversations before writing any messages or contacts', async () => {
    await expect(persistWebchatInbound({ ...inbound(), conversationId: foreignConversationId })).rejects.toThrow('unavailable');
    await db.update(chatConversations).set({ status: 'closed' }).where(eq(chatConversations.id, conversationId));
    await expect(persistWebchatInbound(inbound())).rejects.toThrow('unavailable');
    expect(await db.select().from(chatMessages)).toHaveLength(0);
    expect(await db.select().from(crmContacts)).toHaveLength(0);
  });

  it('concurrent outbound sends and response retries share one outbox row and persisted delivery', async () => {
    const { gateway, request } = await outbound();
    const results = await Promise.all([gateway.send(request), gateway.send(request)]);
    expect(results.some(result => result.status === 'sent')).toBe(true);
    expect(results.every(result => ['sent', 'queued'].includes(result.status))).toBe(true);
    const replay = await gateway.send(request);
    expect(replay.status).toBe('sent');
    const outbox = await db.select().from(channelOutbox);
    const messages = await db.select().from(chatMessages);
    expect(outbox).toHaveLength(1);
    expect(messages).toHaveLength(1);
    expect(replay.externalMessageId).toBe(`wc:${messages[0].id}`);
    expect(outbox[0].externalMessageId).toBe(replay.externalMessageId);
    expect(publishMessage).toHaveBeenCalledTimes(1);
  });

  it('foreign outbound conversations and contacts never create an outbox row or deliver a message', async () => {
    const { gateway, request } = await outbound();
    const [contact] = await db.insert(crmContacts).values({ clientId: foreign.client.id, firstName: 'Foreign' }).returning();
    expect((await gateway.send({ ...request, conversationId: foreignConversationId })).status).toBe('error');
    expect((await gateway.send({ ...request, contactId: contact.id })).status).toBe('error');
    expect(await db.select().from(channelOutbox)).toHaveLength(0);
    expect(await db.select().from(chatMessages)).toHaveLength(0);
    expect(publishMessage).not.toHaveBeenCalled();
  });

  it('binds an outbound idempotency key to recipient, contact, message type and media', async () => {
    const { gateway, request } = await outbound();
    expect((await gateway.send(request)).status).toBe('sent');
    const [contact] = await db.insert(crmContacts).values({ clientId: tenant.client.id, firstName: 'Local' }).returning();
    const changed: Partial<OutboundMessageRequest>[] = [
      { recipientIdentity: { kind: 'webchat', value: 'different-visitor' } },
      { contactId: contact.id },
      { messageType: 'image' },
      { media: [{ type: 'image', url: 'https://fixture.test/image.png' }] },
    ];
    for (const context of changed) {
      expect((await gateway.send({ ...request, ...context })).status).toBe('error');
    }
    expect(await db.select().from(channelOutbox)).toHaveLength(1);
    expect(await db.select().from(chatMessages)).toHaveLength(1);
    expect(publishMessage).toHaveBeenCalledTimes(1);
  });

  it('rejects provider/channel mismatches against the selected connection before creating an outbox row', async () => {
    const { gateway, request } = await outbound();
    expect((await gateway.send({ ...request, provider: 'resend', channel: 'email' })).status).toBe('error');
    expect(await db.select().from(channelOutbox)).toHaveLength(0);
    expect(await db.select().from(chatMessages)).toHaveLength(0);
  });
});
