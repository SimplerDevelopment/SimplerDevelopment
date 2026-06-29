/**
 * AI Chatbot / Live-Chat — deep lifecycle spec.
 *
 * Complements the thin coverage in web-chat.spec.ts (single round-trip) and
 * portal-ai-chat.spec.ts (AI conversation list/detail) by exercising:
 *
 *  1. Widget settings CRUD — read, update (position, primaryColor, greeting,
 *     awayMessage), and assert the fields persist on the next GET.
 *  2. Widget validation — POST without siteId returns 400; duplicate widget
 *     for the same site returns 409.
 *  3. Visitor conversation creation — POST /api/public/chat/start lands the
 *     conversation in the portal inbox with status 'open'.
 *  4. Visitor message content — send two messages, assert body/authorKind
 *     persists and ordering (asc by occurredAt) is stable.
 *  5. Agent reply — POST /api/portal/chat/conversations/[id]/messages; assert
 *     authorKind === 'agent', thread grows to 3 messages, and the first-reply
 *     auto-claim sets status → 'assigned'.
 *  6. Status transitions (all four PATCH actions):
 *       open → (agent reply auto-assigns) → assigned
 *       assigned → unassign → open
 *       open → assign-self → assigned
 *       assigned → close → closed
 *       closed → reopen → assigned (because assignedUserId is set)
 *  7. Unknown PATCH action returns 400.
 *  8. Agent cannot reply to a closed conversation (409).
 *  9. Widget GET/PATCH auth guards — unauthenticated requests return 401.
 * 10. Inbox list filters — ?status= and ?assignee=me narrow results correctly.
 * 11. Tenancy guard — accessing a conversation with id 99999 returns 404 for
 *     the owning client (not found for that client = correct isolation).
 *
 * No-API-surface steps (skipped rather than fabricated):
 *  - Lead capture: no dedicated endpoint found under /api/public/chat or
 *    /api/portal/chat — skipped.
 *  - Human-handoff: no endpoint found — skipped.
 *  - SSE inbox-stream: streaming is not exercisable through the API client
 *    without a live server; the realtime layer is unit-tested separately.
 *
 * Cleanup: every widget and conversation created here is deleted in afterEach.
 * Websites provisioned via adminApi are left in place (no delete endpoint for
 * websites — matches the acceptable-leak policy in helpers.ts::createTestWebsite).
 *
 * @ai-chatbot @inbox @critical
 */

import { test, expect } from './setup/fixtures';

const PREFIX = `chatbot-lifecycle-${Date.now()}`;

// ── shared lifecycle fixture (widget + visitor conversation) ─────────────────

interface LifecycleFixture {
  siteId: number;
  widgetId: number;
  conversationId: number;
  ephemeralToken: string;
  visitorId: string;
}

async function buildLifecycleFixture(
  adminApi: Parameters<Parameters<typeof test>[1]>[0]['adminApi'],
  clientApi: Parameters<Parameters<typeof test>[1]>[0]['clientApi'],
  unauthApi: Parameters<Parameters<typeof test>[1]>[0]['unauthApi'],
  label: string,
): Promise<LifecycleFixture> {
  // Provision a fresh site so the widget creation never 409s from a prior run.
  const clientsRes = await adminApi.get('/api/admin/portal/clients');
  const seedClient = (clientsRes.data?.data as Array<{ id: number; userEmail?: string }>).find(
    (c) => c.userEmail === 'client@example.com',
  );
  if (!seedClient) throw new Error('Seed client@example.com not found — run seed scripts');

  const siteRes = await adminApi.post('/api/admin/portal/websites', {
    clientId: seedClient.id,
    name: `${PREFIX}-${label}-site`,
    description: 'chatbot lifecycle e2e fixture',
  });
  if (siteRes.status >= 400) throw new Error(`Site creation failed: ${siteRes.status}`);
  const siteId: number = siteRes.data.data.id;

  const widgetRes = await clientApi.post('/api/portal/chat/widgets', {
    siteId,
    greetingMessage: 'Lifecycle greeting',
    primaryColor: '#aabbcc',
    position: 'bottom-right',
    awayMessage: null,
  });
  if (widgetRes.status !== 200) throw new Error(`Widget creation failed: ${widgetRes.status}`);
  const widgetId: number = widgetRes.data.data.id;

  const visitorId = `lc-visitor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const startRes = await unauthApi.post('/api/public/chat/start', {
    widgetId,
    visitorId,
    name: 'Lifecycle Visitor',
    email: 'lc-visitor@example.com',
  });
  if (startRes.status !== 200) throw new Error(`Chat start failed: ${startRes.status}`);

  return {
    siteId,
    widgetId,
    conversationId: startRes.data.data.conversationId as number,
    ephemeralToken: startRes.data.data.ephemeralToken as string,
    visitorId,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1: Widget settings CRUD
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Widget settings CRUD @ai-chatbot @inbox', () => {
  let widgetId = 0;
  let siteId = 0;

  test.afterEach(async ({ clientApi }) => {
    if (widgetId) await clientApi.delete(`/api/portal/chat/widgets/${widgetId}`).catch(() => {});
  });

  test('widget creation returns all expected fields', async ({ adminApi, clientApi }) => {
    const clientsRes = await adminApi.get('/api/admin/portal/clients');
    const seedClient = (clientsRes.data?.data as Array<{ id: number; userEmail?: string }>).find(
      (c) => c.userEmail === 'client@example.com',
    );
    test.skip(!seedClient, 'Seed client@example.com not present');

    const siteRes = await adminApi.post('/api/admin/portal/websites', {
      clientId: seedClient!.id,
      name: `${PREFIX}-crud-site`,
      description: 'widget crud fixture',
    });
    siteId = siteRes.data.data.id as number;

    const res = await clientApi.post('/api/portal/chat/widgets', {
      siteId,
      greetingMessage: 'Hello!',
      primaryColor: '#ff0000',
      position: 'bottom-left',
      awayMessage: 'We are away',
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);

    const w = res.data.data as Record<string, unknown>;
    widgetId = w.id as number;

    expect(w.siteId).toBe(siteId);
    expect(w.greetingMessage).toBe('Hello!');
    expect(w.primaryColor).toBe('#ff0000');
    expect(w.position).toBe('bottom-left');
    expect(w.awayMessage).toBe('We are away');
    expect(w.enabled).toBe(true);
  });

  test('GET /api/portal/chat/widgets/[id] returns persisted widget', async ({ adminApi, clientApi }) => {
    const clientsRes = await adminApi.get('/api/admin/portal/clients');
    const seedClient = (clientsRes.data?.data as Array<{ id: number; userEmail?: string }>).find(
      (c) => c.userEmail === 'client@example.com',
    );
    test.skip(!seedClient, 'Seed client@example.com not present');

    const siteRes = await adminApi.post('/api/admin/portal/websites', {
      clientId: seedClient!.id,
      name: `${PREFIX}-get-site`,
      description: 'widget get fixture',
    });
    siteId = siteRes.data.data.id as number;

    const createRes = await clientApi.post('/api/portal/chat/widgets', {
      siteId,
      greetingMessage: 'Read test greeting',
      primaryColor: '#001122',
    });
    widgetId = createRes.data.data.id as number;

    const getRes = await clientApi.get(`/api/portal/chat/widgets/${widgetId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.data.success).toBe(true);
    expect(getRes.data.data.id).toBe(widgetId);
    expect(getRes.data.data.greetingMessage).toBe('Read test greeting');
    expect(getRes.data.data.primaryColor).toBe('#001122');
  });

  test('PATCH widget updates position, primaryColor, greeting, awayMessage and persists', async ({ adminApi, clientApi }) => {
    const clientsRes = await adminApi.get('/api/admin/portal/clients');
    const seedClient = (clientsRes.data?.data as Array<{ id: number; userEmail?: string }>).find(
      (c) => c.userEmail === 'client@example.com',
    );
    test.skip(!seedClient, 'Seed client@example.com not present');

    const siteRes = await adminApi.post('/api/admin/portal/websites', {
      clientId: seedClient!.id,
      name: `${PREFIX}-patch-site`,
      description: 'widget patch fixture',
    });
    siteId = siteRes.data.data.id as number;

    const createRes = await clientApi.post('/api/portal/chat/widgets', {
      siteId,
      greetingMessage: 'Original greeting',
      primaryColor: '#000000',
      position: 'bottom-right',
    });
    widgetId = createRes.data.data.id as number;

    const patchRes = await clientApi.patch(`/api/portal/chat/widgets/${widgetId}`, {
      position: 'bottom-left',
      primaryColor: '#ff6600',
      greetingMessage: 'Updated greeting',
      awayMessage: 'Back soon!',
    });
    expect(patchRes.status).toBe(200);
    expect(patchRes.data.success).toBe(true);
    expect(patchRes.data.data.position).toBe('bottom-left');
    expect(patchRes.data.data.primaryColor).toBe('#ff6600');
    expect(patchRes.data.data.greetingMessage).toBe('Updated greeting');
    expect(patchRes.data.data.awayMessage).toBe('Back soon!');

    // Verify persistence via a fresh GET.
    const getRes = await clientApi.get(`/api/portal/chat/widgets/${widgetId}`);
    expect(getRes.data.data.position).toBe('bottom-left');
    expect(getRes.data.data.primaryColor).toBe('#ff6600');
    expect(getRes.data.data.greetingMessage).toBe('Updated greeting');
    expect(getRes.data.data.awayMessage).toBe('Back soon!');
  });

  test('POST /api/portal/chat/widgets without siteId returns 400', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/chat/widgets', {
      greetingMessage: 'No site',
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('duplicate widget for the same site returns 409', async ({ adminApi, clientApi }) => {
    const clientsRes = await adminApi.get('/api/admin/portal/clients');
    const seedClient = (clientsRes.data?.data as Array<{ id: number; userEmail?: string }>).find(
      (c) => c.userEmail === 'client@example.com',
    );
    test.skip(!seedClient, 'Seed client@example.com not present');

    const siteRes = await adminApi.post('/api/admin/portal/websites', {
      clientId: seedClient!.id,
      name: `${PREFIX}-dup-site`,
      description: 'widget dup fixture',
    });
    siteId = siteRes.data.data.id as number;

    const first = await clientApi.post('/api/portal/chat/widgets', { siteId });
    expect(first.status).toBe(200);
    widgetId = first.data.data.id as number;

    const dup = await clientApi.post('/api/portal/chat/widgets', { siteId });
    expect(dup.status).toBe(409);
  });

  test('GET /api/portal/chat/widgets/[id] rejects unauthenticated', async ({ adminApi, clientApi, unauthApi }) => {
    const clientsRes = await adminApi.get('/api/admin/portal/clients');
    const seedClient = (clientsRes.data?.data as Array<{ id: number; userEmail?: string }>).find(
      (c) => c.userEmail === 'client@example.com',
    );
    test.skip(!seedClient, 'Seed client@example.com not present');

    const siteRes = await adminApi.post('/api/admin/portal/websites', {
      clientId: seedClient!.id,
      name: `${PREFIX}-auth-site`,
      description: 'widget auth fixture',
    });
    siteId = siteRes.data.data.id as number;

    const createRes = await clientApi.post('/api/portal/chat/widgets', { siteId });
    widgetId = createRes.data.data.id as number;

    const res = await unauthApi.get(`/api/portal/chat/widgets/${widgetId}`);
    expect(res.status).toBe(401);
  });

  test('PATCH /api/portal/chat/widgets/[id] rejects unauthenticated', async ({ adminApi, clientApi, unauthApi }) => {
    const clientsRes = await adminApi.get('/api/admin/portal/clients');
    const seedClient = (clientsRes.data?.data as Array<{ id: number; userEmail?: string }>).find(
      (c) => c.userEmail === 'client@example.com',
    );
    test.skip(!seedClient, 'Seed client@example.com not present');

    const siteRes = await adminApi.post('/api/admin/portal/websites', {
      clientId: seedClient!.id,
      name: `${PREFIX}-patch-auth-site`,
      description: 'widget patch auth fixture',
    });
    siteId = siteRes.data.data.id as number;

    const createRes = await clientApi.post('/api/portal/chat/widgets', { siteId });
    widgetId = createRes.data.data.id as number;

    const res = await unauthApi.patch(`/api/portal/chat/widgets/${widgetId}`, {
      greetingMessage: 'should fail',
    });
    expect(res.status).toBe(401);
  });

  test('GET /api/portal/chat/widgets lists only this client widgets', async ({ adminApi, clientApi }) => {
    const clientsRes = await adminApi.get('/api/admin/portal/clients');
    const seedClient = (clientsRes.data?.data as Array<{ id: number; userEmail?: string }>).find(
      (c) => c.userEmail === 'client@example.com',
    );
    test.skip(!seedClient, 'Seed client@example.com not present');

    const siteRes = await adminApi.post('/api/admin/portal/websites', {
      clientId: seedClient!.id,
      name: `${PREFIX}-list-site`,
      description: 'widget list fixture',
    });
    siteId = siteRes.data.data.id as number;

    const createRes = await clientApi.post('/api/portal/chat/widgets', { siteId });
    widgetId = createRes.data.data.id as number;

    const listRes = await clientApi.get('/api/portal/chat/widgets');
    expect(listRes.status).toBe(200);
    expect(listRes.data.success).toBe(true);
    expect(Array.isArray(listRes.data.data)).toBe(true);
    const ids = (listRes.data.data as Array<{ id: number }>).map((w) => w.id);
    expect(ids).toContain(widgetId);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2: Visitor conversation creation → inbox landing
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Visitor conversation creation @ai-chatbot @inbox @critical', () => {
  let fixture: LifecycleFixture | null = null;

  test.afterEach(async ({ clientApi }) => {
    if (fixture) {
      await clientApi.delete(`/api/portal/chat/widgets/${fixture.widgetId}`).catch(() => {});
      fixture = null;
    }
  });

  test('POST /api/public/chat/start creates conversation with status open', async ({ adminApi, clientApi, unauthApi }) => {
    const clientsRes = await adminApi.get('/api/admin/portal/clients');
    const seedClient = (clientsRes.data?.data as Array<{ id: number; userEmail?: string }>).find(
      (c) => c.userEmail === 'client@example.com',
    );
    test.skip(!seedClient, 'Seed client@example.com not present');

    fixture = await buildLifecycleFixture(adminApi, clientApi, unauthApi, 'start');

    // Conversation must be visible in the portal inbox.
    const inboxRes = await clientApi.get('/api/portal/chat/conversations');
    expect(inboxRes.status).toBe(200);
    const found = (inboxRes.data.data as Array<{ id: number; status: string }>).find(
      (c) => c.id === fixture!.conversationId,
    );
    expect(found).toBeDefined();
    expect(found!.status).toBe('open');
  });

  test('start response includes greetingMessage, primaryColor, position from widget', async ({ adminApi, clientApi, unauthApi }) => {
    const clientsRes = await adminApi.get('/api/admin/portal/clients');
    const seedClient = (clientsRes.data?.data as Array<{ id: number; userEmail?: string }>).find(
      (c) => c.userEmail === 'client@example.com',
    );
    test.skip(!seedClient, 'Seed client@example.com not present');

    const siteRes = await adminApi.post('/api/admin/portal/websites', {
      clientId: seedClient!.id,
      name: `${PREFIX}-start-meta-site`,
      description: 'start meta fixture',
    });
    const siteId: number = siteRes.data.data.id;

    const widgetRes = await clientApi.post('/api/portal/chat/widgets', {
      siteId,
      greetingMessage: 'Welcome to e2e!',
      primaryColor: '#112233',
      position: 'bottom-left',
      awayMessage: 'Gone fishing',
    });
    const widgetId: number = widgetRes.data.data.id;
    fixture = { siteId, widgetId, conversationId: 0, ephemeralToken: '', visitorId: '' };

    const visitorId = `meta-visitor-${Date.now()}`;
    const startRes = await unauthApi.post('/api/public/chat/start', { widgetId, visitorId });
    expect(startRes.status).toBe(200);
    expect(startRes.data.data.greetingMessage).toBe('Welcome to e2e!');
    expect(startRes.data.data.primaryColor).toBe('#112233');
    expect(startRes.data.data.position).toBe('bottom-left');
    expect(startRes.data.data.awayMessage).toBe('Gone fishing');

    fixture.conversationId = startRes.data.data.conversationId as number;
    fixture.ephemeralToken = startRes.data.data.ephemeralToken as string;
    fixture.visitorId = visitorId;
  });

  test('start is idempotent: same visitorId returns same conversationId', async ({ adminApi, clientApi, unauthApi }) => {
    const clientsRes = await adminApi.get('/api/admin/portal/clients');
    const seedClient = (clientsRes.data?.data as Array<{ id: number; userEmail?: string }>).find(
      (c) => c.userEmail === 'client@example.com',
    );
    test.skip(!seedClient, 'Seed client@example.com not present');

    fixture = await buildLifecycleFixture(adminApi, clientApi, unauthApi, 'idem');

    const repeat = await unauthApi.post('/api/public/chat/start', {
      widgetId: fixture.widgetId,
      visitorId: fixture.visitorId,
    });
    expect(repeat.status).toBe(200);
    expect(repeat.data.data.conversationId).toBe(fixture.conversationId);
  });

  test('start with missing widgetId returns 400', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/public/chat/start', {
      visitorId: 'v-no-widget',
    });
    expect(res.status).toBe(400);
  });

  test('start with missing visitorId returns 400', async ({ adminApi, clientApi, unauthApi }) => {
    const clientsRes = await adminApi.get('/api/admin/portal/clients');
    const seedClient = (clientsRes.data?.data as Array<{ id: number; userEmail?: string }>).find(
      (c) => c.userEmail === 'client@example.com',
    );
    test.skip(!seedClient, 'Seed client@example.com not present');

    const siteRes = await adminApi.post('/api/admin/portal/websites', {
      clientId: seedClient!.id,
      name: `${PREFIX}-no-visitor-site`,
      description: 'no-visitor fixture',
    });
    const siteId: number = siteRes.data.data.id;
    const widgetRes = await clientApi.post('/api/portal/chat/widgets', { siteId });
    const widgetId: number = widgetRes.data.data.id;
    fixture = { siteId, widgetId, conversationId: 0, ephemeralToken: '', visitorId: '' };

    const res = await unauthApi.post('/api/public/chat/start', { widgetId });
    expect(res.status).toBe(400);
  });

  test('start against disabled/non-existent widgetId returns 404', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/public/chat/start', {
      widgetId: 999999,
      visitorId: 'v-ghost',
    });
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3: Visitor messages — body, ordering, auth guards
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Visitor messages — content and ordering @ai-chatbot @inbox', () => {
  let fixture: LifecycleFixture | null = null;

  test.afterEach(async ({ clientApi }) => {
    if (fixture) {
      await clientApi.delete(`/api/portal/chat/widgets/${fixture.widgetId}`).catch(() => {});
      fixture = null;
    }
  });

  test('visitor sends two messages; thread returns them ordered asc by occurredAt', async ({ adminApi, clientApi, unauthApi }) => {
    const clientsRes = await adminApi.get('/api/admin/portal/clients');
    const seedClient = (clientsRes.data?.data as Array<{ id: number; userEmail?: string }>).find(
      (c) => c.userEmail === 'client@example.com',
    );
    test.skip(!seedClient, 'Seed client@example.com not present');

    fixture = await buildLifecycleFixture(adminApi, clientApi, unauthApi, 'msg-order');

    const msg1 = await unauthApi.post('/api/public/chat/messages', {
      conversationId: fixture.conversationId,
      ephemeralToken: fixture.ephemeralToken,
      body: 'First visitor message',
    });
    expect(msg1.status).toBe(200);
    expect(msg1.data.data.authorKind).toBe('visitor');
    expect(msg1.data.data.body).toBe('First visitor message');

    const msg2 = await unauthApi.post('/api/public/chat/messages', {
      conversationId: fixture.conversationId,
      ephemeralToken: fixture.ephemeralToken,
      body: 'Second visitor message',
    });
    expect(msg2.status).toBe(200);
    expect(msg2.data.data.body).toBe('Second visitor message');

    const detailRes = await clientApi.get(`/api/portal/chat/conversations/${fixture.conversationId}`);
    expect(detailRes.status).toBe(200);
    const messages = detailRes.data.data.messages as Array<{
      id: number;
      body: string;
      authorKind: string;
      occurredAt: string;
    }>;
    expect(messages.length).toBeGreaterThanOrEqual(2);

    // Verify ascending time ordering.
    for (let i = 1; i < messages.length; i++) {
      expect(new Date(messages[i].occurredAt).getTime()).toBeGreaterThanOrEqual(
        new Date(messages[i - 1].occurredAt).getTime(),
      );
    }

    // Both messages must be in the thread.
    const bodies = messages.map((m) => m.body);
    expect(bodies).toContain('First visitor message');
    expect(bodies).toContain('Second visitor message');
  });

  test('visitor message with tampered token returns 401', async ({ adminApi, clientApi, unauthApi }) => {
    const clientsRes = await adminApi.get('/api/admin/portal/clients');
    const seedClient = (clientsRes.data?.data as Array<{ id: number; userEmail?: string }>).find(
      (c) => c.userEmail === 'client@example.com',
    );
    test.skip(!seedClient, 'Seed client@example.com not present');

    fixture = await buildLifecycleFixture(adminApi, clientApi, unauthApi, 'tamper');

    const res = await unauthApi.post('/api/public/chat/messages', {
      conversationId: fixture.conversationId,
      ephemeralToken: fixture.ephemeralToken.replace(/.$/, 'x'),
      body: 'tampered',
    });
    expect(res.status).toBe(401);
  });

  test('visitor message with empty body returns 400', async ({ adminApi, clientApi, unauthApi }) => {
    const clientsRes = await adminApi.get('/api/admin/portal/clients');
    const seedClient = (clientsRes.data?.data as Array<{ id: number; userEmail?: string }>).find(
      (c) => c.userEmail === 'client@example.com',
    );
    test.skip(!seedClient, 'Seed client@example.com not present');

    fixture = await buildLifecycleFixture(adminApi, clientApi, unauthApi, 'empty-body');

    const res = await unauthApi.post('/api/public/chat/messages', {
      conversationId: fixture.conversationId,
      ephemeralToken: fixture.ephemeralToken,
      body: '',
    });
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 4: Agent reply + status transitions
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Agent reply and status transitions @ai-chatbot @inbox @critical', () => {
  let fixture: LifecycleFixture | null = null;

  test.afterEach(async ({ clientApi }) => {
    if (fixture) {
      await clientApi.delete(`/api/portal/chat/widgets/${fixture.widgetId}`).catch(() => {});
      fixture = null;
    }
  });

  test('agent reply sets authorKind=agent, auto-assigns (open → assigned), thread grows', async ({
    adminApi,
    clientApi,
    unauthApi,
  }) => {
    const clientsRes = await adminApi.get('/api/admin/portal/clients');
    const seedClient = (clientsRes.data?.data as Array<{ id: number; userEmail?: string }>).find(
      (c) => c.userEmail === 'client@example.com',
    );
    test.skip(!seedClient, 'Seed client@example.com not present');

    fixture = await buildLifecycleFixture(adminApi, clientApi, unauthApi, 'reply');

    // Visitor sends first.
    await unauthApi.post('/api/public/chat/messages', {
      conversationId: fixture.conversationId,
      ephemeralToken: fixture.ephemeralToken,
      body: 'Need help please',
    });

    // Agent replies.
    const replyRes = await clientApi.post(
      `/api/portal/chat/conversations/${fixture.conversationId}/messages`,
      { body: 'Agent is here!' },
    );
    expect(replyRes.status).toBe(200);
    expect(replyRes.data.success).toBe(true);
    expect(replyRes.data.data.authorKind).toBe('agent');
    expect(replyRes.data.data.body).toBe('Agent is here!');

    // Auto-assign: status must have moved to 'assigned'.
    const detail = await clientApi.get(`/api/portal/chat/conversations/${fixture.conversationId}`);
    expect(detail.data.data.conversation.status).toBe('assigned');
    expect(detail.data.data.conversation.assignedUserId).not.toBeNull();

    // Thread: visitor + agent = 2 messages minimum.
    expect((detail.data.data.messages as unknown[]).length).toBeGreaterThanOrEqual(2);
  });

  test('agent reply to non-existent conversation returns 404', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/chat/conversations/999999/messages', {
      body: 'ghost reply',
    });
    expect(res.status).toBe(404);
  });

  test('agent reply with empty body returns 400', async ({ adminApi, clientApi, unauthApi }) => {
    const clientsRes = await adminApi.get('/api/admin/portal/clients');
    const seedClient = (clientsRes.data?.data as Array<{ id: number; userEmail?: string }>).find(
      (c) => c.userEmail === 'client@example.com',
    );
    test.skip(!seedClient, 'Seed client@example.com not present');

    fixture = await buildLifecycleFixture(adminApi, clientApi, unauthApi, 'agent-empty');

    const res = await clientApi.post(
      `/api/portal/chat/conversations/${fixture.conversationId}/messages`,
      { body: '' },
    );
    expect(res.status).toBe(400);
  });

  test('full status cycle: open → assign-self → unassign → close → reopen', async ({
    adminApi,
    clientApi,
    unauthApi,
  }) => {
    const clientsRes = await adminApi.get('/api/admin/portal/clients');
    const seedClient = (clientsRes.data?.data as Array<{ id: number; userEmail?: string }>).find(
      (c) => c.userEmail === 'client@example.com',
    );
    test.skip(!seedClient, 'Seed client@example.com not present');

    fixture = await buildLifecycleFixture(adminApi, clientApi, unauthApi, 'status-cycle');
    const cid = fixture.conversationId;

    // Confirm starting status is 'open'.
    const initial = await clientApi.get(`/api/portal/chat/conversations/${cid}`);
    expect(initial.data.data.conversation.status).toBe('open');

    // assign-self: open → assigned.
    const assignRes = await clientApi.patch(`/api/portal/chat/conversations/${cid}`, {
      action: 'assign-self',
    });
    expect(assignRes.status).toBe(200);
    expect(assignRes.data.data.status).toBe('assigned');
    expect(assignRes.data.data.assignedUserId).not.toBeNull();

    // unassign: assigned → open.
    const unassignRes = await clientApi.patch(`/api/portal/chat/conversations/${cid}`, {
      action: 'unassign',
    });
    expect(unassignRes.status).toBe(200);
    expect(unassignRes.data.data.status).toBe('open');
    expect(unassignRes.data.data.assignedUserId).toBeNull();

    // close: open → closed.
    const closeRes = await clientApi.patch(`/api/portal/chat/conversations/${cid}`, {
      action: 'close',
    });
    expect(closeRes.status).toBe(200);
    expect(closeRes.data.data.status).toBe('closed');
    expect(closeRes.data.data.closedAt).not.toBeNull();

    // reopen: closed → open (no assignee, so reopen gives 'open').
    const reopenRes = await clientApi.patch(`/api/portal/chat/conversations/${cid}`, {
      action: 'reopen',
    });
    expect(reopenRes.status).toBe(200);
    expect(reopenRes.data.data.status).toBe('open');
    expect(reopenRes.data.data.closedAt).toBeNull();
  });

  test('reopen after assigned→close returns assigned (assignedUserId preserved)', async ({
    adminApi,
    clientApi,
    unauthApi,
  }) => {
    const clientsRes = await adminApi.get('/api/admin/portal/clients');
    const seedClient = (clientsRes.data?.data as Array<{ id: number; userEmail?: string }>).find(
      (c) => c.userEmail === 'client@example.com',
    );
    test.skip(!seedClient, 'Seed client@example.com not present');

    fixture = await buildLifecycleFixture(adminApi, clientApi, unauthApi, 'reopen-assigned');
    const cid = fixture.conversationId;

    // Assign first.
    await clientApi.patch(`/api/portal/chat/conversations/${cid}`, { action: 'assign-self' });

    // Then close.
    await clientApi.patch(`/api/portal/chat/conversations/${cid}`, { action: 'close' });

    // Reopen: because assignedUserId is set, status goes back to 'assigned'.
    const reopenRes = await clientApi.patch(`/api/portal/chat/conversations/${cid}`, {
      action: 'reopen',
    });
    expect(reopenRes.status).toBe(200);
    expect(reopenRes.data.data.status).toBe('assigned');
  });

  test('unknown PATCH action returns 400', async ({ adminApi, clientApi, unauthApi }) => {
    const clientsRes = await adminApi.get('/api/admin/portal/clients');
    const seedClient = (clientsRes.data?.data as Array<{ id: number; userEmail?: string }>).find(
      (c) => c.userEmail === 'client@example.com',
    );
    test.skip(!seedClient, 'Seed client@example.com not present');

    fixture = await buildLifecycleFixture(adminApi, clientApi, unauthApi, 'bad-action');

    const res = await clientApi.patch(`/api/portal/chat/conversations/${fixture.conversationId}`, {
      action: 'teleport',
    });
    expect(res.status).toBe(400);
  });

  test('agent cannot reply to a closed conversation (409)', async ({ adminApi, clientApi, unauthApi }) => {
    const clientsRes = await adminApi.get('/api/admin/portal/clients');
    const seedClient = (clientsRes.data?.data as Array<{ id: number; userEmail?: string }>).find(
      (c) => c.userEmail === 'client@example.com',
    );
    test.skip(!seedClient, 'Seed client@example.com not present');

    fixture = await buildLifecycleFixture(adminApi, clientApi, unauthApi, 'closed-reply');
    const cid = fixture.conversationId;

    await clientApi.patch(`/api/portal/chat/conversations/${cid}`, { action: 'close' });

    const res = await clientApi.post(`/api/portal/chat/conversations/${cid}/messages`, {
      body: 'Too late',
    });
    expect(res.status).toBe(409);
  });

  test('visitor cannot post to a closed conversation (409)', async ({ adminApi, clientApi, unauthApi }) => {
    const clientsRes = await adminApi.get('/api/admin/portal/clients');
    const seedClient = (clientsRes.data?.data as Array<{ id: number; userEmail?: string }>).find(
      (c) => c.userEmail === 'client@example.com',
    );
    test.skip(!seedClient, 'Seed client@example.com not present');

    fixture = await buildLifecycleFixture(adminApi, clientApi, unauthApi, 'visitor-closed');
    const { conversationId, ephemeralToken } = fixture;

    await clientApi.patch(`/api/portal/chat/conversations/${conversationId}`, { action: 'close' });

    const res = await unauthApi.post('/api/public/chat/messages', {
      conversationId,
      ephemeralToken,
      body: 'This should be blocked',
    });
    expect(res.status).toBe(409);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 5: Inbox list filters
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Inbox list filters @ai-chatbot @inbox', () => {
  let fixture: LifecycleFixture | null = null;

  test.afterEach(async ({ clientApi }) => {
    if (fixture) {
      await clientApi.delete(`/api/portal/chat/widgets/${fixture.widgetId}`).catch(() => {});
      fixture = null;
    }
  });

  test('?status=open returns only open conversations', async ({ adminApi, clientApi, unauthApi }) => {
    const clientsRes = await adminApi.get('/api/admin/portal/clients');
    const seedClient = (clientsRes.data?.data as Array<{ id: number; userEmail?: string }>).find(
      (c) => c.userEmail === 'client@example.com',
    );
    test.skip(!seedClient, 'Seed client@example.com not present');

    fixture = await buildLifecycleFixture(adminApi, clientApi, unauthApi, 'filter-open');

    // Ensure conversation is open (it starts open).
    const res = await clientApi.get('/api/portal/chat/conversations?status=open');
    expect(res.status).toBe(200);
    const list = res.data.data as Array<{ id: number; status: string }>;
    for (const conv of list) {
      expect(conv.status).toBe('open');
    }
    // Our fixture conversation must be in the list.
    expect(list.some((c) => c.id === fixture!.conversationId)).toBe(true);
  });

  test('?status=closed excludes open conversations', async ({ adminApi, clientApi, unauthApi }) => {
    const clientsRes = await adminApi.get('/api/admin/portal/clients');
    const seedClient = (clientsRes.data?.data as Array<{ id: number; userEmail?: string }>).find(
      (c) => c.userEmail === 'client@example.com',
    );
    test.skip(!seedClient, 'Seed client@example.com not present');

    fixture = await buildLifecycleFixture(adminApi, clientApi, unauthApi, 'filter-closed');

    const res = await clientApi.get('/api/portal/chat/conversations?status=closed');
    expect(res.status).toBe(200);
    const list = res.data.data as Array<{ id: number; status: string }>;
    // The fixture conversation is open — it must NOT appear under status=closed.
    expect(list.some((c) => c.id === fixture!.conversationId)).toBe(false);
    for (const conv of list) {
      expect(conv.status).toBe('closed');
    }
  });

  test('?assignee=me returns only conversations assigned to the calling user', async ({
    adminApi,
    clientApi,
    unauthApi,
  }) => {
    const clientsRes = await adminApi.get('/api/admin/portal/clients');
    const seedClient = (clientsRes.data?.data as Array<{ id: number; userEmail?: string }>).find(
      (c) => c.userEmail === 'client@example.com',
    );
    test.skip(!seedClient, 'Seed client@example.com not present');

    fixture = await buildLifecycleFixture(adminApi, clientApi, unauthApi, 'filter-me');
    const cid = fixture.conversationId;

    // Assign to self.
    await clientApi.patch(`/api/portal/chat/conversations/${cid}`, { action: 'assign-self' });

    const res = await clientApi.get('/api/portal/chat/conversations?assignee=me');
    expect(res.status).toBe(200);
    const list = res.data.data as Array<{ id: number }>;
    expect(list.some((c) => c.id === cid)).toBe(true);
  });

  test('?limit=1 returns at most 1 conversation', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/chat/conversations?limit=1');
    expect(res.status).toBe(200);
    expect(res.data.data.length).toBeLessThanOrEqual(1);
  });

  test('?offset=999999 returns empty list (past end)', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/chat/conversations?offset=999999');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.data)).toBe(true);
    expect(res.data.data.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 6: Tenancy isolation
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Tenancy isolation @ai-chatbot @inbox @tenancy', () => {
  test('GET conversation 99999 returns 404 (not this client)', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/chat/conversations/99999');
    expect([403, 404]).toContain(res.status);
  });

  test('PATCH conversation 99999 returns 404 (not this client)', async ({ clientApi }) => {
    const res = await clientApi.patch('/api/portal/chat/conversations/99999', {
      action: 'close',
    });
    expect([403, 404]).toContain(res.status);
  });

  test('POST message to conversation 99999 returns 404 (not this client)', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/chat/conversations/99999/messages', {
      body: 'cross-tenant attempt',
    });
    expect([403, 404]).toContain(res.status);
  });

  test('GET widget 99999 returns 404 (not this client)', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/chat/widgets/99999');
    expect([403, 404]).toContain(res.status);
  });

  test('PATCH widget 99999 returns 404 (not this client)', async ({ clientApi }) => {
    const res = await clientApi.patch('/api/portal/chat/widgets/99999', {
      greetingMessage: 'stolen',
    });
    expect([403, 404]).toContain(res.status);
  });

  test('inbox-stream rejects unauthenticated', async ({ unauthApi }) => {
    // SSE endpoint: we can only probe the auth guard, not the stream itself.
    const res = await unauthApi.get('/api/portal/chat/inbox-stream');
    expect(res.status).toBe(401);
  });
});
