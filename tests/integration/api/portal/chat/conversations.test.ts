/**
 * Portal-side chat conversations:
 *   - GET  /api/portal/chat/conversations         — tenancy-scoped listing
 *   - PATCH /api/portal/chat/conversations/[id]   — assign-self / close transitions
 *   - Closed conversation rejects subsequent visitor messages
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
import { issueVisitorToken } from '@/lib/chat/token';
import { __resetRateLimit } from '@/lib/chat/rate-limit';

async function seedSiteAndWidget(ctx: TenantCtx, label = 'pcv'): Promise<{ widgetId: number; siteId: number }> {
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
  return { widgetId: widget.id, siteId: site.id };
}

async function seedConversation(
  ctx: TenantCtx,
  widgetId: number,
  opts: { status?: 'open' | 'assigned' | 'closed'; visitorName?: string } = {},
): Promise<{ id: number; visitorId: string }> {
  const sql = getTestSql();
  const visitorId = `v-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.chat_conversations (
      widget_id, client_id, visitor_id, visitor_name, status, last_message_at
    ) VALUES (
      ${widgetId}, ${ctx.client.id}, ${visitorId},
      ${opts.visitorName ?? null}, ${opts.status ?? 'open'}, NOW()
    )
    RETURNING id
  `;
  return { id: row.id, visitorId };
}

describe('GET /api/portal/chat/conversations @chat @portal @tenancy', () => {
  beforeEach(() => { mockedAuth.mockReset(); __resetRateLimit(); });

  it('401 unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/chat/conversations/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      {},
    );
    expect(res.status).toBe(401);
  });

  it('lists only conversations belonging to the active client (tenancy)', async () => {
    const A = await sessionForNewClientUser('pcv-a');
    const B = await sessionForNewClientUser('pcv-b');
    const wA = await seedSiteAndWidget(A, 'a');
    const wB = await seedSiteAndWidget(B, 'b');
    const cA1 = await seedConversation(A, wA.widgetId, { visitorName: 'A1' });
    const cA2 = await seedConversation(A, wA.widgetId, { visitorName: 'A2' });
    const cB1 = await seedConversation(B, wB.widgetId, { visitorName: 'B1' });

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/chat/conversations/route');
    const res = await callHandler<{
      success: boolean;
      data: { id: number; clientId: number; visitorName: string | null }[];
    }>(
      route as unknown as Record<string, unknown>, 'GET',
      {},
    );
    expect(res.status).toBe(200);
    const ids = (res.data?.data ?? []).map(r => r.id).sort();
    expect(ids).toContain(cA1.id);
    expect(ids).toContain(cA2.id);
    expect(ids).not.toContain(cB1.id);
    // Every row must be scoped to A.
    for (const row of res.data?.data ?? []) {
      expect(row.clientId).toBe(A.client.id);
    }
  });

  it('?status=open filter narrows results', async () => {
    const A = await sessionForNewClientUser('pcv-status');
    const w = await seedSiteAndWidget(A, 'status');
    const open = await seedConversation(A, w.widgetId, { status: 'open' });
    await seedConversation(A, w.widgetId, { status: 'closed' });

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/chat/conversations/route');
    const res = await callHandler<{ data: { id: number; status: string }[] }>(
      route as unknown as Record<string, unknown>, 'GET',
      { query: { status: 'open' } },
    );
    expect(res.status).toBe(200);
    const ids = (res.data?.data ?? []).map(r => r.id);
    expect(ids).toContain(open.id);
    for (const row of res.data?.data ?? []) {
      expect(row.status).toBe('open');
    }
  });
});

describe('PATCH /api/portal/chat/conversations/[id] @chat @portal', () => {
  beforeEach(() => { mockedAuth.mockReset(); });

  it('assign-self moves status → assigned and stamps assignedUserId to caller', async () => {
    const A = await sessionForNewClientUser('pcv-assign');
    const w = await seedSiteAndWidget(A, 'assign');
    const conv = await seedConversation(A, w.widgetId);

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/chat/conversations/[id]/route');
    const res = await callHandler<{
      success: boolean;
      data: { status: string; assignedUserId: number | null };
    }>(
      route as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(conv.id) }, body: { action: 'assign-self' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.status).toBe('assigned');
    expect(res.data?.data.assignedUserId).toBe(A.user.id);
  });

  it('close sets status=closed and stamps closedAt; visitor cannot post afterwards', async () => {
    __resetRateLimit();
    const A = await sessionForNewClientUser('pcv-close');
    const w = await seedSiteAndWidget(A, 'close');
    const conv = await seedConversation(A, w.widgetId);

    mockedAuth.mockResolvedValue(A.session);
    const patchRoute = await import('@/app/api/portal/chat/conversations/[id]/route');
    const closed = await callHandler<{ success: boolean; data: { status: string } }>(
      patchRoute as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(conv.id) }, body: { action: 'close' } },
    );
    expect(closed.status).toBe(200);
    expect(closed.data?.data.status).toBe('closed');

    const sql = getTestSql();
    const [row] = await sql<{ closed_at: Date | null; status: string }[]>`
      SELECT closed_at, status FROM ${sql(TEST_SCHEMA)}.chat_conversations WHERE id = ${conv.id}
    `;
    expect(row.status).toBe('closed');
    expect(row.closed_at).toBeTruthy();

    // Now have the visitor try to post — must be rejected.
    const messagesRoute = await import('@/app/api/public/chat/messages/route');
    const visitorRes = await callHandler<{ success: boolean; message: string }>(
      messagesRoute as unknown as Record<string, unknown>, 'POST',
      { body: {
        conversationId: conv.id,
        ephemeralToken: issueVisitorToken(conv.id),
        body: 'still here?',
      } },
    );
    expect(visitorRes.status).toBe(409);
    expect(visitorRes.data?.message).toMatch(/closed/i);
  });

  it('404 when the conversation belongs to a different tenant', async () => {
    const A = await sessionForNewClientUser('pcv-cross-a');
    const B = await sessionForNewClientUser('pcv-cross-b');
    const wB = await seedSiteAndWidget(B, 'cross-b');
    const convB = await seedConversation(B, wB.widgetId);

    mockedAuth.mockResolvedValue(A.session); // A tries to assign B's conversation
    const route = await import('@/app/api/portal/chat/conversations/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(convB.id) }, body: { action: 'assign-self' } },
    );
    expect(res.status).toBe(404);
  });

  it('400 on unknown action', async () => {
    const A = await sessionForNewClientUser('pcv-act');
    const w = await seedSiteAndWidget(A, 'act');
    const conv = await seedConversation(A, w.widgetId);

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/chat/conversations/[id]/route');
    const res = await callHandler<{ message: string }>(
      route as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(conv.id) }, body: { action: 'launch-the-rocket' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/unknown/i);
  });
});
