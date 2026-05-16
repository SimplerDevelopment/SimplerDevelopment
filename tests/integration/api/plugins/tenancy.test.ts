/**
 * Plugin callback tenancy regression tests.
 *
 * Drives the REAL `/api/plugin-callback/[appId]/[...path]` dispatcher against
 * a populated per-worker Postgres so any handler that forgets to filter by
 * clientId, or any auth-pipeline regression, surfaces here. Tagged @tenancy
 * so `scripts/test.sh --layer=integration --tag=tenancy` (alias
 * `bun test:tenancy`) picks it up.
 *
 * What this spec asserts (see .planning/plugin-registry-spec.md "Trust model"):
 *
 *   1. Happy path                      → 200, ctx.client filters by clientA
 *   2. Wrong-client JWT                → 403 tenancy violation
 *   3. Allowlist mismatch              → 403 forbidden
 *   4. Replayed jti                    → 409 replay
 *   5. Expired token                   → 401 unauthorized
 *   6. Wrong-origin callback           → 403 forbidden
 *   7. Disabled app                    → 401 unauthorized
 *   8. IDOR on /briefs/:id             → 404 not_found (no cross-tenant leak)
 *   9. Drafts PATCH IDOR               → row unchanged
 *  10. Scope escalation on /scripts/run → 403 forbidden
 *
 * Notes:
 *   - PORTAL_KMS_KEY is not stubbed — the real KMS round-trip runs against the
 *     in-test dev fallback key (NODE_ENV is forced to 'test' by vitest, which
 *     keeps `lib/plugins/kms.ts` from throwing the production guard).
 *   - The callback handler reads the `origin` header. Set
 *     `PLUGINS_CALLBACK_ORIGIN_BYPASS=1` to skip the Origin check; we leave it
 *     unset so test 6 can verify the check fires.
 *   - The drafts PATCH handler reads JSON via `req.json()`; callHandler passes
 *     the body through verbatim, which is what the route needs.
 *   - `enqueueRun` only inserts a `registered_app_runs` row — no Anthropic
 *     call. The /scripts/run test exists to assert SCOPE GATING, not to
 *     execute the run.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomBytes } from 'node:crypto';

// `lib/auth` is unused by /api/plugin-callback (callbacks authenticate via
// JWT, not NextAuth) — but the route module imports
// `lib/plugins/handlers/postcaptain-tools/index` whose transitive imports may
// pull `lib/auth`. Mock-and-no-op it so a missing NEXTAUTH env doesn't blow
// the file load.
vi.mock('@/lib/auth', () => ({ auth: vi.fn().mockResolvedValue(null) }));

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';
import { signPluginJwtTestOnly } from '@/lib/plugins/jwt';
import { encryptSecret } from '@/lib/plugins/kms';
import { __clearJwtCache } from '@/lib/plugins/jwt';
import { resetPluginCallbackRateLimit } from '@/lib/plugins/rate-limit';

// ───────────────────────────────────────────────────────────────────────────
// Fixtures
// ───────────────────────────────────────────────────────────────────────────

const APP_SLUG = 'postcaptain-tools';
const SERVICE_SLUG_PREFIX = 'plugin-postcaptain-tools';
const KID = 'k1';
const HOST_URL = 'https://postcaptain-tools.simplerdevelopment.com';
const CALLBACK_BASE = `https://simplerdevelopment.com/api/plugin-callback/${APP_SLUG}`;

const FULL_SCOPES = [
  'postcaptain:research:read',
  'postcaptain:research:write',
] as const;

interface PluginFixture {
  appId: number;
  serviceId: number;
  /** Raw HMAC secret used to mint test tokens. */
  secret: string;
  /** Tenants seeded with the plugin grant. */
  clientA: TenantCtx;
  /** Tenant WITHOUT a plugin grant. */
  clientB: TenantCtx;
}

/**
 * Build per-test fixtures: two tenants, the plugin row pinned to allow only
 * clientA, a fresh signing key (encrypted with the dev KMS), and a couple of
 * briefs + drafts per tenant so cross-leak attempts have something to grab.
 */
async function setupPluginFixture(opts?: {
  allowList?: 'A' | 'B' | 'both' | 'none';
  appStatus?: 'active' | 'disabled' | 'draft';
}): Promise<PluginFixture> {
  const sql = getTestSql();
  const allowList = opts?.allowList ?? 'A';
  const appStatus = opts?.appStatus ?? 'active';

  const [clientA, clientB] = await Promise.all([
    sessionForNewClientUser('plugin-tenant-a'),
    sessionForNewClientUser('plugin-tenant-b'),
  ]);

  // Insert services row used as the entitlement target. The /scripts/run
  // path doesn't read it (allowlist visibility), but we wire it up for
  // completeness and so visibility='entitled' tests can use it if needed.
  const serviceSlug = `${SERVICE_SLUG_PREFIX}-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const [svc] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.services
      (name, slug, category, price, billing_cycle, active)
    VALUES ('Postcaptain Tools', ${serviceSlug}, 'plugins', 0, 'monthly', true)
    RETURNING id
  `;

  // ClientA gets the service grant. ClientB does NOT.
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_services (client_id, service_id, status)
    VALUES (${clientA.client.id}, ${svc.id}, 'active')
  `;

  const allowedIds: number[] = (() => {
    switch (allowList) {
      case 'A':    return [clientA.client.id];
      case 'B':    return [clientB.client.id];
      case 'both': return [clientA.client.id, clientB.client.id];
      case 'none': return [];
    }
  })();

  const [app] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.registered_apps (
      slug, name, icon, host_url, manifest_url,
      default_scopes, billing_service_id, visibility,
      allowed_client_ids, status
    ) VALUES (
      ${APP_SLUG}, 'Postcaptain Tools', 'science',
      ${HOST_URL}, ${`${HOST_URL}/sd-manifest.json`},
      ${JSON.stringify(FULL_SCOPES)}::jsonb,
      ${svc.id}, 'allowlist',
      ${JSON.stringify(allowedIds)}::jsonb,
      ${appStatus}
    )
    RETURNING id
  `;

  // Signing key: encrypt the raw HMAC secret with the live KMS helper so the
  // verify path uses the production decrypt code path. NODE_ENV=test means
  // kms.ts falls back to the all-zeros dev key — fine for tests.
  const secret = randomBytes(32).toString('base64');
  const secretEncrypted = encryptSecret(secret);
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.registered_app_signing_keys (
      app_id, kid, secret_hash, secret_encrypted, algo, status
    ) VALUES (
      ${app.id}, ${KID}, ${'hash-' + KID}, ${secretEncrypted}, 'HS256', 'active'
    )
  `;

  // Seed a couple of briefs + drafts per tenant. Each row needs a run row
  // first because postcaptain_briefs/drafts FK to registered_app_runs.
  async function seedTenantData(clientId: number) {
    const runIds: number[] = [];
    for (let i = 0; i < 2; i++) {
      const [run] = await sql<{ id: number }[]>`
        INSERT INTO ${sql(TEST_SCHEMA)}.registered_app_runs
          (app_id, client_id, kind, args, status)
        VALUES (
          ${app.id}, ${clientId}, 'research-brief',
          ${JSON.stringify({ topic: `topic-${clientId}-${i}` })}::jsonb,
          'succeeded'
        )
        RETURNING id
      `;
      runIds.push(run.id);
    }
    for (let i = 0; i < 2; i++) {
      await sql`
        INSERT INTO ${sql(TEST_SCHEMA)}.postcaptain_briefs
          (client_id, run_id, topic, focus, body, sources)
        VALUES (
          ${clientId}, ${runIds[i]},
          ${`Brief ${i} for client ${clientId}`},
          ${'angle'}, ${`Body for client ${clientId} brief ${i}`},
          ${JSON.stringify([{ url: 'https://example.com', title: 'Source' }])}::jsonb
        )
      `;
    }
    for (let i = 0; i < 2; i++) {
      await sql`
        INSERT INTO ${sql(TEST_SCHEMA)}.postcaptain_drafts
          (client_id, run_id, title, body, status)
        VALUES (
          ${clientId}, ${runIds[i]},
          ${`Draft ${i} for client ${clientId}`},
          ${`Draft body for client ${clientId} #${i}`},
          'draft'
        )
      `;
    }
  }
  await Promise.all([
    seedTenantData(clientA.client.id),
    seedTenantData(clientB.client.id),
  ]);

  return {
    appId: app.id,
    serviceId: svc.id,
    secret,
    clientA,
    clientB,
  };
}

/**
 * Mint a fresh token (fresh jti) for the given tenant. Default scopes cover
 * both read + write; pass `scopes` to override (e.g. read-only for the
 * scope-escalation case).
 */
async function mintToken(
  secret: string,
  claims: {
    sub: string;
    clientId: number;
    siteId?: number | null;
    scopes?: readonly string[];
  },
  opts: { ttlSeconds?: number; now?: number } = {},
): Promise<string> {
  return signPluginJwtTestOnly(
    secret,
    KID,
    {
      aud: APP_SLUG,
      sub: claims.sub,
      clientId: claims.clientId,
      siteId: claims.siteId ?? null,
      scopes: [...(claims.scopes ?? FULL_SCOPES)],
    },
    opts,
  );
}

/** Helper: call the plugin-callback dispatcher with all the path/header machinery. */
async function callPluginCallback<T = unknown>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  pathSegments: string[],
  opts: {
    token?: string;
    origin?: string | null;
    body?: unknown;
    query?: Record<string, string | number | boolean>;
  } = {},
) {
  const route = await import('@/app/api/plugin-callback/[appId]/[...path]/route');
  const headers: Record<string, string> = {};
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.origin !== null) headers.origin = opts.origin ?? HOST_URL;

  // `callHandler` types `params` as Record<string, string>; the catch-all
  // route actually receives `path` as string[]. We pass the array through
  // verbatim with a single cast.
  return callHandler<T>(
    route as unknown as Record<string, unknown>,
    method,
    {
      params: { appId: APP_SLUG, path: pathSegments as unknown as string } as unknown as Record<string, string>,
      headers,
      body: opts.body,
      query: opts.query,
      url: `${CALLBACK_BASE}/${pathSegments.join('/')}`,
    },
  );
}

beforeEach(() => {
  // Each test gets a clean DB (truncate in setup-api.ts) — also clear the
  // in-process secret cache and rate-limit bucket so we don't see stale state
  // from a prior file's run.
  __clearJwtCache();
  resetPluginCallbackRateLimit();
});

// ───────────────────────────────────────────────────────────────────────────
// Tests
// ───────────────────────────────────────────────────────────────────────────

describe('plugin-callback tenancy @plugins @tenancy', () => {
  // 1. Happy path
  it('GET /briefs returns 200 with rows belonging ONLY to clientA', async () => {
    const fx = await setupPluginFixture();
    const token = await mintToken(fx.secret, {
      sub: String(fx.clientA.user.id),
      clientId: fx.clientA.client.id,
    });
    const res = await callPluginCallback<{
      success: boolean;
      data: { briefs: Array<{ id: number; clientId: number; topic: string }> };
    }>('GET', ['briefs'], { token });
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    const briefs = res.data!.data.briefs;
    expect(briefs.length).toBeGreaterThan(0);
    for (const b of briefs) {
      expect(b.clientId).toBe(fx.clientA.client.id);
    }
    // clientB's briefs must NEVER appear.
    expect(
      briefs.find((b) => b.clientId === fx.clientB.client.id),
    ).toBeUndefined();
  });

  // 2. Wrong-client JWT (claims belong to a tenant that isn't on the allowlist)
  it('rejects when JWT clientId is not in the allowlist (403 tenancy)', async () => {
    const fx = await setupPluginFixture({ allowList: 'A' });
    // Mint a token claiming clientId = clientB (real client row, but not on
    // the allowlist). The handler should refuse.
    const token = await mintToken(fx.secret, {
      sub: String(fx.clientB.user.id),
      clientId: fx.clientB.client.id,
    });
    const res = await callPluginCallback<{
      success: boolean;
      error: { code: string; message: string };
    }>('GET', ['briefs'], { token });
    expect(res.status).toBe(403);
    expect(res.data?.success).toBe(false);
    expect(res.data?.error.code).toBe('forbidden');
  });

  // 3. Allowlist mismatch — JWT claims a clientId that doesn't exist at all
  //    in the clients table. The audit-write FK on client_id catches this
  //    BEFORE the visibility check; either way the surface result must be a
  //    403 tenancy refusal (never a 500 leak).
  it('rejects when JWT clientId references a non-existent client (403)', async () => {
    const fx = await setupPluginFixture({ allowList: 'A' });
    const token = await mintToken(fx.secret, {
      sub: '999999',
      clientId: 999999,
    });
    const res = await callPluginCallback<{
      success: boolean;
      error: { code: string };
    }>('GET', ['briefs'], { token });
    expect(res.status).toBe(403);
    expect(res.data?.error.code).toBe('forbidden');
  });

  // 4. Replayed jti
  it('rejects a replayed jti with 409 even if the JWT is otherwise valid', async () => {
    const fx = await setupPluginFixture();
    const token = await mintToken(fx.secret, {
      sub: String(fx.clientA.user.id),
      clientId: fx.clientA.client.id,
    });
    const first = await callPluginCallback('GET', ['briefs'], { token });
    expect(first.status).toBe(200);
    const second = await callPluginCallback<{
      success: boolean;
      error: { code: string };
    }>('GET', ['briefs'], { token });
    expect(second.status).toBe(409);
    expect(second.data?.error.code).toBe('replay');
  });

  // 5. Expired token
  it('rejects an expired token with 401', async () => {
    const fx = await setupPluginFixture();
    const token = await mintToken(
      fx.secret,
      { sub: String(fx.clientA.user.id), clientId: fx.clientA.client.id },
      // iat = 2 minutes ago, ttl 60s → exp ≈ 60s in the past.
      { now: Date.now() - 120_000, ttlSeconds: 60 },
    );
    const res = await callPluginCallback<{
      success: boolean;
      error: { code: string; message: string };
    }>('GET', ['briefs'], { token });
    expect(res.status).toBe(401);
    expect(res.data?.error.code).toBe('unauthorized');
    expect(res.data?.error.message).toMatch(/expired/i);
  });

  // 6. Wrong-origin
  it('rejects a callback whose Origin does not match app.hostUrl with 403', async () => {
    const fx = await setupPluginFixture();
    const token = await mintToken(fx.secret, {
      sub: String(fx.clientA.user.id),
      clientId: fx.clientA.client.id,
    });
    const res = await callPluginCallback<{
      success: boolean;
      error: { code: string; message: string };
    }>('GET', ['briefs'], {
      token,
      origin: 'https://attacker.example.com',
    });
    expect(res.status).toBe(403);
    expect(res.data?.error.code).toBe('forbidden');
    expect(res.data?.error.message).toMatch(/origin/i);
  });

  // 7. Disabled app
  it('rejects callbacks for a disabled app even with a valid JWT (401)', async () => {
    const fx = await setupPluginFixture({ appStatus: 'disabled' });
    const token = await mintToken(fx.secret, {
      sub: String(fx.clientA.user.id),
      clientId: fx.clientA.client.id,
    });
    const res = await callPluginCallback<{
      success: boolean;
      error: { code: string };
    }>('GET', ['briefs'], { token });
    // Spec: "401/403 — whichever the implementation chose". This handler
    // returns 401 because the registered_apps row reload requires status='active'.
    expect([401, 403]).toContain(res.status);
    expect(res.data?.success).toBe(false);
  });

  // 8. IDOR on /briefs/:id — clientB JWT trying to read clientA's brief.
  it('refuses cross-tenant /briefs/:id reads (404 no-leak)', async () => {
    const fx = await setupPluginFixture({ allowList: 'both' });
    // Find a brief that belongs to clientA.
    const sql = getTestSql();
    const [briefA] = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.postcaptain_briefs
      WHERE client_id = ${fx.clientA.client.id}
      ORDER BY id ASC LIMIT 1
    `;
    expect(briefA).toBeDefined();

    // ClientB now mints a JWT for itself and asks for clientA's brief.
    const token = await mintToken(fx.secret, {
      sub: String(fx.clientB.user.id),
      clientId: fx.clientB.client.id,
    });
    const res = await callPluginCallback<{
      success: boolean;
      data?: { brief: { id: number; clientId: number; body: string } };
      error?: { code: string };
    }>('GET', ['briefs', String(briefA.id)], { token });
    // Either 404 or 403 is acceptable per the spec — what is NOT acceptable
    // is leaking clientA's brief body.
    expect([403, 404]).toContain(res.status);
    expect(res.data?.success).toBe(false);
    expect(res.data?.data).toBeUndefined();
  });

  // 9. Drafts PATCH IDOR — clientB trying to mutate clientA's draft.
  it('refuses cross-tenant /drafts/:id PATCH (row body unchanged)', async () => {
    const fx = await setupPluginFixture({ allowList: 'both' });
    const sql = getTestSql();
    const [draftA] = await sql<{ id: number; body: string }[]>`
      SELECT id, body FROM ${sql(TEST_SCHEMA)}.postcaptain_drafts
      WHERE client_id = ${fx.clientA.client.id}
      ORDER BY id ASC LIMIT 1
    `;
    expect(draftA).toBeDefined();
    const originalBody = draftA.body;

    const token = await mintToken(fx.secret, {
      sub: String(fx.clientB.user.id),
      clientId: fx.clientB.client.id,
    });
    const res = await callPluginCallback<{
      success: boolean;
      error?: { code: string };
    }>('PATCH', ['drafts', String(draftA.id)], {
      token,
      body: { body: 'HACKED BY CLIENT B' },
    });
    // Handler returns 404 ("don't leak existence") per drafts.ts.
    expect([403, 404]).toContain(res.status);
    expect(res.data?.success).toBe(false);

    // Re-read the draft directly from the DB and verify the body is unchanged.
    const [after] = await sql<{ body: string }[]>`
      SELECT body FROM ${sql(TEST_SCHEMA)}.postcaptain_drafts
      WHERE id = ${draftA.id}
    `;
    expect(after.body).toBe(originalBody);
  });

  // 10. Scope escalation — read-only token tries to POST /scripts/run.
  it('rejects POST /scripts/run when the JWT only carries the read scope (403)', async () => {
    const fx = await setupPluginFixture();
    const readOnlyToken = await mintToken(fx.secret, {
      sub: String(fx.clientA.user.id),
      clientId: fx.clientA.client.id,
      scopes: ['postcaptain:research:read'],
    });
    const res = await callPluginCallback<{
      success: boolean;
      error: { code: string; message: string };
    }>('POST', ['scripts', 'run'], {
      token: readOnlyToken,
      body: { kind: 'research-brief', topic: 'Test topic' },
    });
    expect(res.status).toBe(403);
    expect(res.data?.error.code).toBe('forbidden');
    expect(res.data?.error.message).toMatch(/scope/i);

    // Make sure no run row was inserted as a side effect.
    const sql = getTestSql();
    const rows = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count
      FROM ${sql(TEST_SCHEMA)}.registered_app_runs
      WHERE client_id = ${fx.clientA.client.id} AND status = 'queued'
    `;
    expect(Number(rows[0].count)).toBe(0);
  });
});
