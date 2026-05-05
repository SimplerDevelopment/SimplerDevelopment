/**
 * Integration tests for portal integrations status + disconnect routes,
 * focused on cross-user / cross-tenant isolation.
 *
 * Why a separate file from `tests/integration/api/integrations-oauth.test.ts`:
 *   The existing oauth file covers state signing, CSRF binding, token
 *   exchange, and the canonical happy-path disconnect. It does NOT exhaustively
 *   exercise the per-user (within a tenant) and cross-tenant boundaries on
 *   /status and /disconnect — i.e. user A in tenant X must not see user B's
 *   connection (same tenant), and user A in tenant X must not see anything
 *   from tenant Y. That's what we cover here. We deliberately skip /connect
 *   and /callback (already covered) to avoid duplication.
 *
 * Mocking note: the route's `revoke()` import resolves through @/lib/google/oauth
 * which would call out to googleapis. We stub the oauth module surface so the
 * disconnect route's best-effort revoke succeeds without network.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

// Match the shape used by tests/integration/api/integrations-oauth.test.ts:
// every `new google.auth.OAuth2(...)` returns the same instance whose methods
// we control here. The disconnect route calls `revoke(refreshToken, tenant.oauth)`
// which under the hood instantiates an OAuth2 client and calls revokeToken.
const mockRevokeToken = vi.fn().mockResolvedValue({});
vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: vi.fn(function OAuth2Mock() {
        return {
          generateAuthUrl: vi.fn(),
          getToken: vi.fn(),
          setCredentials: vi.fn(),
          revokeToken: mockRevokeToken,
        };
      }),
    },
    oauth2: vi.fn(() => ({ userinfo: { get: vi.fn() } })),
    gmail: vi.fn(() => ({ users: { watch: vi.fn() } })),
  },
}));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, sessionFor, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';
import { encryptSecret } from '@/lib/crypto/secrets';

async function asTenant(ctx: TenantCtx | null) {
  mockedAuth.mockResolvedValue(ctx?.session ?? null);
}

async function seedTenantCreds(clientId: number) {
  const sql = getTestSql();
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.google_workspace_tenant_credentials (
      client_id, google_project_id, oauth_client_id, oauth_client_secret_encrypted,
      oauth_redirect_uri, pubsub_topic, pubsub_verification_token,
      consent_screen_user_type, status
    ) VALUES (
      ${clientId},
      'tenant-proj-test',
      '123-abc.apps.googleusercontent.com',
      ${encryptSecret('GOCSPX-test-secret')},
      'https://test.local/api/portal/integrations/google/callback',
      'projects/tenant-proj-test/topics/gmail-watch',
      ${`pubsub-tok-${clientId}-${Math.random().toString(36).slice(2)}`},
      'internal',
      'active'
    )
  `;
}

async function seedUserConnection(clientId: number, userId: number, email: string) {
  const sql = getTestSql();
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.google_workspace_user_connections (
      client_id, user_id, google_account_email, google_account_id,
      access_token, refresh_token, expires_at, scopes
    ) VALUES (
      ${clientId}, ${userId}, ${email}, ${`gid-${userId}`},
      'access-token', 'refresh-token', NOW() + interval '1 hour',
      '["openid"]'::jsonb
    )
  `;
}

async function seedTeammate(clientId: number, label: string) {
  const sql = getTestSql();
  const email = `${label}-${Date.now()}@test.local`;
  const [u] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.users (name, email, password, role, active)
    VALUES (${label}, ${email}, 'x', 'editor', true)
    RETURNING id
  `;
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_members (client_id, user_id, role)
    VALUES (${clientId}, ${u.id}, 'member')
  `;
  return { userId: u.id, email };
}

// Schema-drift patch — same trick the existing oauth file uses. The
// google_workspace_user_connections columns added in app schema haven't all
// landed in a migration yet. Without this, any select hits "column does not
// exist". Idempotent: IF NOT EXISTS makes this a no-op once migrations catch up.
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
  mockRevokeToken.mockReset();
  mockRevokeToken.mockResolvedValue({});
});

describe('GET /api/portal/integrations/google/status @integrations @tenancy', () => {
  it('401 without a session', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/integrations/google/status/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET');
    expect(res.status).toBe(401);
  });

  it('returns tier=standard when the tenant has no enterprise creds', async () => {
    const A = await sessionForNewClientUser('int-status-std');
    await asTenant(A);
    const route = await import('@/app/api/portal/integrations/google/status/route');
    const res = await callHandler<{ tier: string; tenantStatus: string | null; connection: unknown }>(
      route as unknown as Record<string, unknown>, 'GET',
    );
    expect(res.status).toBe(200);
    expect(res.data?.tier).toBe('standard');
    expect(res.data?.tenantStatus).toBeNull();
    expect(res.data?.connection).toBeNull();
  });

  it('cross-user (same tenant): user B sees no connection while user A is connected', async () => {
    const A = await sessionForNewClientUser('int-status-uA');
    await seedTenantCreds(A.client.id);
    await seedUserConnection(A.client.id, A.user.id, 'a@example.com');
    const B = await seedTeammate(A.client.id, 'teammate-B');

    // Caller is user B with A's clientId.
    mockedAuth.mockResolvedValue(sessionFor({ id: B.userId, role: 'editor', email: B.email }));

    const route = await import('@/app/api/portal/integrations/google/status/route');
    const res = await callHandler<{ tier: string; tenantStatus: string; connection: unknown }>(
      route as unknown as Record<string, unknown>, 'GET',
    );
    expect(res.status).toBe(200);
    expect(res.data?.tier).toBe('enterprise');
    // Tenant credentials are visible to all members of the tenant — that's
    // the design contract. But the per-USER connection must not leak.
    expect(res.data?.connection).toBeNull();
  });

  it('cross-tenant: tenant Y\'s user sees nothing of tenant X', async () => {
    const X = await sessionForNewClientUser('int-status-X');
    await seedTenantCreds(X.client.id);
    await seedUserConnection(X.client.id, X.user.id, 'x@example.com');

    const Y = await sessionForNewClientUser('int-status-Y');
    await asTenant(Y);

    const route = await import('@/app/api/portal/integrations/google/status/route');
    const res = await callHandler<{ tier: string; tenantStatus: string | null; connection: unknown }>(
      route as unknown as Record<string, unknown>, 'GET',
    );
    expect(res.status).toBe(200);
    // Y's tenant has no creds row of its own.
    expect(res.data?.tier).toBe('standard');
    expect(res.data?.connection).toBeNull();
  });

  it('returns the caller\'s connection when present', async () => {
    const A = await sessionForNewClientUser('int-status-mine');
    await seedTenantCreds(A.client.id);
    await seedUserConnection(A.client.id, A.user.id, 'mine@example.com');
    await asTenant(A);

    const route = await import('@/app/api/portal/integrations/google/status/route');
    const res = await callHandler<{ connection: { googleAccountEmail: string } | null }>(
      route as unknown as Record<string, unknown>, 'GET',
    );
    expect(res.status).toBe(200);
    expect(res.data?.connection?.googleAccountEmail).toBe('mine@example.com');
  });
});

describe('POST /api/portal/integrations/google/disconnect @integrations @tenancy', () => {
  it('401 without a session', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/integrations/google/disconnect/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST');
    expect(res.status).toBe(401);
  });

  it('returns alreadyDisconnected when caller has no active connection', async () => {
    const A = await sessionForNewClientUser('int-disc-noop');
    await asTenant(A);
    const route = await import('@/app/api/portal/integrations/google/disconnect/route');
    const res = await callHandler<{ ok: boolean; alreadyDisconnected?: boolean }>(
      route as unknown as Record<string, unknown>, 'POST',
    );
    expect(res.status).toBe(200);
    expect(res.data?.alreadyDisconnected).toBe(true);
  });

  it('cross-user (same tenant): user B\'s disconnect does NOT touch user A\'s connection', async () => {
    const A = await sessionForNewClientUser('int-disc-uA');
    await seedTenantCreds(A.client.id);
    await seedUserConnection(A.client.id, A.user.id, 'a@example.com');
    const B = await seedTeammate(A.client.id, 'teammate-disc');

    mockedAuth.mockResolvedValue(sessionFor({ id: B.userId, role: 'editor', email: B.email }));
    const route = await import('@/app/api/portal/integrations/google/disconnect/route');
    const res = await callHandler<{ ok: boolean; alreadyDisconnected?: boolean }>(
      route as unknown as Record<string, unknown>, 'POST',
    );
    // B has no connection so disconnect is a no-op.
    expect(res.status).toBe(200);
    expect(res.data?.alreadyDisconnected).toBe(true);

    // A's connection is unchanged.
    const sql = getTestSql();
    const [row] = await sql<{ access_token: string; refresh_token: string; revoked_at: Date | null }[]>`
      SELECT access_token, refresh_token, revoked_at
      FROM ${sql(TEST_SCHEMA)}.google_workspace_user_connections
      WHERE client_id = ${A.client.id} AND user_id = ${A.user.id}
    `;
    expect(row.access_token).toBe('access-token');
    expect(row.refresh_token).toBe('refresh-token');
    expect(row.revoked_at).toBeNull();
    // Google's revoke endpoint must not have been called either.
    expect(mockRevokeToken).not.toHaveBeenCalled();
  });

  it('cross-tenant: tenant Y\'s disconnect cannot touch tenant X\'s connection', async () => {
    const X = await sessionForNewClientUser('int-disc-X');
    await seedTenantCreds(X.client.id);
    await seedUserConnection(X.client.id, X.user.id, 'x@example.com');

    const Y = await sessionForNewClientUser('int-disc-Y');
    await asTenant(Y);
    const route = await import('@/app/api/portal/integrations/google/disconnect/route');
    const res = await callHandler<{ ok: boolean; alreadyDisconnected?: boolean }>(
      route as unknown as Record<string, unknown>, 'POST',
    );
    expect(res.status).toBe(200);
    expect(res.data?.alreadyDisconnected).toBe(true);

    // X's connection is intact.
    const sql = getTestSql();
    const [row] = await sql<{ access_token: string; revoked_at: Date | null }[]>`
      SELECT access_token, revoked_at
      FROM ${sql(TEST_SCHEMA)}.google_workspace_user_connections
      WHERE client_id = ${X.client.id} AND user_id = ${X.user.id}
    `;
    expect(row.access_token).toBe('access-token');
    expect(row.revoked_at).toBeNull();
  });

  it('happy path: A\'s disconnect scrubs A\'s tokens (revoke called once)', async () => {
    const A = await sessionForNewClientUser('int-disc-mine');
    await seedTenantCreds(A.client.id);
    await seedUserConnection(A.client.id, A.user.id, 'a@example.com');
    await asTenant(A);

    const route = await import('@/app/api/portal/integrations/google/disconnect/route');
    const res = await callHandler<{ ok: boolean; googleRevoked: boolean }>(
      route as unknown as Record<string, unknown>, 'POST',
    );
    expect(res.status).toBe(200);
    expect(res.data?.ok).toBe(true);
    expect(res.data?.googleRevoked).toBe(true);
    expect(mockRevokeToken).toHaveBeenCalledTimes(1);
    expect(mockRevokeToken).toHaveBeenCalledWith('refresh-token');

    const sql = getTestSql();
    const [row] = await sql<{ access_token: string; refresh_token: string; revoked_at: Date | null }[]>`
      SELECT access_token, refresh_token, revoked_at
      FROM ${sql(TEST_SCHEMA)}.google_workspace_user_connections
      WHERE client_id = ${A.client.id} AND user_id = ${A.user.id}
    `;
    expect(row.access_token).toBe('');
    expect(row.refresh_token).toBe('');
    expect(row.revoked_at).not.toBeNull();
  });
});
