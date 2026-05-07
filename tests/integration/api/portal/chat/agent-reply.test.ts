/**
 * POST /api/portal/chat/conversations/[id]/messages — agent replies.
 *
 *   - Agent reply inserts an `authorKind = 'agent'` row + auto-claims the
 *     conversation when first agent reply lands.
 *   - Cross-tenant agent gets 404.
 *   - Tenancy: messages are siloed by clientId — agent A cannot read B's row.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/chat/realtime', () => ({
  publishMessage: vi.fn().mockResolvedValue(undefined),
  publishConversationUpdate: vi.fn().mockResolvedValue(undefined),
  conversationChannel: (id: number) => `chat_conv_${id}`,
  inboxChannel: (id: number) => `chat_inbox_${id}`,
  subscribeChannel: () => ({ ready: Promise.resolve(), unsubscribe: async () => {} }),
}));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../../helpers/test-db';

async function seedSiteWidgetConversation(
  ctx: TenantCtx,
  label: string,
): Promise<{ widgetId: number; conversationId: number }> {
  const sql = getTestSql();
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  const [site] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_websites (client_id, name, domain)
    VALUES (${ctx.client.id}, ${`${label}-site-${stamp}`}, ${`${label}-${stamp}.test`})
    RETURNING id
  `;
  const [widget] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.chat_widgets (
      client_id, site_id, enabled, position, primary_color, brain_enabled
    ) VALUES (
      ${ctx.client.id}, ${site.id}, true, 'bottom-right', '#0070f3', false
    )
    RETURNING id
  `;
  const [conv] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.chat_conversations (
      widget_id, client_id, visitor_id, status, last_message_at
    ) VALUES (
      ${widget.id}, ${ctx.client.id}, ${`v-${stamp}`}, 'open', NOW()
    )
    RETURNING id
  `;
  return { widgetId: widget.id, conversationId: conv.id };
}

describe('POST /api/portal/chat/conversations/[id]/messages @chat @portal', () => {
  beforeEach(() => { mockedAuth.mockReset(); });

  it('401 unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/chat/conversations/[id]/messages/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: '1' }, body: { body: 'hi' } },
    );
    expect(res.status).toBe(401);
  });

  it('inserts agent message + auto-claims an open conversation on first agent reply', async () => {
    const A = await sessionForNewClientUser('agent-reply');
    const { conversationId } = await seedSiteWidgetConversation(A, 'reply');

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/chat/conversations/[id]/messages/route');
    const res = await callHandler<{
      success: boolean;
      data: { id: number; authorKind: string; authorUserId: number | null; body: string };
    }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(conversationId) }, body: { body: 'Hey there, agent here.' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data.authorKind).toBe('agent');
    expect(res.data?.data.authorUserId).toBe(A.user.id);
    expect(res.data?.data.body).toBe('Hey there, agent here.');

    const sql = getTestSql();
    const [msg] = await sql<{
      author_kind: string; client_id: number; conversation_id: number;
    }[]>`
      SELECT author_kind, client_id, conversation_id
      FROM ${sql(TEST_SCHEMA)}.chat_messages WHERE id = ${res.data!.data.id}
    `;
    expect(msg.author_kind).toBe('agent');
    expect(msg.client_id).toBe(A.client.id);
    expect(msg.conversation_id).toBe(conversationId);

    // Conversation must auto-claim on first agent reply.
    const [conv] = await sql<{ status: string; assigned_user_id: number | null }[]>`
      SELECT status, assigned_user_id
      FROM ${sql(TEST_SCHEMA)}.chat_conversations WHERE id = ${conversationId}
    `;
    expect(conv.status).toBe('assigned');
    expect(conv.assigned_user_id).toBe(A.user.id);
  });

  it('400 on empty body', async () => {
    const A = await sessionForNewClientUser('agent-empty');
    const { conversationId } = await seedSiteWidgetConversation(A, 'empty');

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/chat/conversations/[id]/messages/route');
    const res = await callHandler<{ message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(conversationId) }, body: { body: '   ' } },
    );
    expect(res.status).toBe(400);
  });

  it('409 when the conversation is already closed', async () => {
    const A = await sessionForNewClientUser('agent-closed');
    const { conversationId } = await seedSiteWidgetConversation(A, 'closed');
    const sql = getTestSql();
    await sql`
      UPDATE ${sql(TEST_SCHEMA)}.chat_conversations
      SET status = 'closed', closed_at = NOW()
      WHERE id = ${conversationId}
    `;

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/chat/conversations/[id]/messages/route');
    const res = await callHandler<{ message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(conversationId) }, body: { body: 'late reply' } },
    );
    expect(res.status).toBe(409);
    expect(res.data?.message).toMatch(/closed/i);
  });
});

describe('POST /api/portal/chat/conversations/[id]/messages — tenancy @chat @portal @tenancy', () => {
  beforeEach(() => { mockedAuth.mockReset(); });

  it('cross-tenant agent gets 404 and never inserts a message', async () => {
    const A = await sessionForNewClientUser('cross-a');
    const B = await sessionForNewClientUser('cross-b');
    const { conversationId: convB } = await seedSiteWidgetConversation(B, 'cross-b');

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/chat/conversations/[id]/messages/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(convB) }, body: { body: 'hijack attempt' } },
    );
    expect(res.status).toBe(404);

    // Belt-and-suspenders: confirm no agent row landed against B's conversation.
    const sql = getTestSql();
    const rows = await sql<{ count: string }[]>`
      SELECT COUNT(*)::text AS count
      FROM ${sql(TEST_SCHEMA)}.chat_messages
      WHERE conversation_id = ${convB} AND author_kind = 'agent'
    `;
    expect(Number.parseInt(rows[0].count, 10)).toBe(0);
  });

  it('GET /conversations/[id] message history is siloed per client', async () => {
    const A = await sessionForNewClientUser('silo-a');
    const B = await sessionForNewClientUser('silo-b');
    const a = await seedSiteWidgetConversation(A, 'silo-a');
    const b = await seedSiteWidgetConversation(B, 'silo-b');

    // Seed messages in BOTH conversations.
    const sql = getTestSql();
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.chat_messages
        (conversation_id, client_id, author_kind, author_name, body)
      VALUES
        (${a.conversationId}, ${A.client.id}, 'visitor', 'A-visitor', 'A-msg'),
        (${b.conversationId}, ${B.client.id}, 'visitor', 'B-visitor', 'B-msg')
    `;

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/chat/conversations/[id]/route');

    // A reads A's conversation: sees its own message.
    const ownRes = await callHandler<{
      success: boolean;
      data: { messages: { body: string; clientId: number }[] };
    }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(a.conversationId) } },
    );
    expect(ownRes.status).toBe(200);
    const bodies = ownRes.data?.data.messages.map(m => m.body) ?? [];
    expect(bodies).toContain('A-msg');
    expect(bodies).not.toContain('B-msg');

    // A reads B's conversation: 404.
    const foreignRes = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(b.conversationId) } },
    );
    expect(foreignRes.status).toBe(404);
  });
});
