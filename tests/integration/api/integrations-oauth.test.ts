/**
 * OAuth-adjacent portal endpoints.
 *
 * Why integration-api (not E2E):
 *   These routes redirect to / call out to Google + GitHub. Driving them through
 *   a real browser would require live OAuth apps, captive consent screens, and
 *   third-party cookies — all hostile to deterministic CI. Calling the route
 *   handlers directly with a mocked googleapis surface + MSW-mocked GitHub HTTP
 *   keeps the security-critical glue (state signing, CSRF binding, scope
 *   inclusion, DB persistence, idempotent disconnect) under test without any
 *   network dependency.
 *
 * Coverage matrix:
 *   /api/portal/integrations/google/connect      — auth gate, tenant gating, redirect URL
 *   /api/portal/integrations/google/status       — auth gate, standard vs enterprise tier
 *   /api/portal/integrations/google/callback     — state validation, CSRF binding, persistence
 *   /api/portal/integrations/google/disconnect   — auth gate, idempotent revoke + scrub
 *   /api/portal/google/callback                  — legacy per-website callback (state=siteId)
 *   /api/portal/github/connect                   — auth gate, env-required, redirect URL + scope
 *   /api/portal/github/callback                  — code exchange, user-info upsert
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, type Mock } from 'vitest';
import { http, HttpResponse } from 'msw';

// auth() is mocked at module level so each test forges its own session.
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

// next/headers requires a real Next.js request context (App Router work store).
// In integration-api tests the route is invoked as a plain function, so the
// dynamic-API store doesn't exist. Provide minimal stand-ins so the legacy
// google/callback + github/* routes can read host / proto without throwing.
// The same headers value is returned to every caller within a test — that's
// fine since this file's tests don't rely on per-request header differences.
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers({
    host: 'localhost:3000',
    'x-forwarded-proto': 'http',
  })),
  cookies: vi.fn(async () => ({
    get: () => undefined,
    set: () => undefined,
    has: () => false,
  })),
}));

// googleapis is mocked once at top-level: every `new google.auth.OAuth2(...)`
// returns the same instance whose methods are vi.fns we steer per-test. Same
// pattern as tests/unit/google/oauth.test.ts (the unit tests on the wrapper).
const mockGenerateAuthUrl = vi.fn();
const mockGetToken = vi.fn();
const mockSetCredentials = vi.fn();
const mockRevokeToken = vi.fn();
const mockUserinfoGet = vi.fn();
const mockGmailWatch = vi.fn();

vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: vi.fn(function OAuth2Mock() {
        return {
          generateAuthUrl: mockGenerateAuthUrl,
          getToken: mockGetToken,
          setCredentials: mockSetCredentials,
          revokeToken: mockRevokeToken,
          // refreshAccessToken / credentials chain not exercised here
        };
      }),
    },
    oauth2: vi.fn(() => ({
      userinfo: { get: mockUserinfoGet },
    })),
    gmail: vi.fn(() => ({
      users: { watch: mockGmailWatch },
    })),
  },
}));

import { auth } from '@/lib/auth';
import { server } from '../../setup-api';
import { callHandler } from '../../helpers/call-handler';
import { sessionForNewClientUser, sessionFor, type TenantCtx } from '../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../helpers/test-db';
import { signState } from '@/lib/google/oauth-state';
import { encryptSecret } from '@/lib/crypto/secrets';

const mockedAuth = auth as unknown as Mock;

// ── Fixture helpers ─────────────────────────────────────────────────────

async function seedTenantCreds(
  clientId: number,
  overrides: { status?: 'pending' | 'configured' | 'active' | 'revoked' } = {},
): Promise<void> {
  const sql = getTestSql();
  const status = overrides.status ?? 'active';
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.google_workspace_tenant_credentials (
      client_id, google_project_id, oauth_client_id, oauth_client_secret_encrypted,
      oauth_redirect_uri, pubsub_topic, pubsub_verification_token,
      consent_screen_user_type, status
    ) VALUES (
      ${clientId},
      'tenant-proj-462913',
      '123-abc.apps.googleusercontent.com',
      ${encryptSecret('GOCSPX-tenant-secret')},
      'https://tenant.simplerdevelopment.com/api/portal/integrations/google/callback',
      'projects/tenant-proj-462913/topics/gmail-watch',
      ${`pubsub-token-${clientId}-${Math.random().toString(36).slice(2)}`},
      'internal',
      ${status}
    )
  `;
}

async function seedClientWebsite(clientId: number, name = 'Site'): Promise<number> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_websites (client_id, name)
    VALUES (${clientId}, ${name})
    RETURNING id
  `;
  return row.id;
}

// Schema-drift patch: lib/db/schema.ts declares drive_channel_* columns on
// google_workspace_user_connections but no migration has been generated for
// them yet. Drizzle emits SELECT/INSERT statements that reference the columns,
// so without this patch any query against the table errors with
// `column "drive_channel_id" does not exist`. We add the columns IF MISSING so
// this spec runs in isolation. Once a real migration lands, this becomes a
// no-op (IF NOT EXISTS).
beforeAll(async () => {
  const sql = getTestSql();
  await sql.unsafe(`
    ALTER TABLE "${TEST_SCHEMA}"."google_workspace_user_connections"
      ADD COLUMN IF NOT EXISTS "drive_start_page_token" varchar(128),
      ADD COLUMN IF NOT EXISTS "drive_channel_id" varchar(64),
      ADD COLUMN IF NOT EXISTS "drive_channel_resource_id" varchar(64),
      ADD COLUMN IF NOT EXISTS "drive_channel_expiration" timestamp,
      ADD COLUMN IF NOT EXISTS "drive_channel_token" varchar(64),
      ADD COLUMN IF NOT EXISTS "calendar_sync_token" text,
      ADD COLUMN IF NOT EXISTS "contacts_sync_token" text,
      ADD COLUMN IF NOT EXISTS "sync_settings" jsonb NOT NULL DEFAULT '{"aggressiveness":"passive","storeBodies":false}'::jsonb,
      ADD COLUMN IF NOT EXISTS "last_sync_at" timestamp
  `);
});

beforeEach(() => {
  mockedAuth.mockReset();
  mockGenerateAuthUrl.mockReset();
  mockGetToken.mockReset();
  mockSetCredentials.mockReset();
  mockRevokeToken.mockReset();
  mockUserinfoGet.mockReset();
  mockGmailWatch.mockReset();

  // Sane default: revoke succeeds, gmail watch returns plausible payload.
  mockRevokeToken.mockResolvedValue({});
  mockGmailWatch.mockResolvedValue({
    data: { historyId: '99', expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000) },
  });
});

afterEach(() => {
  // Clear any per-test MSW handlers added with server.use().
  server.resetHandlers();
});

// ════════════════════════════════════════════════════════════════════════
// /api/portal/integrations/google/connect
// ════════════════════════════════════════════════════════════════════════
describe('GET /api/portal/integrations/google/connect @integrations @oauth @security', () => {
  it('401 without a session', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/integrations/google/connect/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET');
    expect(res.status).toBe(401);
  });

  it('409 when the client has no tenant credentials (standard tier)', async () => {
    const A = await sessionForNewClientUser('connect-standard');
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/integrations/google/connect/route');
    const res = await callHandler<{ error: string }>(
      route as unknown as Record<string, unknown>, 'GET',
    );
    expect(res.status).toBe(409);
    expect(res.data?.error).toBe('workspace_not_provisioned');
  });

  it('409 when tenant is in pending status (not yet configured)', async () => {
    const A = await sessionForNewClientUser('connect-pending');
    await seedTenantCreds(A.client.id, { status: 'pending' });
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/integrations/google/connect/route');
    const res = await callHandler<{ error: string; status: string }>(
      route as unknown as Record<string, unknown>, 'GET',
    );
    expect(res.status).toBe(409);
    expect(res.data?.error).toBe('workspace_not_ready');
    expect(res.data?.status).toBe('pending');
  });

  it('redirects (302/307) to a Google authorize URL with offline access + identity scope', async () => {
    const A = await sessionForNewClientUser('connect-active');
    await seedTenantCreds(A.client.id);
    mockedAuth.mockResolvedValue(A.session);

    mockGenerateAuthUrl.mockReturnValue(
      'https://accounts.google.com/o/oauth2/v2/auth?access_type=offline&scope=openid&state=signed.state',
    );

    const route = await import('@/app/api/portal/integrations/google/connect/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET');

    // NextResponse.redirect → 307 (temporary redirect by default).
    expect([302, 303, 307, 308]).toContain(res.status);
    const location = res.headers.get('location');
    expect(location).toContain('accounts.google.com');

    // Inspect what we asked googleapis to build.
    expect(mockGenerateAuthUrl).toHaveBeenCalledTimes(1);
    const args = mockGenerateAuthUrl.mock.calls[0][0];
    expect(args.access_type).toBe('offline');
    expect(args.prompt).toBe('consent');
    expect(args.scope).toContain('openid');
    expect(args.scope).toContain('https://www.googleapis.com/auth/userinfo.email');
    // Default surfaces include gmail / calendar / drive / contacts.
    expect(args.scope).toContain('https://www.googleapis.com/auth/gmail.readonly');
    expect(typeof args.state).toBe('string');
    expect(args.state.length).toBeGreaterThan(20);     // signed state, not just clientId
  });

  it('honours the surfaces query param to scope down', async () => {
    const A = await sessionForNewClientUser('connect-surfaces');
    await seedTenantCreds(A.client.id);
    mockedAuth.mockResolvedValue(A.session);
    mockGenerateAuthUrl.mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?x=y');

    const route = await import('@/app/api/portal/integrations/google/connect/route');
    await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { query: { surfaces: 'calendar' } },
    );
    const args = mockGenerateAuthUrl.mock.calls[0][0];
    // identity scopes always included; calendar requested; gmail/drive must NOT be.
    expect(args.scope).toContain('openid');
    expect(args.scope).toContain('https://www.googleapis.com/auth/calendar.readonly');
    expect(args.scope).not.toContain('https://www.googleapis.com/auth/gmail.readonly');
    expect(args.scope).not.toContain('https://www.googleapis.com/auth/drive');
  });
});

// ════════════════════════════════════════════════════════════════════════
// /api/portal/integrations/google/status
// ════════════════════════════════════════════════════════════════════════
describe('GET /api/portal/integrations/google/status @integrations @oauth', () => {
  it('401 without a session', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/integrations/google/status/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET');
    expect(res.status).toBe(401);
  });

  it('returns tier=standard, connection=null when no tenant credentials exist', async () => {
    const A = await sessionForNewClientUser('status-standard');
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/integrations/google/status/route');
    const res = await callHandler<{
      tier: string;
      tenantStatus: string | null;
      connection: unknown;
    }>(route as unknown as Record<string, unknown>, 'GET');

    expect(res.status).toBe(200);
    expect(res.data?.tier).toBe('standard');
    expect(res.data?.tenantStatus).toBeNull();
    expect(res.data?.connection).toBeNull();
  });

  it('returns tier=enterprise, tenantStatus from row, connection=null pre-connect', async () => {
    const A = await sessionForNewClientUser('status-enterprise');
    await seedTenantCreds(A.client.id, { status: 'configured' });
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/integrations/google/status/route');
    const res = await callHandler<{
      tier: string;
      tenantStatus: string;
      connection: unknown;
    }>(route as unknown as Record<string, unknown>, 'GET');

    expect(res.status).toBe(200);
    expect(res.data?.tier).toBe('enterprise');
    expect(res.data?.tenantStatus).toBe('configured');
    expect(res.data?.connection).toBeNull();
  });

  it('returns the active connection row (without tokens) when one exists', async () => {
    const A = await sessionForNewClientUser('status-connected');
    await seedTenantCreds(A.client.id);
    const sql = getTestSql();
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.google_workspace_user_connections (
        client_id, user_id, google_account_email, google_account_id,
        access_token, refresh_token, expires_at, scopes
      ) VALUES (
        ${A.client.id}, ${A.user.id}, 'alice@example.com', '12345',
        'access-tok', 'refresh-tok', NOW() + interval '1 hour',
        '["openid","https://www.googleapis.com/auth/gmail.readonly"]'::jsonb
      )
    `;
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/integrations/google/status/route');
    const res = await callHandler<{
      connection: { googleAccountEmail: string; scopes: string[] } | null;
    }>(route as unknown as Record<string, unknown>, 'GET');

    expect(res.status).toBe(200);
    expect(res.data?.connection?.googleAccountEmail).toBe('alice@example.com');
    expect(res.data?.connection?.scopes).toContain('openid');
    // Tokens MUST NOT be in the response.
    expect(JSON.stringify(res.data)).not.toContain('access-tok');
    expect(JSON.stringify(res.data)).not.toContain('refresh-tok');
  });
});

// ════════════════════════════════════════════════════════════════════════
// /api/portal/integrations/google/callback
// ════════════════════════════════════════════════════════════════════════
describe('GET /api/portal/integrations/google/callback @integrations @oauth @security', () => {
  it('400 when state is missing', async () => {
    const route = await import('@/app/api/portal/integrations/google/callback/route');
    const res = await callHandler<{ error: string }>(
      route as unknown as Record<string, unknown>, 'GET',
      { url: 'http://localhost:3000/api/portal/integrations/google/callback?code=abc' },
    );
    expect(res.status).toBe(400);
    expect(res.data?.error).toBe('missing_state');
  });

  it('400 with reason=malformed for a garbage state value', async () => {
    const route = await import('@/app/api/portal/integrations/google/callback/route');
    const res = await callHandler<{ error: string; reason: string }>(
      route as unknown as Record<string, unknown>, 'GET',
      { url: 'http://localhost:3000/?code=abc&state=not-a-valid-state' },
    );
    expect(res.status).toBe(400);
    expect(res.data?.error).toBe('invalid_state');
    expect(res.data?.reason).toMatch(/malformed|bad_signature/);
  });

  it('403 when the calling session does not match the userId baked into state (CSRF binding)', async () => {
    const A = await sessionForNewClientUser('cb-csrf-victim');
    const attacker = sessionFor({ id: 99999, role: 'editor' });
    // Attacker mints a state that points at THEIR own user, but a different
    // user (the victim) is currently signed in. Route MUST reject — otherwise
    // the victim's tokens would land on the attacker's row.
    const state = signState({
      clientId: A.client.id,
      userId: 99999,
      surfaces: ['identity'],
    });
    mockedAuth.mockResolvedValue(A.session);   // signed-in user is A, NOT 99999

    const route = await import('@/app/api/portal/integrations/google/callback/route');
    const res = await callHandler<{ error: string }>(
      route as unknown as Record<string, unknown>, 'GET',
      { url: `http://localhost:3000/?code=abc&state=${state}` },
    );
    expect(res.status).toBe(403);
    expect(res.data?.error).toBe('session_mismatch');
    void attacker;  // keep variable named for readability
  });

  it('400 missing_code when state is valid but code param is absent', async () => {
    const A = await sessionForNewClientUser('cb-missing-code');
    const state = signState({
      clientId: A.client.id,
      userId: A.user.id,
      surfaces: ['identity'],
    });
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/integrations/google/callback/route');
    const res = await callHandler<{ error: string }>(
      route as unknown as Record<string, unknown>, 'GET',
      { url: `http://localhost:3000/?state=${state}` },
    );
    expect(res.status).toBe(400);
    expect(res.data?.error).toBe('missing_code');
  });

  it('redirects to portal with error param when google returns ?error=access_denied', async () => {
    const A = await sessionForNewClientUser('cb-google-error');
    const state = signState({
      clientId: A.client.id,
      userId: A.user.id,
      surfaces: ['identity'],
    });
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/integrations/google/callback/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { url: `http://localhost:3000/?error=access_denied&state=${state}` },
    );
    expect([302, 303, 307, 308]).toContain(res.status);
    expect(res.headers.get('location')).toContain('workspace_error=access_denied');
  });

  it('409 when the tenant has no credentials (provisioning regressed between connect+callback)', async () => {
    const A = await sessionForNewClientUser('cb-no-tenant');
    // Note: deliberately not seeding tenant creds.
    const state = signState({
      clientId: A.client.id,
      userId: A.user.id,
      surfaces: ['identity'],
    });
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/integrations/google/callback/route');
    const res = await callHandler<{ error: string }>(
      route as unknown as Record<string, unknown>, 'GET',
      { url: `http://localhost:3000/?code=valid-code&state=${state}` },
    );
    expect(res.status).toBe(409);
    expect(res.data?.error).toBe('workspace_not_provisioned');
  });

  it('502 when the upstream token exchange fails', async () => {
    const A = await sessionForNewClientUser('cb-exchange-fail');
    await seedTenantCreds(A.client.id);
    const state = signState({
      clientId: A.client.id,
      userId: A.user.id,
      surfaces: ['identity'],
    });
    mockedAuth.mockResolvedValue(A.session);

    mockGetToken.mockRejectedValueOnce(new Error('upstream 500'));

    const route = await import('@/app/api/portal/integrations/google/callback/route');
    const res = await callHandler<{ error: string }>(
      route as unknown as Record<string, unknown>, 'GET',
      { url: `http://localhost:3000/?code=bad-code&state=${state}` },
    );
    expect(res.status).toBe(502);
    expect(res.data?.error).toBe('token_exchange_failed');
  });

  it('happy path: persists tokens keyed by (clientId, userId) and redirects to portal', async () => {
    const A = await sessionForNewClientUser('cb-happy');
    await seedTenantCreds(A.client.id);
    const state = signState({
      clientId: A.client.id,
      userId: A.user.id,
      surfaces: ['identity', 'gmail'],
    });
    mockedAuth.mockResolvedValue(A.session);

    mockGetToken.mockResolvedValueOnce({
      tokens: {
        access_token: 'ya29.real-access',
        refresh_token: '1//refresh-real',
        expiry_date: Date.now() + 3600_000,
        scope: 'openid https://www.googleapis.com/auth/gmail.readonly',
      },
    });
    mockUserinfoGet.mockResolvedValueOnce({
      data: { email: 'connected@example.com', id: 'g-12345' },
    });

    const route = await import('@/app/api/portal/integrations/google/callback/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { url: `http://localhost:3000/?code=valid-code&state=${state}` },
    );
    expect([302, 303, 307, 308]).toContain(res.status);
    expect(res.headers.get('location')).toContain('workspace_connected=1');

    // Verify DB persistence.
    const sql = getTestSql();
    const rows = await sql<{
      google_account_email: string;
      access_token: string;
      refresh_token: string;
      revoked_at: Date | null;
    }[]>`
      SELECT google_account_email, access_token, refresh_token, revoked_at
      FROM ${sql(TEST_SCHEMA)}.google_workspace_user_connections
      WHERE client_id = ${A.client.id} AND user_id = ${A.user.id}
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].google_account_email).toBe('connected@example.com');
    expect(rows[0].access_token).toBe('ya29.real-access');
    expect(rows[0].refresh_token).toBe('1//refresh-real');
    expect(rows[0].revoked_at).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════
// /api/portal/integrations/google/disconnect
// ════════════════════════════════════════════════════════════════════════
describe('POST /api/portal/integrations/google/disconnect @integrations @oauth', () => {
  it('401 without a session', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/integrations/google/disconnect/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST');
    expect(res.status).toBe(401);
  });

  it('returns alreadyDisconnected when the user has no active connection', async () => {
    const A = await sessionForNewClientUser('disc-noop');
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/integrations/google/disconnect/route');
    const res = await callHandler<{ ok: boolean; alreadyDisconnected?: boolean }>(
      route as unknown as Record<string, unknown>, 'POST',
    );
    expect(res.status).toBe(200);
    expect(res.data?.ok).toBe(true);
    expect(res.data?.alreadyDisconnected).toBe(true);
  });

  it('scrubs tokens, sets revokedAt, and a follow-up status returns connection=null', async () => {
    const A = await sessionForNewClientUser('disc-revoke');
    await seedTenantCreds(A.client.id);
    const sql = getTestSql();
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.google_workspace_user_connections (
        client_id, user_id, google_account_email, google_account_id,
        access_token, refresh_token, expires_at, scopes
      ) VALUES (
        ${A.client.id}, ${A.user.id}, 'alice@example.com', '12345',
        'real-access', 'real-refresh', NOW() + interval '1 hour',
        '["openid"]'::jsonb
      )
    `;
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/integrations/google/disconnect/route');
    const res = await callHandler<{ ok: boolean; googleRevoked: boolean }>(
      route as unknown as Record<string, unknown>, 'POST',
    );
    expect(res.status).toBe(200);
    expect(res.data?.ok).toBe(true);
    expect(res.data?.googleRevoked).toBe(true);
    expect(mockRevokeToken).toHaveBeenCalledWith('real-refresh');

    // Row is kept (audit) but scrubbed + marked revoked.
    const rows = await sql<{
      access_token: string;
      refresh_token: string;
      revoked_at: Date | null;
    }[]>`
      SELECT access_token, refresh_token, revoked_at
      FROM ${sql(TEST_SCHEMA)}.google_workspace_user_connections
      WHERE client_id = ${A.client.id} AND user_id = ${A.user.id}
    `;
    expect(rows[0].access_token).toBe('');
    expect(rows[0].refresh_token).toBe('');
    expect(rows[0].revoked_at).not.toBeNull();

    // Status endpoint should now report connection=null (filters out revokedAt).
    const statusRoute = await import('@/app/api/portal/integrations/google/status/route');
    const statusRes = await callHandler<{ connection: unknown }>(
      statusRoute as unknown as Record<string, unknown>, 'GET',
    );
    expect(statusRes.data?.connection).toBeNull();
  });

  it('is idempotent: a second disconnect returns alreadyDisconnected', async () => {
    const A = await sessionForNewClientUser('disc-idempotent');
    await seedTenantCreds(A.client.id);
    const sql = getTestSql();
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.google_workspace_user_connections (
        client_id, user_id, google_account_email, google_account_id,
        access_token, refresh_token, expires_at, scopes
      ) VALUES (
        ${A.client.id}, ${A.user.id}, 'alice@example.com', '12345',
        'real-access', 'real-refresh', NOW() + interval '1 hour',
        '[]'::jsonb
      )
    `;
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/integrations/google/disconnect/route');
    const first = await callHandler<{ ok: boolean }>(
      route as unknown as Record<string, unknown>, 'POST',
    );
    const second = await callHandler<{ ok: boolean; alreadyDisconnected?: boolean }>(
      route as unknown as Record<string, unknown>, 'POST',
    );
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.data?.alreadyDisconnected).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════
// /api/portal/google/callback (legacy per-website OAuth, state=siteId)
// ════════════════════════════════════════════════════════════════════════
describe('GET /api/portal/google/callback (legacy website tokens) @integrations @oauth', () => {
  it('redirects unauthenticated users back to the portal dashboard', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/google/callback/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { url: 'http://localhost:3000/?code=abc&state=1' },
    );
    expect([302, 303, 307, 308]).toContain(res.status);
    expect(res.headers.get('location')).toContain('/portal/dashboard');
  });

  it('redirects with google=error when code or state is missing', async () => {
    const A = await sessionForNewClientUser('legacy-missing');
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/google/callback/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { url: 'http://localhost:3000/' },
    );
    expect([302, 303, 307, 308]).toContain(res.status);
    expect(res.headers.get('location')).toContain('google=error');
  });

  it('refuses to bind tokens to a website the caller does not own', async () => {
    const A = await sessionForNewClientUser('legacy-foreign-A');
    const B = await sessionForNewClientUser('legacy-foreign-B');
    const foreignSiteId = await seedClientWebsite(B.client.id, 'B-site');
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/google/callback/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { url: `http://localhost:3000/?code=abc&state=${foreignSiteId}` },
    );
    expect([302, 303, 307, 308]).toContain(res.status);
    expect(res.headers.get('location')).toContain('google=error');

    // Critically: nothing was written.
    const sql = getTestSql();
    const tokenRows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.google_website_tokens
      WHERE website_id = ${foreignSiteId}
    `;
    expect(tokenRows).toHaveLength(0);
  });

  it('happy path: exchanges code, persists website tokens, redirects to settings', async () => {
    const A = await sessionForNewClientUser('legacy-happy');
    const siteId = await seedClientWebsite(A.client.id, 'A-site');
    mockedAuth.mockResolvedValue(A.session);

    mockGetToken.mockResolvedValueOnce({
      tokens: {
        access_token: 'site-access',
        refresh_token: 'site-refresh',
        expiry_date: Date.now() + 3600_000,
        scope: 'https://www.googleapis.com/auth/webmasters',
      },
    });

    const route = await import('@/app/api/portal/google/callback/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { url: `http://localhost:3000/?code=abc&state=${siteId}` },
    );
    expect([302, 303, 307, 308]).toContain(res.status);
    expect(res.headers.get('location')).toContain(`websites/${siteId}/settings?google=connected`);

    const sql = getTestSql();
    const tokenRows = await sql<{
      access_token: string;
      refresh_token: string;
    }[]>`
      SELECT access_token, refresh_token
      FROM ${sql(TEST_SCHEMA)}.google_website_tokens
      WHERE website_id = ${siteId}
    `;
    expect(tokenRows).toHaveLength(1);
    expect(tokenRows[0].access_token).toBe('site-access');
    expect(tokenRows[0].refresh_token).toBe('site-refresh');
  });
});

// ════════════════════════════════════════════════════════════════════════
// /api/portal/github/connect
// ════════════════════════════════════════════════════════════════════════
describe('GET /api/portal/github/connect @integrations @oauth @security', () => {
  it('401 without a session', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/github/connect/route');
    const res = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>, 'GET',
    );
    expect(res.status).toBe(401);
    expect(res.data?.success).toBe(false);
  });

  it('500 when GITHUB_OAUTH_CLIENT_ID env var is unset', async () => {
    const A = await sessionForNewClientUser('gh-no-env');
    mockedAuth.mockResolvedValue(A.session);
    const prev = process.env.GITHUB_OAUTH_CLIENT_ID;
    delete process.env.GITHUB_OAUTH_CLIENT_ID;
    try {
      const route = await import('@/app/api/portal/github/connect/route');
      const res = await callHandler<{ success: boolean; message: string }>(
        route as unknown as Record<string, unknown>, 'GET',
      );
      expect(res.status).toBe(500);
      expect(res.data?.message).toMatch(/not configured/i);
    } finally {
      if (prev !== undefined) process.env.GITHUB_OAUTH_CLIENT_ID = prev;
    }
  });

  it('redirects to github.com/login/oauth/authorize with repo + read:user scopes', async () => {
    const A = await sessionForNewClientUser('gh-redirect');
    process.env.GITHUB_OAUTH_CLIENT_ID = 'gh-test-client-id';
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/github/connect/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET');
    expect([302, 303, 307, 308]).toContain(res.status);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('https://github.com/login/oauth/authorize');
    expect(location).toContain('client_id=gh-test-client-id');
    // URLSearchParams encodes " " as "+" and leaves ":" alone, so the raw
    // query string is `scope=repo+read:user`. Decode it for a readable assert.
    expect(location).toContain('scope=repo+read');
    expect(decodeURIComponent(location.replace(/\+/g, ' '))).toContain('scope=repo read:user');
    expect(location).toContain(`state=${A.user.id}`);
  });
});

// ════════════════════════════════════════════════════════════════════════
// /api/portal/github/callback
// ════════════════════════════════════════════════════════════════════════
describe('GET /api/portal/github/callback @integrations @oauth @security', () => {
  it('redirects with github=error when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/github/callback/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { url: 'http://localhost:3000/?code=abc' },
    );
    expect([302, 303, 307, 308]).toContain(res.status);
    expect(res.headers.get('location')).toContain('github=error');
  });

  it('redirects with github=error when code is missing', async () => {
    const A = await sessionForNewClientUser('gh-cb-no-code');
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/github/callback/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { url: 'http://localhost:3000/' },
    );
    expect([302, 303, 307, 308]).toContain(res.status);
    expect(res.headers.get('location')).toContain('github=error');
  });

  it('redirects with github=error when GitHub returns no access_token', async () => {
    const A = await sessionForNewClientUser('gh-cb-no-token');
    mockedAuth.mockResolvedValue(A.session);

    server.use(
      http.post('https://github.com/login/oauth/access_token', () =>
        HttpResponse.json({ error: 'bad_verification_code' }),
      ),
    );

    const route = await import('@/app/api/portal/github/callback/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { url: 'http://localhost:3000/?code=bad-code' },
    );
    expect([302, 303, 307, 308]).toContain(res.status);
    expect(res.headers.get('location')).toContain('github=error');

    // Nothing persisted.
    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.github_connections WHERE user_id = ${A.user.id}
    `;
    expect(rows).toHaveLength(0);
  });

  it('happy path: exchanges code, fetches user, upserts github_connections row', async () => {
    const A = await sessionForNewClientUser('gh-cb-happy');
    mockedAuth.mockResolvedValue(A.session);

    server.use(
      http.post('https://github.com/login/oauth/access_token', () =>
        HttpResponse.json({
          access_token: 'gho_test_access_token',
          token_type: 'bearer',
          scope: 'repo,read:user',
        }),
      ),
      http.get('https://api.github.com/user', () =>
        HttpResponse.json({
          id: 9876543,
          login: 'octotest',
        }),
      ),
    );

    const route = await import('@/app/api/portal/github/callback/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { url: 'http://localhost:3000/?code=good-code' },
    );
    expect([302, 303, 307, 308]).toContain(res.status);
    expect(res.headers.get('location')).toContain('github=connected');

    const sql = getTestSql();
    const rows = await sql<{
      github_user_id: number;
      github_username: string;
      access_token: string;
      scope: string | null;
    }[]>`
      SELECT github_user_id, github_username, access_token, scope
      FROM ${sql(TEST_SCHEMA)}.github_connections
      WHERE user_id = ${A.user.id}
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].github_user_id).toBe(9876543);
    expect(rows[0].github_username).toBe('octotest');
    expect(rows[0].access_token).toBe('gho_test_access_token');
    expect(rows[0].scope).toBe('repo,read:user');
  });

  it('upsert: a second successful callback for the same user updates (not duplicates) the row', async () => {
    const A = await sessionForNewClientUser('gh-cb-upsert');
    mockedAuth.mockResolvedValue(A.session);

    // First connect.
    server.use(
      http.post('https://github.com/login/oauth/access_token', () =>
        HttpResponse.json({ access_token: 'token-1', scope: 'repo' }),
      ),
      http.get('https://api.github.com/user', () =>
        HttpResponse.json({ id: 1, login: 'octotest' }),
      ),
    );
    const route = await import('@/app/api/portal/github/callback/route');
    await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { url: 'http://localhost:3000/?code=c1' },
    );

    // Second connect — different token / username.
    server.resetHandlers();
    server.use(
      http.post('https://github.com/login/oauth/access_token', () =>
        HttpResponse.json({ access_token: 'token-2', scope: 'repo,read:user' }),
      ),
      http.get('https://api.github.com/user', () =>
        HttpResponse.json({ id: 1, login: 'octotest-renamed' }),
      ),
    );
    await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { url: 'http://localhost:3000/?code=c2' },
    );

    const sql = getTestSql();
    const rows = await sql<{
      access_token: string;
      github_username: string;
    }[]>`
      SELECT access_token, github_username FROM ${sql(TEST_SCHEMA)}.github_connections
      WHERE user_id = ${A.user.id}
    `;
    expect(rows).toHaveLength(1);                        // unique(userId), so upsert
    expect(rows[0].access_token).toBe('token-2');
    expect(rows[0].github_username).toBe('octotest-renamed');
  });
});
