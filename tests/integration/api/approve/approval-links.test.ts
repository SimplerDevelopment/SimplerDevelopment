/**
 * Integration tests for the PUBLIC approval route — /api/approve/[token].
 *
 * The route accepts a 64-hex token (minted by `lib/mcp/approval-links.ts`)
 * and either returns the link's current state (GET) or records an
 * approve/reject decision (POST). No portal session required — the token is
 * the only credential, and every lookup is scoped to the link's clientId.
 *
 * Coverage:
 *   GET
 *     - unknown token → 404
 *     - invalid token shape → 404
 *     - valid token → serialized link
 *     - past-expiry token auto-marked status=expired on GET
 *   POST approve
 *     - post entity            → published=true, link approved
 *     - pitch_deck entity      → status='published' + slide drafts promoted
 *     - email_campaign entity  → link approved, campaign status untouched
 *     - block_template entity  → draft cleared, draft.* copied to live, version bumped
 *     - pending_change         → applyPendingChange called (mocked), link approved
 *   POST reject
 *     - records rejected, entity untouched
 *   POST error paths
 *     - already-approved → 400
 *     - bad action       → 400
 *     - missing reviewer → 400
 *     - expired link     → 400
 *
 * Mocking strategy: `applyPendingChange` is mocked (same pattern as the
 * authed /api/portal/approvals tests) so we don't need to seed a fully
 * shaped tool payload. Real apply logic has e2e coverage elsewhere.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/mcp/approvals', () => ({
  applyPendingChange: vi.fn().mockResolvedValue({ id: 999, applied: true }),
}));

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';
import { applyPendingChange } from '@/lib/mcp/approvals';
const mockedApply = applyPendingChange as unknown as Mock;

const HEX = '0123456789abcdef';
function randomToken(): string {
  let s = '';
  for (let i = 0; i < 64; i++) s += HEX[Math.floor(Math.random() * 16)];
  return s;
}

interface SeedLinkOpts {
  clientId: number;
  linkType?: 'entity' | 'pending_change';
  entityType: string;
  entityId?: number | null;
  pendingChangeId?: number | null;
  status?: 'pending' | 'approved' | 'rejected' | 'expired';
  expiresAt?: Date | null;
  summary?: string;
}

async function seedLink(opts: SeedLinkOpts): Promise<string> {
  const sql = getTestSql();
  const token = randomToken();
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.mcp_approval_links
      (token, client_id, link_type, entity_type, entity_id, pending_change_id,
       status, summary, expires_at)
    VALUES (
      ${token},
      ${opts.clientId},
      ${opts.linkType ?? 'entity'},
      ${opts.entityType},
      ${opts.entityId ?? null},
      ${opts.pendingChangeId ?? null},
      ${opts.status ?? 'pending'},
      ${opts.summary ?? 'test link'},
      ${opts.expiresAt ?? null}
    )
  `;
  return token;
}

async function seedPost(clientId: number, opts: { published?: boolean } = {}): Promise<number> {
  const sql = getTestSql();
  // Posts need a website. Seed a minimal one for the client.
  const [site] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.websites
      (client_id, name, domain, subdomain, active, deployment_status, public_access)
    VALUES (
      ${clientId},
      ${'test-site-' + clientId},
      ${'test-' + clientId + '.local'},
      ${'test' + clientId},
      true,
      'active',
      true
    )
    RETURNING id
  `;
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.posts
      (website_id, title, slug, post_type, content, published)
    VALUES (
      ${site.id},
      'Approval Test Post',
      ${'approval-test-' + Date.now() + '-' + Math.floor(Math.random() * 1e6)},
      'page',
      ${JSON.stringify({ blocks: [], version: '1.0' })}::json,
      ${opts.published ?? false}
    )
    RETURNING id
  `;
  return row.id;
}

async function seedDeck(
  clientId: number,
  opts: { withDraftSlides?: boolean } = {},
): Promise<number> {
  const sql = getTestSql();
  const slides = opts.withDraftSlides
    ? [
        {
          id: 'cover',
          label: 'Cover',
          blocks: [],
          draft: { pendingCreate: true, blocks: [{ id: 'h1', type: 'heading', level: 1, content: 'Hello' }] },
        },
      ]
    : [];
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.pitch_decks
      (client_id, title, slug, status, slides, format_version)
    VALUES (
      ${clientId},
      'Approval Test Deck',
      ${'approval-deck-' + Date.now() + '-' + Math.floor(Math.random() * 1e6)},
      'draft',
      ${JSON.stringify(slides)}::json,
      2
    )
    RETURNING id
  `;
  return row.id;
}

async function seedCampaign(clientId: number): Promise<number> {
  const sql = getTestSql();
  const [list] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.email_lists (client_id, name)
    VALUES (${clientId}, 'Approval Test List')
    RETURNING id
  `;
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.email_campaigns
      (client_id, list_id, name, subject, from_name, from_email, status)
    VALUES (
      ${clientId},
      ${list.id},
      'Approval Test Campaign',
      'Test subject',
      'Test',
      'test@example.com',
      'draft'
    )
    RETURNING id
  `;
  return row.id;
}

async function seedBlockTemplate(clientId: number): Promise<number> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.block_templates
      (client_id, name, slug, category, scope, blocks, draft, version)
    VALUES (
      ${clientId},
      'Approval Test Template',
      ${'approval-tpl-' + Date.now() + '-' + Math.floor(Math.random() * 1e6)},
      'marketing',
      'block',
      ${JSON.stringify([])}::json,
      ${JSON.stringify({
        pendingCreate: true,
        blocks: [{ id: 'h1', type: 'heading', content: 'Hi' }],
        name: 'Approval Test Template',
        category: 'marketing',
        scope: 'block',
      })}::json,
      1
    )
    RETURNING id
  `;
  return row.id;
}

async function seedPendingChange(clientId: number): Promise<number> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.mcp_pending_changes
      (client_id, entity_type, operation, summary, payload, status)
    VALUES (
      ${clientId},
      'post',
      'update',
      'Update post',
      ${JSON.stringify({ id: 1, excerpt: 'x' })}::json,
      'pending'
    )
    RETURNING id
  `;
  return row.id;
}

async function getRoute() {
  return await import('@/app/api/approve/[token]/route');
}

describe('GET /api/approve/[token] @approval-links', () => {
  let A: TenantCtx;
  beforeEach(async () => {
    A = await sessionForNewClientUser('approval-get');
  });

  it('returns 404 for unknown token (valid 64-hex shape)', async () => {
    const route = await getRoute();
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { token: randomToken() } },
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 for invalid token shape', async () => {
    const route = await getRoute();
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { token: 'not-a-real-token' } },
    );
    expect(res.status).toBe(404);
  });

  it('returns serialized link for a valid pending token', async () => {
    const postId = await seedPost(A.client.id);
    const token = await seedLink({
      clientId: A.client.id,
      entityType: 'post',
      entityId: postId,
      summary: 'GET test',
    });
    const route = await getRoute();
    const res = await callHandler<{ success: boolean; data: { status: string; summary: string } }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { token } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data.status).toBe('pending');
    expect(res.data?.data.summary).toBe('GET test');
  });

  it('auto-marks expired links on GET', async () => {
    const postId = await seedPost(A.client.id);
    const token = await seedLink({
      clientId: A.client.id,
      entityType: 'post',
      entityId: postId,
      expiresAt: new Date(Date.now() - 60_000),
    });
    const route = await getRoute();
    const res = await callHandler<{ success: boolean; data: { status: string } }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { token } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.status).toBe('expired');

    // Persisted to DB
    const sql = getTestSql();
    const [row] = await sql<{ status: string }[]>`
      SELECT status FROM ${sql(TEST_SCHEMA)}.mcp_approval_links WHERE token = ${token}
    `;
    expect(row.status).toBe('expired');
  });
});

describe('POST /api/approve/[token] approve paths @approval-links', () => {
  let A: TenantCtx;
  beforeEach(async () => {
    A = await sessionForNewClientUser('approval-approve');
    mockedApply.mockClear();
  });

  it('approves a post → published=true and link approved', async () => {
    const postId = await seedPost(A.client.id, { published: false });
    const token = await seedLink({
      clientId: A.client.id,
      entityType: 'post',
      entityId: postId,
    });
    const route = await getRoute();
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { token }, body: { action: 'approve', reviewerName: 'Bob' } },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const [post] = await sql<{ published: boolean; published_at: Date | null }[]>`
      SELECT published, published_at FROM ${sql(TEST_SCHEMA)}.posts WHERE id = ${postId}
    `;
    expect(post.published).toBe(true);
    expect(post.published_at).not.toBeNull();

    const [link] = await sql<{ status: string; reviewer_name: string }[]>`
      SELECT status, reviewer_name FROM ${sql(TEST_SCHEMA)}.mcp_approval_links WHERE token = ${token}
    `;
    expect(link.status).toBe('approved');
    expect(link.reviewer_name).toBe('Bob');
  });

  it('approves a pitch_deck → status=published and slide drafts promoted', async () => {
    const deckId = await seedDeck(A.client.id, { withDraftSlides: true });
    const token = await seedLink({
      clientId: A.client.id,
      entityType: 'pitch_deck',
      entityId: deckId,
    });
    const route = await getRoute();
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { token }, body: { action: 'approve', reviewerName: 'Bob' } },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const [deck] = await sql<{ status: string; slides: unknown[] }[]>`
      SELECT status, slides FROM ${sql(TEST_SCHEMA)}.pitch_decks WHERE id = ${deckId}
    `;
    expect(deck.status).toBe('published');
    // Slide draft should be promoted: live blocks now match the draft, no `draft` key.
    const slides = deck.slides as Array<{ id: string; blocks: unknown[]; draft?: unknown }>;
    expect(slides).toHaveLength(1);
    expect(slides[0].draft).toBeUndefined();
    expect(slides[0].blocks).toHaveLength(1);
  });

  it('approves an email_campaign → link approved, campaign status untouched', async () => {
    const campaignId = await seedCampaign(A.client.id);
    const token = await seedLink({
      clientId: A.client.id,
      entityType: 'email_campaign',
      entityId: campaignId,
    });
    const route = await getRoute();
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { token }, body: { action: 'approve', reviewerName: 'Bob' } },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const [campaign] = await sql<{ status: string }[]>`
      SELECT status FROM ${sql(TEST_SCHEMA)}.email_campaigns WHERE id = ${campaignId}
    `;
    expect(campaign.status).toBe('draft');
  });

  it('approves a block_template → draft cleared, blocks copied to live, version bumped', async () => {
    const tplId = await seedBlockTemplate(A.client.id);
    const token = await seedLink({
      clientId: A.client.id,
      entityType: 'block_template',
      entityId: tplId,
    });
    const route = await getRoute();
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { token }, body: { action: 'approve', reviewerName: 'Bob' } },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const [tpl] = await sql<{ version: number; draft: unknown; blocks: unknown[] }[]>`
      SELECT version, draft, blocks FROM ${sql(TEST_SCHEMA)}.block_templates WHERE id = ${tplId}
    `;
    expect(tpl.version).toBe(2);
    expect(tpl.draft).toBeNull();
    expect(tpl.blocks).toHaveLength(1);
  });

  it('approves a pending_change → applyPendingChange called, link approved', async () => {
    const pcId = await seedPendingChange(A.client.id);
    const token = await seedLink({
      clientId: A.client.id,
      linkType: 'pending_change',
      entityType: 'post',
      pendingChangeId: pcId,
    });
    const route = await getRoute();
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { token }, body: { action: 'approve', reviewerName: 'Bob' } },
    );
    expect(res.status).toBe(200);
    expect(mockedApply).toHaveBeenCalledTimes(1);

    const sql = getTestSql();
    const [pc] = await sql<{ status: string; applied_at: Date | null }[]>`
      SELECT status, applied_at FROM ${sql(TEST_SCHEMA)}.mcp_pending_changes WHERE id = ${pcId}
    `;
    expect(pc.status).toBe('approved');
    expect(pc.applied_at).not.toBeNull();
  });
});

describe('POST /api/approve/[token] reject path @approval-links', () => {
  let A: TenantCtx;
  beforeEach(async () => {
    A = await sessionForNewClientUser('approval-reject');
  });

  it('rejects a post → status=rejected, entity untouched', async () => {
    const postId = await seedPost(A.client.id, { published: false });
    const token = await seedLink({
      clientId: A.client.id,
      entityType: 'post',
      entityId: postId,
    });
    const route = await getRoute();
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { token }, body: { action: 'reject', reviewerName: 'Bob', reviewNote: 'no' } },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const [post] = await sql<{ published: boolean }[]>`
      SELECT published FROM ${sql(TEST_SCHEMA)}.posts WHERE id = ${postId}
    `;
    expect(post.published).toBe(false);

    const [link] = await sql<{ status: string; review_note: string }[]>`
      SELECT status, review_note FROM ${sql(TEST_SCHEMA)}.mcp_approval_links WHERE token = ${token}
    `;
    expect(link.status).toBe('rejected');
    expect(link.review_note).toBe('no');
  });
});

describe('POST /api/approve/[token] error paths @approval-links', () => {
  let A: TenantCtx;
  beforeEach(async () => {
    A = await sessionForNewClientUser('approval-errors');
  });

  it('400 when link is already approved', async () => {
    const postId = await seedPost(A.client.id);
    const token = await seedLink({
      clientId: A.client.id,
      entityType: 'post',
      entityId: postId,
      status: 'approved',
    });
    const route = await getRoute();
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { token }, body: { action: 'approve', reviewerName: 'Bob' } },
    );
    expect(res.status).toBe(400);
  });

  it('400 for bad action', async () => {
    const postId = await seedPost(A.client.id);
    const token = await seedLink({
      clientId: A.client.id,
      entityType: 'post',
      entityId: postId,
    });
    const route = await getRoute();
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { token }, body: { action: 'maybe', reviewerName: 'Bob' } },
    );
    expect(res.status).toBe(400);
  });

  it('400 when reviewerName missing', async () => {
    const postId = await seedPost(A.client.id);
    const token = await seedLink({
      clientId: A.client.id,
      entityType: 'post',
      entityId: postId,
    });
    const route = await getRoute();
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { token }, body: { action: 'approve' } },
    );
    expect(res.status).toBe(400);
  });

  it('400 when link has expired', async () => {
    const postId = await seedPost(A.client.id);
    const token = await seedLink({
      clientId: A.client.id,
      entityType: 'post',
      entityId: postId,
      expiresAt: new Date(Date.now() - 60_000),
    });
    const route = await getRoute();
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { token }, body: { action: 'approve', reviewerName: 'Bob' } },
    );
    expect(res.status).toBe(400);
  });
});
