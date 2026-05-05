/**
 * Email campaign send — POST /api/portal/email/campaigns/[id]/send
 *
 * Contract covered:
 *   - 401 unauth
 *   - 404 cross-tenant (cannot send another tenant's campaign)
 *   - 400 when campaign is already sent / sending
 *   - 400 when there are no active subscribers
 *   - happy path:
 *       * iterates active subscribers, posts to api.resend.com (intercepted)
 *       * inserts an email_campaign_sends row per subscriber with the
 *         resend message id
 *       * marks the campaign as 'sent', stamps sentAt, sets totalSent
 *       * the request body sent to Resend mirrors the campaign content
 *         (subject, from, html contains the rendered htmlContent)
 *       * 'List-Unsubscribe' + 'List-Unsubscribe-Post' headers per RFC 8058
 *
 * Resend is intercepted via the global MSW handler (tests/helpers/api-mocks.ts)
 * plus per-test `server.use(...)` overrides that capture the outbound payload.
 */
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { http, HttpResponse } from 'msw';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({
    get: () => undefined,
    set: () => undefined,
    has: () => false,
  })),
}));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { server } from '../../../setup-api';
import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

interface SeedSubOpts { status?: string; email?: string }

async function seedList(ctx: TenantCtx) {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.email_lists (client_id, name)
    VALUES (${ctx.client.id}, ${`list-${Date.now()}`}) RETURNING id
  `;
  return row;
}

async function seedSubscriber(listId: number, opts: SeedSubOpts = {}) {
  const sql = getTestSql();
  const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const [row] = await sql<{ id: number; email: string }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.email_subscribers
      (list_id, email, status, unsubscribe_token)
    VALUES (
      ${listId},
      ${opts.email ?? `sub-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`},
      ${opts.status ?? 'active'},
      ${token}
    ) RETURNING id, email
  `;
  return row;
}

async function seedCampaign(ctx: TenantCtx, listId: number, overrides: { status?: string; html?: string } = {}) {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.email_campaigns
      (client_id, list_id, name, subject, from_name, from_email, html_content, status)
    VALUES (
      ${ctx.client.id}, ${listId},
      'Test Campaign', 'Test Subject', 'Test Sender', 'sender@test.local',
      ${overrides.html ?? '<h1>Hello $RECIP</h1>'},
      ${overrides.status ?? 'draft'}
    ) RETURNING id
  `;
  return row;
}

interface CapturedSend {
  url: string;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

/** Replace the global Resend handler so we can capture every outbound payload. */
function captureResendCalls(): CapturedSend[] {
  const captured: CapturedSend[] = [];
  server.use(
    http.post('https://api.resend.com/emails', async ({ request }) => {
      const body = await request.json() as Record<string, unknown>;
      const headers: Record<string, string> = {};
      request.headers.forEach((v, k) => { headers[k] = v; });
      captured.push({ url: request.url, body, headers });
      return HttpResponse.json({ id: `resend_test_${captured.length}` });
    }),
  );
  return captured;
}

describe('POST /api/portal/email/campaigns/[id]/send @email', () => {
  beforeEach(() => {
    mockedAuth.mockResolvedValue(null);
  });
  afterEach(() => {
    server.resetHandlers();
  });

  it('401 unauthenticated', async () => {
    const route = await import('@/app/api/portal/email/campaigns/[id]/send/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', {
      params: { id: '1' },
    });
    expect(res.status).toBe(401);
  });

  it('404 cross-tenant — cannot send another tenant\'s campaign', async () => {
    const A = await sessionForNewClientUser('email-send-foreign-a');
    const B = await sessionForNewClientUser('email-send-foreign-b');
    const list = await seedList(B);
    await seedSubscriber(list.id);
    const cmp = await seedCampaign(B, list.id);

    const captured = captureResendCalls();
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/email/campaigns/[id]/send/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', {
      params: { id: String(cmp.id) },
    });
    expect(res.status).toBe(404);
    expect(captured).toHaveLength(0);
  });

  it('400 when campaign already sent', async () => {
    const A = await sessionForNewClientUser('email-send-already');
    const list = await seedList(A);
    const cmp = await seedCampaign(A, list.id, { status: 'sent' });

    captureResendCalls();
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/email/campaigns/[id]/send/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', {
      params: { id: String(cmp.id) },
    });
    expect(res.status).toBe(400);
  });

  it('400 when no active subscribers exist on the list', async () => {
    const A = await sessionForNewClientUser('email-send-empty');
    const list = await seedList(A);
    // Only an unsubscribed subscriber.
    await seedSubscriber(list.id, { status: 'unsubscribed' });
    const cmp = await seedCampaign(A, list.id);

    const captured = captureResendCalls();
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/email/campaigns/[id]/send/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', {
      params: { id: String(cmp.id) },
    });
    expect(res.status).toBe(400);
    expect(captured).toHaveLength(0);
  });

  it('happy path: posts to Resend per active subscriber and marks campaign sent', async () => {
    const A = await sessionForNewClientUser('email-send-happy');
    const list = await seedList(A);
    const sub1 = await seedSubscriber(list.id, { email: 'one@test.local' });
    const sub2 = await seedSubscriber(list.id, { email: 'two@test.local' });
    // Inactive subscriber — must NOT be sent to.
    await seedSubscriber(list.id, { status: 'unsubscribed', email: 'three@test.local' });

    const cmp = await seedCampaign(A, list.id, {
      html: '<h1>Inner Marker XYZZY</h1>',
    });

    const captured = captureResendCalls();
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/email/campaigns/[id]/send/route');
    const res = await callHandler<{ success: boolean; data: { sent: number; failed: number; total: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(cmp.id) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.sent).toBe(2);
    expect(res.data?.data.failed).toBe(0);
    expect(res.data?.data.total).toBe(2);

    // Resend received exactly two POSTs, one per active subscriber.
    expect(captured).toHaveLength(2);
    const recipients = captured
      .map(c => c.body.to as string)
      .sort();
    expect(recipients).toEqual([sub1.email, sub2.email].sort());

    // Per-call payload sanity — content matches campaign, headers carry RFC 8058 unsubscribe.
    for (const call of captured) {
      expect(call.body.subject).toBe('Test Subject');
      expect(call.body.from).toBe('Test Sender <sender@test.local>');
      // Wrapped via buildCampaignHtml — must contain the inner marker AND the unsub footer link.
      expect(call.body.html).toContain('XYZZY');
      expect(call.body.html).toContain('Unsubscribe');
      const headers = call.body.headers as Record<string, string>;
      expect(headers['List-Unsubscribe']).toMatch(/^<.*\/api\/email\/unsubscribe\?token=/);
      expect(headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    }

    // DB side-effects: campaign now 'sent' with totalSent=2 + sentAt stamped,
    // and one email_campaign_sends row per recipient with the resend id.
    const sql = getTestSql();
    const [after] = await sql<{ status: string; total_sent: number; sent_at: Date | null }[]>`
      SELECT status, total_sent, sent_at FROM ${sql(TEST_SCHEMA)}.email_campaigns WHERE id = ${cmp.id}
    `;
    expect(after.status).toBe('sent');
    expect(after.total_sent).toBe(2);
    expect(after.sent_at).not.toBeNull();

    const sends = await sql<{ subscriber_id: number; resend_email_id: string }[]>`
      SELECT subscriber_id, resend_email_id FROM ${sql(TEST_SCHEMA)}.email_campaign_sends WHERE campaign_id = ${cmp.id}
    `;
    expect(sends).toHaveLength(2);
    for (const s of sends) {
      expect(s.resend_email_id).toMatch(/^resend_test_/);
    }
  });

  it('skips subscribers that already received this campaign (idempotent re-send)', async () => {
    const A = await sessionForNewClientUser('email-send-idem');
    const list = await seedList(A);
    const sub1 = await seedSubscriber(list.id, { email: 'already@test.local' });
    const sub2 = await seedSubscriber(list.id, { email: 'fresh@test.local' });
    const cmp = await seedCampaign(A, list.id);

    // Pre-record one prior send; the route should skip sub1 and only deliver to sub2.
    const sql = getTestSql();
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.email_campaign_sends (campaign_id, subscriber_id, sent_at)
      VALUES (${cmp.id}, ${sub1.id}, now())
    `;

    const captured = captureResendCalls();
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/email/campaigns/[id]/send/route');
    const res = await callHandler<{ success: boolean; data: { sent: number; total: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(cmp.id) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.sent).toBe(1);
    expect(res.data?.data.total).toBe(1);
    expect(captured).toHaveLength(1);
    expect((captured[0].body.to as string)).toBe(sub2.email);
  });
});
