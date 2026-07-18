/**
 * Block-builder send path — POST /api/portal/email/campaigns/[id]/send
 *
 * Locks the new useBlockEditor=true behaviour against the existing
 * htmlContent/template path. Mirrors the style of `email/campaign-send.test.ts`
 * but focuses on render-cache reuse + per-recipient unsubscribe substitution.
 *
 * Assertions:
 *   - With useBlockEditor=true + content_blocks set, the campaign renders ONCE
 *     via the cache (a single email_renders row appears for the campaign).
 *   - Multi-recipient sends substitute {{UNSUBSCRIBE_URL}} per-recipient — each
 *     recipient gets a distinct unsubscribe URL, embedded in the body.
 *   - The Resend payload includes a `text` field (multipart fallback).
 *   - Template-based send (useBlockEditor=false) still works and writes NO
 *     email_renders row — i.e. no regression for the legacy path.
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

interface CapturedSend {
  body: Record<string, unknown>;
}

function captureResendCalls(): CapturedSend[] {
  const captured: CapturedSend[] = [];
  server.use(
    http.post('https://api.resend.com/emails', async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      captured.push({ body });
      return HttpResponse.json({ id: `resend_test_${captured.length}` });
    }),
  );
  return captured;
}

async function seedList(ctx: TenantCtx) {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.email_lists (client_id, name)
    VALUES (${ctx.client.id}, ${`list-${Date.now()}-${Math.floor(Math.random() * 1e6)}`}) RETURNING id
  `;
  return row;
}

async function seedSubscriber(listId: number, email: string) {
  const sql = getTestSql();
  const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const [row] = await sql<{ id: number; email: string; unsubscribe_token: string }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.email_subscribers
      (list_id, email, status, unsubscribe_token)
    VALUES (${listId}, ${email}, 'active', ${token})
    RETURNING id, email, unsubscribe_token
  `;
  return row;
}

const blockTree = (): Block[] => [
  { id: 'h', type: 'heading', order: 0, content: 'Inner Marker BLOCKMARK', level: 1 },
  { id: 't', type: 'text', order: 1, content: 'Body copy goes here.' },
  { id: 'f', type: 'email-footer', order: 2, companyName: 'Acme Test Co' },
];

async function seedBlockCampaign(
  ctx: TenantCtx,
  listId: number,
  overrides: { status?: string } = {},
) {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.email_campaigns
      (
        client_id, list_id, name, subject, from_name, from_email,
        html_content, content_blocks, use_block_editor, status, preview_text
      )
    VALUES (
      ${ctx.client.id}, ${listId},
      'Block Send', 'Block Send Subject', 'Sender', 'sender@test.local',
      ${'<p>legacy fallback</p>'},
      ${JSON.stringify(blockTree())}::json,
      true,
      ${overrides.status ?? 'draft'},
      'preheader text'
    ) RETURNING id
  `;
  return row;
}

async function seedTemplateCampaign(
  ctx: TenantCtx,
  listId: number,
) {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.email_campaigns
      (
        client_id, list_id, name, subject, from_name, from_email,
        html_content, use_block_editor, status
      )
    VALUES (
      ${ctx.client.id}, ${listId},
      'Template Send', 'Template Subject', 'Sender', 'sender@test.local',
      ${'<h1>Template Marker TPLZZ</h1>'},
      false,
      'draft'
    ) RETURNING id
  `;
  return row;
}

describe('POST /api/portal/email/campaigns/[id]/send (block builder) @email', () => {
  beforeEach(() => { mockedAuth.mockResolvedValue(null); });
  afterEach(() => { server.resetHandlers(); });

  it('renders ONCE via the cache and reuses HTML across recipients', async () => {
    const A = await sessionForNewClientUser('block-send-once');
    const list = await seedList(A);
    const subA = await seedSubscriber(list.id, 'one@test.local');
    const subB = await seedSubscriber(list.id, 'two@test.local');
    const subC = await seedSubscriber(list.id, 'three@test.local');
    const cmp = await seedBlockCampaign(A, list.id);

    const captured = captureResendCalls();
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/email/campaigns/[id]/send/route');
    const res = await callHandler<{ success: boolean; data: { sent: number; total: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(cmp.id) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.sent).toBe(3);
    expect(captured).toHaveLength(3);

    // Cache invariant: exactly one email_renders row created for this campaign,
    // even though 3 recipients were sent to.
    const sql = getTestSql();
    const renders = await sql<{ id: number; blocks_hash: string; html: string }[]>`
      SELECT id, blocks_hash, html FROM ${sql(TEST_SCHEMA)}.email_renders
      WHERE campaign_id = ${cmp.id}
    `;
    expect(renders).toHaveLength(1);
    expect(renders[0].blocks_hash).toMatch(/^[0-9a-f]{64}$/);

    // The cached HTML must still contain the placeholder — substitution happens
    // per-recipient at send time, not at cache write time.
    expect(renders[0].html).toContain('{{UNSUBSCRIBE_URL}}');

    // Recipient list lines up.
    const recipients = captured.map(c => c.body.to as string).sort();
    expect(recipients).toEqual([subA.email, subB.email, subC.email].sort());
  });

  it('substitutes {{UNSUBSCRIBE_URL}} per recipient — each outbound email carries a distinct unsubscribe URL', async () => {
    const A = await sessionForNewClientUser('block-send-unsub');
    const list = await seedList(A);
    const subA = await seedSubscriber(list.id, 'a@test.local');
    const subB = await seedSubscriber(list.id, 'b@test.local');
    const cmp = await seedBlockCampaign(A, list.id);

    const captured = captureResendCalls();
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/email/campaigns/[id]/send/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', {
      params: { id: String(cmp.id) },
    });
    expect(res.status).toBe(200);
    expect(captured).toHaveLength(2);

    // Outbound HTML must NOT carry the placeholder anymore.
    for (const call of captured) {
      const html = call.body.html as string;
      expect(html).not.toContain('{{UNSUBSCRIBE_URL}}');
      // Each recipient's body carries an unsubscribe URL with their own token.
      expect(html).toContain('/api/email/unsubscribe?token=');
    }

    // The two outbound HTMLs must DIFFER from each other (different tokens).
    const htmlA = captured.find(c => c.body.to === subA.email)!.body.html as string;
    const htmlB = captured.find(c => c.body.to === subB.email)!.body.html as string;
    expect(htmlA).not.toBe(htmlB);

    // Each recipient's HTML embeds their own token, not the other's.
    expect(htmlA).toContain(`token=${subA.unsubscribe_token}`);
    expect(htmlA).not.toContain(`token=${subB.unsubscribe_token}`);
    expect(htmlB).toContain(`token=${subB.unsubscribe_token}`);
    expect(htmlB).not.toContain(`token=${subA.unsubscribe_token}`);

    // RFC 8058 List-Unsubscribe header is also recipient-specific.
    const headerA = (captured.find(c => c.body.to === subA.email)!.body.headers as Record<string, string>)['List-Unsubscribe'];
    const headerB = (captured.find(c => c.body.to === subB.email)!.body.headers as Record<string, string>)['List-Unsubscribe'];
    expect(headerA).toContain(subA.unsubscribe_token);
    expect(headerB).toContain(subB.unsubscribe_token);
    expect(headerA).not.toBe(headerB);
  });

  it('outbound payload includes a non-empty multipart text body', async () => {
    const A = await sessionForNewClientUser('block-send-text');
    const list = await seedList(A);
    await seedSubscriber(list.id, 'text-recipient@test.local');
    const cmp = await seedBlockCampaign(A, list.id);

    const captured = captureResendCalls();
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/email/campaigns/[id]/send/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', {
      params: { id: String(cmp.id) },
    });
    expect(res.status).toBe(200);
    expect(captured).toHaveLength(1);

    const text = captured[0].body.text as string;
    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThan(0);
    // The plain-text fallback must reflect the heading content.
    expect(text).toContain('Inner Marker BLOCKMARK');
    // …and no raw HTML tags.
    expect(text).not.toMatch(/<\/?[a-z]+/i);
  });

  it('useBlockEditor=false (legacy template path) still works and writes NO email_renders row', async () => {
    const A = await sessionForNewClientUser('block-send-legacy');
    const list = await seedList(A);
    await seedSubscriber(list.id, 'legacy@test.local');
    const cmp = await seedTemplateCampaign(A, list.id);

    const captured = captureResendCalls();
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/email/campaigns/[id]/send/route');
    const res = await callHandler<{ success: boolean; data: { sent: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(cmp.id) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.sent).toBe(1);
    expect(captured).toHaveLength(1);
    expect((captured[0].body.html as string)).toContain('TPLZZ');

    // The legacy template path must NOT write to email_renders.
    const sql = getTestSql();
    const renders = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.email_renders WHERE campaign_id = ${cmp.id}
    `;
    expect(renders).toHaveLength(0);
  });
});
