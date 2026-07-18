/**
 * GET /api/public/chat/stream — visitor SSE smoke test.
 *
 * We don't fully exercise event delivery here — that requires a real
 * Postgres LISTEN/NOTIFY round-trip on a separate connection. Instead we:
 *   - verify the route refuses bad/missing tokens (401)
 *   - verify a valid token + matching conversation establishes the SSE
 *     connection: 200 / Content-Type text/event-stream / hello frame
 *   - verify the heartbeat structure is wired (we read the first chunk).
 *
 * The realtime layer is mocked so subscribeChannel returns immediately
 * without opening any real Postgres socket.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/chat/realtime', () => ({
  publishMessage: vi.fn().mockResolvedValue(undefined),
  publishConversationUpdate: vi.fn().mockResolvedValue(undefined),
  conversationChannel: (id: number) => `chat_conv_${id}`,
  inboxChannel: (id: number) => `chat_inbox_${id}`,
  subscribeChannel: () => ({
    ready: Promise.resolve(),
    unsubscribe: async () => {},
  }),
}));

import { sessionForNewClientUser, type TenantCtx } from '../../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../../helpers/test-db';
import { issueVisitorToken } from '@/lib/chat/token';

async function seedConversation(label = 'stream'): Promise<{
  ctx: TenantCtx;
  widgetId: number;
  conversationId: number;
}> {
  const ctx = await sessionForNewClientUser(label);
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
  return { ctx, widgetId: widget.id, conversationId: conv.id };
}

/**
 * Calls the SSE GET handler directly (not via callHandler) — the response
 * is a streaming text body, not JSON, so we want raw access to headers/body.
 */
async function callStream(
  conversationId: number,
  token: string,
): Promise<Response> {
  const { GET } = await import('@/app/api/public/chat/stream/route');
  const url = `http://localhost:3000/api/public/chat/stream?conversationId=${conversationId}&token=${encodeURIComponent(token)}`;
  return GET(new Request(url, { method: 'GET' }));
}

describe('GET /api/public/chat/stream @chat @public', () => {
  beforeEach(() => {
    // realtime mock is module-scoped via vi.mock, no per-test setup needed.
  });

  it('401 with no token', async () => {
    const { conversationId } = await seedConversation('stream-noauth');
    const { GET } = await import('@/app/api/public/chat/stream/route');
    const res = await GET(
      new Request(`http://localhost:3000/api/public/chat/stream?conversationId=${conversationId}`),
    );
    expect(res.status).toBe(401);
  });

  it('401 with a malformed token', async () => {
    const { conversationId } = await seedConversation('stream-bad');
    const res = await callStream(conversationId, 'not.a.valid-token');
    expect(res.status).toBe(401);
  });

  it('401 when token is for a DIFFERENT conversationId', async () => {
    const a = await seedConversation('stream-a');
    const b = await seedConversation('stream-b');
    const tokenForB = issueVisitorToken(b.conversationId);
    const res = await callStream(a.conversationId, tokenForB);
    expect(res.status).toBe(401);
  });

  it('returns 200 + text/event-stream with valid token and emits a hello frame', async () => {
    const { conversationId } = await seedConversation('stream-ok');
    const token = issueVisitorToken(conversationId);
    const res = await callStream(conversationId, token);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
    expect(res.headers.get('cache-control')).toMatch(/no-cache/);
    // Anti-buffering header for nginx-style proxies — important for SSE.
    expect(res.headers.get('x-accel-buffering')).toBe('no');

    // Read the first chunk so we can verify the hello frame ships.
    const body = res.body;
    expect(body).toBeTruthy();
    const reader = body!.getReader();
    try {
      const { value } = await reader.read();
      const chunk = new TextDecoder().decode(value);
      // SSE frame: `event: hello\ndata: {...}\n\n`
      expect(chunk).toMatch(/event:\s*hello/);
      expect(chunk).toMatch(new RegExp(`"conversationId":\\s*${conversationId}`));
    } finally {
      // Cancel the stream so the heartbeat interval gets cleaned up.
      await reader.cancel();
    }
  });
});
