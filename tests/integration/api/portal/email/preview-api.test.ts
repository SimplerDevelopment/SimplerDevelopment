/**
 * Email block-builder preview API — POST /api/portal/email/preview
 *
 * Contract:
 *   - 401 unauthenticated
 *   - 404 cross-tenant (campaignId belongs to another client)
 *   - happy path:
 *       * returns { html, text, subject, blocksHash, cached: false }
 *       * second POST with the same blocks → cached: true, same blocksHash + html
 *       * mutating any block flips blocksHash and cached: false
 *   - sendTest: true with mocked Resend → testSent payload includes the
 *     current user's email; outbound POST hits api.resend.com exactly once.
 *
 * Resend is intercepted via the global MSW handler set up in
 * tests/setup-api.ts; per-test we override it with `server.use(...)` to
 * capture the outbound payload (mirrors the campaign-send.test.ts pattern).
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

import { server } from '../../../../setup-api';
import { callHandler } from '../../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../../helpers/test-db';
import type { Block } from '@/types/blocks';

interface PreviewSuccessData {
  html: string;
  text: string;
  subject: string | null;
  blocksHash: string;
  cached: boolean;
  testSent?: { to: string; ok: boolean };
}

interface PreviewSuccess {
  success: true;
  data: PreviewSuccessData;
}

interface PreviewFailure {
  success: false;
  message: string;
}

type PreviewResponse = PreviewSuccess | PreviewFailure;

async function enableEmail(ctx: TenantCtx) {
  const sql = getTestSql();
  const slug = `email-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const [svc] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.services (name, slug, category, price, billing_cycle)
    VALUES ('Email', ${slug}, 'email', 0, 'monthly') RETURNING id
  `;
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_services (client_id, service_id, status)
    VALUES (${ctx.client.id}, ${svc.id}, 'active')
  `;
}

async function seedList(ctx: TenantCtx) {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.email_lists (client_id, name)
    VALUES (${ctx.client.id}, ${`list-${Date.now()}-${Math.floor(Math.random() * 1e6)}`}) RETURNING id
  `;
  return row;
}

async function seedCampaign(ctx: TenantCtx, listId: number) {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.email_campaigns
      (client_id, list_id, name, subject, from_name, from_email, html_content, status, use_block_editor)
    VALUES (
      ${ctx.client.id}, ${listId},
      'Preview Test', 'Hello', 'Sender', 'sender@test.local',
      '<p>placeholder</p>', 'draft', true
    ) RETURNING id
  `;
  return row;
}

const sampleBlocks = (): Block[] => [
  { id: 'h1', type: 'heading', order: 0, content: 'Welcome XYZZY', level: 1 },
  { id: 't1', type: 'text', order: 1, content: 'Body copy.' },
  { id: 'b1', type: 'button', order: 2, text: 'Go', url: 'https://example.test/cta' },
];

interface CapturedSend {
  url: string;
  body: Record<string, unknown>;
}

function captureResendCalls(): CapturedSend[] {
  const captured: CapturedSend[] = [];
  server.use(
    http.post('https://api.resend.com/emails', async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      captured.push({ url: request.url, body });
      return HttpResponse.json({ id: `resend_test_${captured.length}` });
    }),
  );
  return captured;
}

describe('POST /api/portal/email/preview @email', () => {
  beforeEach(() => {
    mockedAuth.mockResolvedValue(null);
  });
  afterEach(() => {
    server.resetHandlers();
  });

  it('401 unauthenticated', async () => {
    const route = await import('@/app/api/portal/email/preview/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', {
      body: { blocks: sampleBlocks() },
    });
    expect(res.status).toBe(401);
  });

  it('returns rendered html/text/blocksHash with cached:false on first call (no campaignId)', async () => {
    const A = await sessionForNewClientUser('preview-fresh');
    await enableEmail(A);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/email/preview/route');
    const res = await callHandler<PreviewResponse>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { blocks: sampleBlocks(), subject: 'Hello' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    if (!res.data || !res.data.success) throw new Error('expected success');
    const { html, text, blocksHash, cached } = res.data.data;
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('Welcome XYZZY');
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain('Welcome XYZZY');
    expect(blocksHash).toMatch(/^[0-9a-f]{64}$/);
    // No campaignId path → never reads from email_renders → cached must be false.
    expect(cached).toBe(false);
  });

  it('with a campaignId, second call with the same blocks returns cached:true + same blocksHash + same html', async () => {
    const A = await sessionForNewClientUser('preview-cache-hit');
    await enableEmail(A);
    const list = await seedList(A);
    const cmp = await seedCampaign(A, list.id);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/email/preview/route');
    const blocks = sampleBlocks();
    const first = await callHandler<PreviewResponse>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { blocks, subject: 'Hello', campaignId: cmp.id } },
    );
    expect(first.status).toBe(200);
    if (!first.data || !first.data.success) throw new Error('first call failed');
    expect(first.data.data.cached).toBe(false);

    const second = await callHandler<PreviewResponse>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { blocks, subject: 'Hello', campaignId: cmp.id } },
    );
    expect(second.status).toBe(200);
    if (!second.data || !second.data.success) throw new Error('second call failed');
    expect(second.data.data.cached).toBe(true);
    expect(second.data.data.blocksHash).toBe(first.data.data.blocksHash);
    expect(second.data.data.html).toBe(first.data.data.html);

    // And exactly one row landed in email_renders for this campaign.
    const sql = getTestSql();
    const rows = await sql<{ id: number; blocks_hash: string }[]>`
      SELECT id, blocks_hash FROM ${sql(TEST_SCHEMA)}.email_renders
      WHERE campaign_id = ${cmp.id}
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].blocks_hash).toBe(first.data.data.blocksHash);
  });

  it('mutating any block flips blocksHash and produces cached:false on the modified call', async () => {
    const A = await sessionForNewClientUser('preview-cache-miss');
    await enableEmail(A);
    const list = await seedList(A);
    const cmp = await seedCampaign(A, list.id);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/email/preview/route');
    const baseline = await callHandler<PreviewResponse>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { blocks: sampleBlocks(), campaignId: cmp.id } },
    );
    if (!baseline.data || !baseline.data.success) throw new Error('baseline failed');

    const edited = sampleBlocks();
    edited[0] = { id: 'h1', type: 'heading', order: 0, content: 'Different headline', level: 1 };

    const after = await callHandler<PreviewResponse>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { blocks: edited, campaignId: cmp.id } },
    );
    if (!after.data || !after.data.success) throw new Error('after failed');
    expect(after.data.data.blocksHash).not.toBe(baseline.data.data.blocksHash);
    expect(after.data.data.cached).toBe(false);
    expect(after.data.data.html).toContain('Different headline');

    // Two distinct cache rows now exist for this campaign — one per blocks_hash.
    const sql = getTestSql();
    const rows = await sql<{ blocks_hash: string }[]>`
      SELECT blocks_hash FROM ${sql(TEST_SCHEMA)}.email_renders
      WHERE campaign_id = ${cmp.id}
    `;
    const hashes = new Set(rows.map(r => r.blocks_hash));
    expect(hashes.size).toBe(2);
  });

  it('sendTest: true + mocked Resend → testSent.to = current user email; one outbound Resend POST', async () => {
    const A = await sessionForNewClientUser('preview-sendtest');
    await enableEmail(A);
    mockedAuth.mockResolvedValue(A.session);

    const captured = captureResendCalls();

    const route = await import('@/app/api/portal/email/preview/route');
    const res = await callHandler<PreviewResponse>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { blocks: sampleBlocks(), subject: 'Hello', sendTest: true } },
    );
    expect(res.status).toBe(200);
    if (!res.data || !res.data.success) throw new Error('expected success');
    const { testSent } = res.data.data;
    expect(testSent).toBeDefined();
    expect(testSent?.ok).toBe(true);
    expect(testSent?.to).toBe(A.user.email);

    expect(captured).toHaveLength(1);
    expect(captured[0].body.to).toBe(A.user.email);
    expect(captured[0].body.subject).toMatch(/^\[TEST\]/);
    // The outbound HTML must NOT still carry the placeholder unsubscribe token —
    // the test path swaps it for a placeholder URL before sending.
    expect(captured[0].body.html as string).not.toContain('{{UNSUBSCRIBE_URL}}');
  });

  it('404 cross-tenant — campaignId from another client', async () => {
    const A = await sessionForNewClientUser('preview-cross-a');
    const B = await sessionForNewClientUser('preview-cross-b');
    await enableEmail(A);
    await enableEmail(B);
    const list = await seedList(B);
    const cmp = await seedCampaign(B, list.id);

    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/email/preview/route');
    const res = await callHandler<PreviewResponse>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { blocks: sampleBlocks(), campaignId: cmp.id } },
    );
    expect(res.status).toBe(404);
    if (res.data && !res.data.success) {
      expect(res.data.message).toMatch(/not found/i);
    }

    // The route returned before persisting → no cache row for the foreign campaign.
    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.email_renders WHERE campaign_id = ${cmp.id}
    `;
    expect(rows).toHaveLength(0);
  });
});
