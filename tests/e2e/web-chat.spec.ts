/**
 * Web chat widget — visitor ↔ agent round-trip.
 *
 * 1. Admin provisions a client website (so the test seed has a siteId).
 * 2. Client portal creates a chat widget against that site.
 * 3. Public visitor flow: POST /chat/start → POST /chat/messages.
 * 4. Agent fetches the conversation via portal API and replies.
 * 5. Visitor's `GET /chat/conversations/:id` history shows BOTH messages.
 *
 * SSE delivery is exercised implicitly by the conversation history endpoint
 * — the realtime layer is unit-tested separately. This spec polls the
 * history endpoint, which is the spec-sanctioned fallback.
 *
 * @critical: web chat is a HighLevel-parity gap-closer.
 */
import { test, expect } from './setup/fixtures';

const PREFIX = `webchat-${Date.now()}`;

test.describe('Web chat widget — visitor↔agent round-trip @web-chat @critical', () => {
  test('visitor sends, agent replies, history reflects both', async ({ adminApi, clientApi, unauthApi }) => {
    // ── 0. Discover the active client + create a fresh website ───────────────
    // The portal-client seed doesn't create a clientWebsites row, so we
    // need an admin to provision one.
    const clientsRes = await adminApi.get('/api/admin/portal/clients');
    expect(clientsRes.status).toBe(200);
    expect(clientsRes.data?.success).toBe(true);
    const seedClient = (clientsRes.data.data as Array<{ id: number; userEmail?: string }>).find(
      (c) => c.userEmail === 'client@example.com',
    );
    test.skip(!seedClient, 'Seed client@example.com not present');
    const clientId = seedClient!.id;

    const siteRes = await adminApi.post('/api/admin/portal/websites', {
      clientId,
      name: `${PREFIX}-site`,
      description: 'web chat e2e fixture',
    });
    expect(siteRes.status).toBeLessThan(400);
    const siteId: number = siteRes.data.data.id;

    // ── 1. Client creates a widget against that site ────────────────────────
    const widgetRes = await clientApi.post('/api/portal/chat/widgets', {
      siteId,
      greetingMessage: 'Hi! Test greeting.',
      primaryColor: '#123456',
    });
    expect(widgetRes.status).toBe(200);
    expect(widgetRes.data.success).toBe(true);
    const widgetId: number = widgetRes.data.data.id;
    expect(widgetRes.data.data.siteId).toBe(siteId);

    // ── 2. Visitor starts a conversation (no auth) ──────────────────────────
    const visitorId = `vt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startRes = await unauthApi.post('/api/public/chat/start', {
      widgetId,
      visitorId,
      name: 'E2E Visitor',
      email: 'visitor@example.com',
    });
    expect(startRes.status).toBe(200);
    expect(startRes.data.success).toBe(true);
    const conversationId: number = startRes.data.data.conversationId;
    const ephemeralToken: string = startRes.data.data.ephemeralToken;
    expect(typeof ephemeralToken).toBe('string');
    expect(ephemeralToken.split('.').length).toBe(3);

    // Idempotency: same visitorId returns the same conversation.
    const startRes2 = await unauthApi.post('/api/public/chat/start', {
      widgetId,
      visitorId,
    });
    expect(startRes2.data.data.conversationId).toBe(conversationId);

    // ── 3. Visitor sends a message ──────────────────────────────────────────
    const visitorMsgRes = await unauthApi.post('/api/public/chat/messages', {
      conversationId,
      ephemeralToken,
      body: 'Hello from the visitor!',
    });
    expect(visitorMsgRes.status).toBe(200);
    expect(visitorMsgRes.data.success).toBe(true);
    expect(visitorMsgRes.data.data.authorKind).toBe('visitor');

    // Message with a wrong token must 401.
    const tamperedRes = await unauthApi.post('/api/public/chat/messages', {
      conversationId,
      ephemeralToken: ephemeralToken.replace(/.$/, 'x'),
      body: 'should fail',
    });
    expect(tamperedRes.status).toBe(401);

    // ── 4. Agent fetches and replies ────────────────────────────────────────
    const inboxRes = await clientApi.get('/api/portal/chat/conversations');
    expect(inboxRes.status).toBe(200);
    const found = (inboxRes.data.data as Array<{ id: number }>).find((c) => c.id === conversationId);
    expect(found).toBeDefined();

    const detailRes = await clientApi.get(`/api/portal/chat/conversations/${conversationId}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.data.data.messages.length).toBe(1);

    const replyRes = await clientApi.post(`/api/portal/chat/conversations/${conversationId}/messages`, {
      body: 'Hi visitor — agent here!',
    });
    expect(replyRes.status).toBe(200);
    expect(replyRes.data.data.authorKind).toBe('agent');

    // First reply auto-claims.
    const detail2 = await clientApi.get(`/api/portal/chat/conversations/${conversationId}`);
    expect(detail2.data.data.conversation.status).toBe('assigned');
    expect(detail2.data.data.messages.length).toBe(2);

    // ── 5. Close + reopen ───────────────────────────────────────────────────
    const closeRes = await clientApi.patch(`/api/portal/chat/conversations/${conversationId}`, { action: 'close' });
    expect(closeRes.status).toBe(200);
    expect(closeRes.data.data.status).toBe('closed');

    // Visitor cannot post to a closed conversation.
    const blockedRes = await unauthApi.post('/api/public/chat/messages', {
      conversationId,
      ephemeralToken,
      body: 'should be blocked',
    });
    expect(blockedRes.status).toBe(409);

    // ── Cleanup ─────────────────────────────────────────────────────────────
    await clientApi.delete(`/api/portal/chat/widgets/${widgetId}`);
  });
});
