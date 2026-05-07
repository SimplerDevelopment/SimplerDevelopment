/**
 * POST /api/realtime/token — short-lived JWT minting for realtime collab.
 *
 * Contract:
 *   - 401 unauthenticated.
 *   - 400 missing/unknown entityType.
 *   - 400 missing entityId.
 *   - 404 entity does not exist.
 *   - 404 cross-tenant (entity belongs to a different client).
 *   - 200 own entity: returns { token, wsUrl, expiresAt, docKey }.
 *   - JWT decodes & verifies with REALTIME_JWT_SECRET, contains
 *     clientId, sub (userId), docKey, exp ~5min in the future.
 *   - Covers entityType: 'post', 'deck', 'email'.
 */

// Set the JWT secret BEFORE importing the route module — the route reads it
// at handler-invocation time via process.env, so any value set in tests is
// picked up. Using a deterministic value keeps the verify step trivial.
process.env.REALTIME_JWT_SECRET = 'test-realtime-secret-do-not-ship';

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import jwt from 'jsonwebtoken';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

const SECRET = 'test-realtime-secret-do-not-ship';

interface JwtPayload {
  sub: string;
  clientId: number;
  docKey: string;
  exp: number;
  iat: number;
  scope: string;
  name?: string;
}

async function seedWebsite(ctx: TenantCtx): Promise<{ id: number }> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_websites (client_id, name)
    VALUES (${ctx.client.id}, ${`site-${Date.now()}-${Math.floor(Math.random() * 9999)}`})
    RETURNING id
  `;
  return row;
}

async function seedPost(ctx: TenantCtx): Promise<{ id: number; websiteId: number }> {
  const website = await seedWebsite(ctx);
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.posts (title, slug, content, website_id)
    VALUES (
      ${`post-${Date.now()}-${Math.floor(Math.random() * 9999)}`},
      ${`slug-${Date.now()}-${Math.floor(Math.random() * 9999)}`},
      '',
      ${website.id}
    )
    RETURNING id
  `;
  return { id: row.id, websiteId: website.id };
}

async function seedDeck(ctx: TenantCtx): Promise<{ id: number }> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.pitch_decks (client_id, title, slug)
    VALUES (
      ${ctx.client.id},
      ${`deck-${Date.now()}-${Math.floor(Math.random() * 9999)}`},
      ${`deck-slug-${Date.now()}-${Math.floor(Math.random() * 9999)}`}
    )
    RETURNING id
  `;
  return row;
}

async function seedEmailList(ctx: TenantCtx): Promise<{ id: number }> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.email_lists (name, client_id)
    VALUES (${`list-${Date.now()}-${Math.floor(Math.random() * 9999)}`}, ${ctx.client.id})
    RETURNING id
  `;
  return row;
}

async function seedEmailCampaign(ctx: TenantCtx): Promise<{ id: number }> {
  const list = await seedEmailList(ctx);
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.email_campaigns (
      name, subject, from_name, from_email, list_id, client_id, html_content
    ) VALUES (
      ${`camp-${Date.now()}-${Math.floor(Math.random() * 9999)}`},
      'subj', 'From', 'from@test.local',
      ${list.id}, ${ctx.client.id}, ''
    )
    RETURNING id
  `;
  return row;
}

describe('POST /api/realtime/token — auth + validation @realtime @realtime-token', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('rt-token-a'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/realtime/token/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { entityType: 'post', entityId: 1 } },
    );
    expect(res.status).toBe(401);
  });

  it('400 when entityType is missing', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/realtime/token/route');
    const res = await callHandler<{ message: string }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { entityId: 1 } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/entityType/i);
  });

  it('400 when entityType is unknown', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/realtime/token/route');
    const res = await callHandler<{ message: string }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { entityType: 'banana', entityId: 1 } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/entityType/i);
  });

  it('400 when entityId is missing', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/realtime/token/route');
    const res = await callHandler<{ message: string }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { entityType: 'post' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/entityId/i);
  });

  it('404 when entity does not exist', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/realtime/token/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { entityType: 'post', entityId: 999_999 } },
    );
    expect(res.status).toBe(404);
  });
});

describe('POST /api/realtime/token — entityType=post @realtime @realtime-token', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('rt-token-post-a'); });

  it('404 cross-tenant: tenant A asks for token for tenant B\'s post', async () => {
    const B = await sessionForNewClientUser('rt-token-post-b');
    const foreignPost = await seedPost(B);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/realtime/token/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { entityType: 'post', entityId: foreignPost.id } },
    );
    expect(res.status).toBe(404);
  });

  it('200 own post: returns { token, wsUrl, expiresAt, docKey } and JWT decodes', async () => {
    const post = await seedPost(A);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/realtime/token/route');
    const res = await callHandler<{ data: { token: string; wsUrl: string; expiresAt: number; docKey: string } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { entityType: 'post', entityId: post.id } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.token).toBeTruthy();
    expect(res.data?.data.wsUrl).toBeTruthy();
    expect(res.data?.data.expiresAt).toBeGreaterThan(Date.now());
    expect(res.data?.data.docKey).toBe(`post:${post.id}`);

    // Verify the JWT decodes with the secret and carries the expected claims.
    const decoded = jwt.verify(res.data!.data.token, SECRET) as JwtPayload;
    expect(decoded.sub).toBe(String(A.user.id));
    expect(decoded.clientId).toBe(A.client.id);
    expect(decoded.docKey).toBe(`post:${post.id}`);
    expect(decoded.scope).toBe('write');

    // exp claim is approximately 5 minutes (300s) in the future. Allow a wide
    // window so test scheduler hiccups don't flake the assertion.
    const nowSec = Math.floor(Date.now() / 1000);
    const ttl = decoded.exp - nowSec;
    expect(ttl).toBeGreaterThan(60);
    expect(ttl).toBeLessThanOrEqual(5 * 60 + 5);
  });

  it('viewer-role member gets scope=read; owner/admin/member get write', async () => {
    const post = await seedPost(A);
    const sql = getTestSql();

    // The default A user is owner (write). Add a second user to A's tenant
    // with role=viewer and confirm their token has scope=read.
    const viewerEmail = `viewer-${Date.now()}-${Math.floor(Math.random() * 9999)}@test.local`;
    const [viewer] = await sql<{ id: number }[]>`
      INSERT INTO ${sql(TEST_SCHEMA)}.users (name, email, password, role, active)
      VALUES (${'viewer'}, ${viewerEmail}, ${'x'}, ${'editor'}, true)
      RETURNING id
    `;
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.client_members (client_id, user_id, role)
      VALUES (${A.client.id}, ${viewer.id}, 'viewer')
    `;

    mockedAuth.mockResolvedValue({
      user: { id: String(viewer.id), name: 'viewer', email: viewerEmail, role: 'editor' },
      expires: new Date(Date.now() + 3600_000).toISOString(),
    });

    const route = await import('@/app/api/realtime/token/route');
    const res = await callHandler<{ data: { token: string; scope: string } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { entityType: 'post', entityId: post.id } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.scope).toBe('read');

    const decoded = jwt.verify(res.data!.data.token, SECRET) as JwtPayload;
    expect(decoded.scope).toBe('read');

    // Owner (default A) still gets write — re-mint with the original session
    // and confirm the mapping isn't accidentally clamping everyone to read.
    mockedAuth.mockResolvedValue(A.session);
    const ownerRes = await callHandler<{ data: { scope: string } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { entityType: 'post', entityId: post.id } },
    );
    expect(ownerRes.data?.data.scope).toBe('write');
  });
});

describe('POST /api/realtime/token — entityType=deck @realtime @realtime-token', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('rt-token-deck-a'); });

  it('404 cross-tenant: tenant A asks for token for tenant B\'s deck', async () => {
    const B = await sessionForNewClientUser('rt-token-deck-b');
    const foreign = await seedDeck(B);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/realtime/token/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { entityType: 'deck', entityId: foreign.id } },
    );
    expect(res.status).toBe(404);
  });

  it('200 own deck: returns docKey deck:<id> and JWT carries clientId', async () => {
    const deck = await seedDeck(A);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/realtime/token/route');
    const res = await callHandler<{ data: { token: string; docKey: string; expiresAt: number } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { entityType: 'deck', entityId: deck.id } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.docKey).toBe(`deck:${deck.id}`);

    const decoded = jwt.verify(res.data!.data.token, SECRET) as JwtPayload;
    expect(decoded.clientId).toBe(A.client.id);
    expect(decoded.docKey).toBe(`deck:${deck.id}`);
    expect(decoded.sub).toBe(String(A.user.id));
  });
});

describe('POST /api/realtime/token — entityType=email @realtime @realtime-token', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('rt-token-email-a'); });

  it('404 cross-tenant: tenant A asks for token for tenant B\'s email campaign', async () => {
    const B = await sessionForNewClientUser('rt-token-email-b');
    const foreign = await seedEmailCampaign(B);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/realtime/token/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { entityType: 'email', entityId: foreign.id } },
    );
    expect(res.status).toBe(404);
  });

  it('200 own email: returns docKey email:<id> and JWT carries clientId', async () => {
    const campaign = await seedEmailCampaign(A);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/realtime/token/route');
    const res = await callHandler<{ data: { token: string; docKey: string; expiresAt: number } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { entityType: 'email', entityId: campaign.id } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.docKey).toBe(`email:${campaign.id}`);

    const decoded = jwt.verify(res.data!.data.token, SECRET) as JwtPayload;
    expect(decoded.clientId).toBe(A.client.id);
    expect(decoded.docKey).toBe(`email:${campaign.id}`);
    expect(decoded.sub).toBe(String(A.user.id));
  });
});
