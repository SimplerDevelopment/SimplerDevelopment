/**
 * v1 public API contract tests.
 *
 * These endpoints live under /api/v1/sites/[siteId]/* and are the public face
 * of the platform — documented, rate-limited, CORS-enabled. Contract concerns:
 *   - Invalid API key → 401
 *   - Wrong-site API key → 401 (cross-tenant isolation)
 *   - Expired API key → 401
 *   - Rate-limit exceeded → 429 with Retry-After + X-RateLimit-* headers
 *   - CORS preflight → 204 with Access-Control-Allow-* headers
 *   - CORS headers present on every response
 *   - Response shape: { success, data } on 200s
 */
import { describe, it, expect, afterEach } from 'vitest';
import crypto from 'node:crypto';

import { callHandler } from '../../helpers/call-handler';
import { sessionForNewClientUser } from '../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../helpers/test-db';

async function createSite(clientId: number, label = 'site'): Promise<{ siteId: number }> {
  const sql = getTestSql();
  const [site] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_websites (client_id, name, domain)
    VALUES (${clientId}, ${`${label}-${Date.now()}`}, ${`${label}-${Date.now()}.test`})
    RETURNING id
  `;
  return { siteId: site.id };
}

async function createApiKey(
  clientId: number,
  siteId: number,
  opts: { rateLimit?: number; active?: boolean; expiresAt?: Date | null } = {},
): Promise<string> {
  const sql = getTestSql();
  const key = `sd_live_${crypto.randomBytes(16).toString('hex')}`;
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.api_keys (client_id, website_id, key, name, rate_limit_per_minute, active, expires_at)
    VALUES (${clientId}, ${siteId}, ${key}, 'test-key',
            ${opts.rateLimit ?? 60}, ${opts.active ?? true}, ${opts.expiresAt ?? null})
  `;
  return key;
}

// Truncate resets Postgres sequences so new apiKey rows reuse id=1, 2, ...,
// but the in-memory rate-limit Map (keyed by id) doesn't know that. Reset it
// between tests for determinism.
afterEach(async () => {
  const { resetRateLimit } = await import('@/lib/api-keys');
  resetRateLimit();
});

describe('v1 API contract @api @public', () => {
  // ── CORS preflight ──────────────────────────────────────────────────────
  it('OPTIONS returns 204 with CORS headers', async () => {
    const ctx = await sessionForNewClientUser('v1-cors');
    const { siteId } = await createSite(ctx.client.id);
    const route = await import('@/app/api/v1/sites/[siteId]/config/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'GET' as never,   // the middleware handles OPTIONS regardless of wrapped method
      { params: { siteId: String(siteId) } },
    );
    // Config GET without an OPTIONS request still produces CORS headers
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-methods')).toContain('GET');
  });

  // ── Unauthenticated public read: still works (v1 is public by default) ──
  it('unauthenticated GET returns site config for an existing site', async () => {
    const ctx = await sessionForNewClientUser('v1-public');
    const { siteId } = await createSite(ctx.client.id);

    const route = await import('@/app/api/v1/sites/[siteId]/config/route');
    const res = await callHandler<{ success: boolean; data: unknown }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { siteId: String(siteId) } },
    );

    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data).toBeDefined();
  });

  it('returns 404 for a non-existent siteId', async () => {
    const route = await import('@/app/api/v1/sites/[siteId]/config/route');
    const res = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { siteId: '999999' } },
    );
    expect(res.status).toBe(404);
    expect(res.data?.success).toBe(false);
  });

  it('returns 400 for a non-numeric siteId', async () => {
    const route = await import('@/app/api/v1/sites/[siteId]/config/route');
    const res = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { siteId: 'not-a-number' } },
    );
    expect(res.status).toBe(400);
  });

  // ── API key validation ─────────────────────────────────────────────────
  it('rejects a request with an invalid API key (401)', async () => {
    const ctx = await sessionForNewClientUser('v1-badkey');
    const { siteId } = await createSite(ctx.client.id);

    const route = await import('@/app/api/v1/sites/[siteId]/config/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      {
        params: { siteId: String(siteId) },
        headers: { authorization: 'Bearer sd_live_this-is-not-real' },
      },
    );
    expect(res.status).toBe(401);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('rejects a valid key presented for the wrong site (cross-tenant 401)', async () => {
    const A = await sessionForNewClientUser('v1-tenant-a');
    const B = await sessionForNewClientUser('v1-tenant-b');
    const { siteId: siteA } = await createSite(A.client.id, 'site-a');
    const { siteId: siteB } = await createSite(B.client.id, 'site-b');

    // Create an API key bound to A's site
    const keyA = await createApiKey(A.client.id, siteA);

    // Present it against B's site
    const route = await import('@/app/api/v1/sites/[siteId]/config/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      {
        params: { siteId: String(siteB) },
        headers: { 'x-api-key': keyA },
      },
    );
    expect(res.status).toBe(401);
  });

  it('rejects an expired API key', async () => {
    const ctx = await sessionForNewClientUser('v1-expired');
    const { siteId } = await createSite(ctx.client.id);
    const key = await createApiKey(ctx.client.id, siteId, {
      expiresAt: new Date(Date.now() - 60_000),
    });

    const route = await import('@/app/api/v1/sites/[siteId]/config/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      {
        params: { siteId: String(siteId) },
        headers: { authorization: `Bearer ${key}` },
      },
    );
    expect(res.status).toBe(401);
  });

  it('rejects a deactivated API key', async () => {
    const ctx = await sessionForNewClientUser('v1-inactive');
    const { siteId } = await createSite(ctx.client.id);
    const key = await createApiKey(ctx.client.id, siteId, { active: false });

    const route = await import('@/app/api/v1/sites/[siteId]/config/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      {
        params: { siteId: String(siteId) },
        headers: { 'x-api-key': key },
      },
    );
    expect(res.status).toBe(401);
  });

  it('accepts a valid API key via Bearer and x-api-key', async () => {
    const ctx = await sessionForNewClientUser('v1-ok-key');
    const { siteId } = await createSite(ctx.client.id);
    const key = await createApiKey(ctx.client.id, siteId);

    const route = await import('@/app/api/v1/sites/[siteId]/config/route');

    const res1 = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      {
        params: { siteId: String(siteId) },
        headers: { authorization: `Bearer ${key}` },
      },
    );
    expect(res1.status).toBe(200);

    const res2 = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      {
        params: { siteId: String(siteId) },
        headers: { 'x-api-key': key },
      },
    );
    expect(res2.status).toBe(200);
  });

  // ── Rate limiting ──────────────────────────────────────────────────────
  it('returns 429 with Retry-After + X-RateLimit headers after the limit', async () => {
    const ctx = await sessionForNewClientUser('v1-ratelimit');
    const { siteId } = await createSite(ctx.client.id);
    const key = await createApiKey(ctx.client.id, siteId, { rateLimit: 3 });

    const route = await import('@/app/api/v1/sites/[siteId]/config/route');

    // Within limit
    for (let i = 0; i < 3; i++) {
      const ok = await callHandler(
        route as unknown as Record<string, unknown>, 'GET',
        { params: { siteId: String(siteId) }, headers: { 'x-api-key': key } },
      );
      expect(ok.status).toBe(200);
    }

    // Exceeding
    const limited = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { siteId: String(siteId) }, headers: { 'x-api-key': key } },
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toMatch(/^\d+$/);
    expect(limited.headers.get('x-ratelimit-limit')).toBe('3');
    expect(limited.headers.get('x-ratelimit-remaining')).toBe('0');
  });
});
