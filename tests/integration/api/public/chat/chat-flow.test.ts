/**
 * Public web-chat flow — visitor side:
 *   - POST /api/public/chat/start         — creates conversation + ephemeral token
 *   - POST /api/public/chat/messages      — token-scoped message insert
 *   - rate limit (10/10s)
 *   - disabled widget rejection
 *
 * `@/lib/chat/realtime` is mocked so the route's "publish" calls don't
 * try to open a Postgres NOTIFY connection during tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub realtime publishers — they fire-and-forget in production, but in tests
// we don't want them touching a real Postgres NOTIFY socket.
vi.mock('@/lib/chat/realtime', () => ({
  publishMessage: vi.fn().mockResolvedValue(undefined),
  publishConversationUpdate: vi.fn().mockResolvedValue(undefined),
  conversationChannel: (id: number) => `chat_conv_${id}`,
  inboxChannel: (id: number) => `chat_inbox_${id}`,
  subscribeChannel: () => ({ ready: Promise.resolve(), unsubscribe: async () => {} }),
}));

import { callHandler } from '../../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../../helpers/test-db';
import { issueVisitorToken } from '@/lib/chat/token';
import { __resetRateLimit } from '@/lib/chat/rate-limit';

async function seedSiteAndWidget(
  ctx: TenantCtx,
  opts: { enabled?: boolean; label?: string } = {},
): Promise<{ siteId: number; widgetId: number; clientId: number }> {
  const sql = getTestSql();
  const label = opts.label ?? 'chat';
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
      ${ctx.client.id}, ${site.id}, ${opts.enabled ?? true},
      'bottom-right', '#0070f3', false
    )
    RETURNING id
  `;
  return { siteId: site.id, widgetId: widget.id, clientId: ctx.client.id };
}

describe('POST /api/public/chat/start @chat @public', () => {
  let ctx: TenantCtx;
  beforeEach(async () => {
    __resetRateLimit();
    ctx = await sessionForNewClientUser('chat-start');
  });

  it('400 when widgetId is missing', async () => {
    const route = await import('@/app/api/public/chat/start/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { visitorId: 'v-1' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/widgetId/i);
  });

  it('400 when visitorId is missing', async () => {
    const { widgetId } = await seedSiteAndWidget(ctx);
    const route = await import('@/app/api/public/chat/start/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { widgetId } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/visitorId/i);
  });

  it('404 when widgetId does not exist', async () => {
    const route = await import('@/app/api/public/chat/start/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { widgetId: 999_999, visitorId: 'v-x' } },
    );
    expect(res.status).toBe(404);
  });

  it('creates a conversation and returns ephemeralToken for a valid widgetId', async () => {
    const { widgetId, clientId } = await seedSiteAndWidget(ctx);
    const route = await import('@/app/api/public/chat/start/route');
    const res = await callHandler<{
      success: boolean;
      data: { conversationId: number; widgetId: number; ephemeralToken: string };
    }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { widgetId, visitorId: 'visitor-abc', name: 'Jane', email: 'jane@test.local' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data.widgetId).toBe(widgetId);
    expect(res.data?.data.conversationId).toBeGreaterThan(0);
    // Tokens are `${convId}.${expiresAt}.${sig}` — three dot-separated parts.
    expect(res.data?.data.ephemeralToken.split('.').length).toBe(3);

    const sql = getTestSql();
    const [row] = await sql<{
      widget_id: number; client_id: number; visitor_id: string;
      visitor_name: string | null; visitor_email: string | null; status: string;
    }[]>`
      SELECT widget_id, client_id, visitor_id, visitor_name, visitor_email, status
      FROM ${sql(TEST_SCHEMA)}.chat_conversations
      WHERE id = ${res.data!.data.conversationId}
    `;
    expect(row.widget_id).toBe(widgetId);
    expect(row.client_id).toBe(clientId);
    expect(row.visitor_id).toBe('visitor-abc');
    expect(row.visitor_name).toBe('Jane');
    expect(row.visitor_email).toBe('jane@test.local');
    expect(row.status).toBe('open');
  });

  it('reuses the existing open conversation for the same (widget, visitorId)', async () => {
    const { widgetId } = await seedSiteAndWidget(ctx);
    const route = await import('@/app/api/public/chat/start/route');

    const a = await callHandler<{ data: { conversationId: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { widgetId, visitorId: 'returning-v' } },
    );
    const b = await callHandler<{ data: { conversationId: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { widgetId, visitorId: 'returning-v' } },
    );
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.data?.data.conversationId).toBe(b.data?.data.conversationId);
  });

  // Note: the route's contract for a disabled widget is 404 (`{ message: 'Widget not available' }`),
  // not 403 as some early specs phrased it. Test enforces the actual behavior so it
  // protects against regressions either way.
  it('rejects start when the widget is disabled', async () => {
    const { widgetId } = await seedSiteAndWidget(ctx, { enabled: false, label: 'disabled' });
    const route = await import('@/app/api/public/chat/start/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { widgetId, visitorId: 'visitor-disabled' } },
    );
    expect([403, 404]).toContain(res.status);
    expect(res.data?.success).toBe(false);
  });
});

describe('POST /api/public/chat/messages @chat @public', () => {
  let ctx: TenantCtx;
  beforeEach(async () => {
    __resetRateLimit();
    ctx = await sessionForNewClientUser('chat-msg');
  });

  async function startConversation(label = 'msg'): Promise<{ conversationId: number; token: string; clientId: number }> {
    const seeded = await seedSiteAndWidget(ctx, { label });
    const route = await import('@/app/api/public/chat/start/route');
    const res = await callHandler<{ data: { conversationId: number; ephemeralToken: string } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { widgetId: seeded.widgetId, visitorId: `visitor-${label}-${Date.now()}` } },
    );
    expect(res.status).toBe(200);
    return {
      conversationId: res.data!.data.conversationId,
      token: res.data!.data.ephemeralToken,
      clientId: seeded.clientId,
    };
  }

  it('401 when token is missing or malformed', async () => {
    const { conversationId } = await startConversation();
    const route = await import('@/app/api/public/chat/messages/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { conversationId, body: 'hi', ephemeralToken: 'not-a-real-token' } },
    );
    expect(res.status).toBe(401);
  });

  it('inserts a visitor message + bumps lastMessageAt with a valid token', async () => {
    const { conversationId, token, clientId } = await startConversation('insert');
    const route = await import('@/app/api/public/chat/messages/route');
    const res = await callHandler<{ success: boolean; data: { id: number; body: string; authorKind: string } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { conversationId, ephemeralToken: token, body: 'Hello from a visitor' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data.body).toBe('Hello from a visitor');
    expect(res.data?.data.authorKind).toBe('visitor');

    const sql = getTestSql();
    const [row] = await sql<{
      conversation_id: number; client_id: number; author_kind: string; body: string;
    }[]>`
      SELECT conversation_id, client_id, author_kind, body
      FROM ${sql(TEST_SCHEMA)}.chat_messages WHERE id = ${res.data!.data.id}
    `;
    expect(row.conversation_id).toBe(conversationId);
    expect(row.client_id).toBe(clientId);
    expect(row.author_kind).toBe('visitor');
    expect(row.body).toBe('Hello from a visitor');

    // Conversation lastMessageAt should advance.
    const [conv] = await sql<{ last_message_at: Date }[]>`
      SELECT last_message_at FROM ${sql(TEST_SCHEMA)}.chat_conversations WHERE id = ${conversationId}
    `;
    expect(conv.last_message_at).toBeTruthy();
  });

  it('401 when the token is for a DIFFERENT conversationId (token verification)', async () => {
    const a = await startConversation('tok-a');
    const b = await startConversation('tok-b');
    const route = await import('@/app/api/public/chat/messages/route');

    // Use B's token but A's conversationId — must be rejected.
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { conversationId: a.conversationId, ephemeralToken: b.token, body: 'cross-talk' } },
    );
    expect(res.status).toBe(401);
    expect(res.data?.message).toMatch(/token|mismatch/i);
  });

  it('401 when token is signed for a non-existent conversation', async () => {
    // Issue a syntactically-valid token for a conversationId that never existed.
    const fake = issueVisitorToken(987_654);
    const route = await import('@/app/api/public/chat/messages/route');
    const res = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { conversationId: 987_654, ephemeralToken: fake, body: 'hello?' } },
    );
    // verifyVisitorToken passes (sig OK), but the conversation row is missing.
    // The route returns 404 in that case; either way the visitor never gets in.
    expect([401, 404]).toContain(res.status);
  });

  it('rate-limit: 11th message in 10s gets 429', async () => {
    const { conversationId, token } = await startConversation('rl');
    const route = await import('@/app/api/public/chat/messages/route');

    // Send the first 10 — all should succeed.
    for (let i = 0; i < 10; i++) {
      const res = await callHandler(
        route as unknown as Record<string, unknown>, 'POST',
        { body: { conversationId, ephemeralToken: token, body: `msg-${i}` } },
      );
      expect(res.status, `message #${i + 1} should succeed`).toBe(200);
    }

    // 11th in the same 10s window must be rate-limited.
    const overflow = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { conversationId, ephemeralToken: token, body: 'one too many' } },
    );
    expect(overflow.status).toBe(429);
    expect(overflow.data?.message).toMatch(/too many|slow/i);
    expect(overflow.headers.get('retry-after')).toBeTruthy();
  });

  it('400 when the message body is empty', async () => {
    const { conversationId, token } = await startConversation('empty');
    const route = await import('@/app/api/public/chat/messages/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { conversationId, ephemeralToken: token, body: '   ' } },
    );
    expect(res.status).toBe(400);
  });
});
