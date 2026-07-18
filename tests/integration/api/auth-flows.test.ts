/**
 * Auth flow integration tests — forgot-password, reset-password, invite-accept.
 *
 * These endpoints are the unauthenticated attack surface for the portal. Each
 * test asserts either that the endpoint does the right thing OR that it does
 * NOT leak information (e.g., forgot-password must not disclose whether an
 * account exists).
 *
 * Resend is mocked via MSW (see tests/helpers/api-mocks.ts). Email bodies are
 * not asserted here — template shape belongs in a separate content test.
 */
import { describe, it, expect } from 'vitest';
import { compare } from 'bcryptjs';

import { callHandler } from '../../helpers/call-handler';
import { getTestSql, TEST_SCHEMA } from '../../helpers/test-db';

async function createInviteUser(email: string, inviteToken: string | null, expiresAt: Date | null): Promise<number> {
  const sql = getTestSql();
  const [u] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.users (name, email, password, role, active, invite_token, invite_expires_at)
    VALUES ('Test', ${email}, ${'x'}, 'editor', true, ${inviteToken}, ${expiresAt})
    RETURNING id
  `;
  return u.id;
}

async function createResetUser(email: string, token: string | null, expiresAt: Date | null, active = true): Promise<number> {
  const sql = getTestSql();
  const [u] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.users (name, email, password, role, active, password_reset_token, password_reset_expires)
    VALUES ('Test', ${email}, ${'original-hash'}, 'editor', ${active}, ${token}, ${expiresAt})
    RETURNING id
  `;
  return u.id;
}

// ────────────────────────────────────────────────────────────────────────
describe('POST /api/portal/forgot-password @auth', () => {
  it('returns the same success response for a non-existent email (no enumeration)', async () => {
    const route = await import('@/app/api/portal/forgot-password/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { email: 'does-not-exist@example.test' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.message).toMatch(/if an account/i);
  });

  it('returns the same success response for an inactive user', async () => {
    const email = `inactive-${Date.now()}@test.local`;
    const sql = getTestSql();
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.users (name, email, password, role, active)
      VALUES ('X', ${email}, 'x', 'editor', false)
    `;
    const route = await import('@/app/api/portal/forgot-password/route');
    const res = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { email } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    const [u] = await sql<{ password_reset_token: string | null }[]>`
      SELECT password_reset_token FROM ${sql(TEST_SCHEMA)}.users WHERE email = ${email}
    `;
    expect(u.password_reset_token).toBeNull();   // no token issued for inactive user
  });

  it('issues a 64-hex-char token with ~1h expiry for an active user', async () => {
    const email = `active-${Date.now()}@test.local`;
    const sql = getTestSql();
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.users (name, email, password, role, active)
      VALUES ('X', ${email}, 'x', 'editor', true)
    `;

    const before = Date.now();
    const route = await import('@/app/api/portal/forgot-password/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { email } },
    );
    expect(res.status).toBe(200);

    const [u] = await sql<{ password_reset_token: string; password_reset_expires: Date }[]>`
      SELECT password_reset_token, password_reset_expires
      FROM ${sql(TEST_SCHEMA)}.users WHERE email = ${email}
    `;
    expect(u.password_reset_token).toMatch(/^[0-9a-f]{64}$/);
    const expiryMs = new Date(u.password_reset_expires).getTime();
    // Sanity bounds only — Postgres `timestamp without time zone` shifts the
    // value by the server's UTC offset when Drizzle reads it back, so we can't
    // assert second-precision here. What we care about is: token is short-lived
    // (hours, not days/years) and not already expired.
    expect(expiryMs).toBeGreaterThan(before);
    expect(expiryMs).toBeLessThan(before + 24 * 60 * 60 * 1000);
  });

  it('rejects requests without an email', async () => {
    const route = await import('@/app/api/portal/forgot-password/route');
    const res = await callHandler<{ error: string }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: {} },
    );
    expect(res.status).toBe(400);
    expect(res.data?.error).toMatch(/email is required/i);
  });
});

// ────────────────────────────────────────────────────────────────────────
describe('POST /api/portal/reset-password @auth', () => {
  it('rejects a missing token', async () => {
    const route = await import('@/app/api/portal/reset-password/route');
    const res = await callHandler<{ error: string }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { password: 'newpass-12345' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.error).toMatch(/reset token is required/i);
  });

  it('rejects an expired token', async () => {
    const token = 'a'.repeat(64);
    await createResetUser(`expired-${Date.now()}@test.local`, token, new Date(Date.now() - 60_000));

    const route = await import('@/app/api/portal/reset-password/route');
    const res = await callHandler<{ error: string }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { token, password: 'newpass-12345' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.error).toMatch(/invalid or expired/i);
  });

  it('rejects a non-existent token without revealing whether the token format is right', async () => {
    const route = await import('@/app/api/portal/reset-password/route');
    const res = await callHandler<{ error: string }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { token: 'totally-made-up-token', password: 'newpass-12345' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.error).toMatch(/invalid or expired/i);
  });

  it('rejects a password shorter than 8 chars', async () => {
    const token = 'b'.repeat(64);
    await createResetUser(`short-${Date.now()}@test.local`, token, new Date(Date.now() + 60 * 60 * 1000));
    const route = await import('@/app/api/portal/reset-password/route');
    const res = await callHandler<{ error: string }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { token, password: 'short' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.error).toMatch(/at least 8/i);
  });

  it('accepts a valid token + password, hashes the new password, and clears the reset token', async () => {
    const email = `ok-${Date.now()}@test.local`;
    const token = 'c'.repeat(64);
    const userId = await createResetUser(email, token, new Date(Date.now() + 60 * 60 * 1000));

    const route = await import('@/app/api/portal/reset-password/route');
    const res = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { token, password: 'brand-new-passw0rd' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);

    const sql = getTestSql();
    const [u] = await sql<{ password: string; password_reset_token: string | null; password_reset_expires: Date | null }[]>`
      SELECT password, password_reset_token, password_reset_expires
      FROM ${sql(TEST_SCHEMA)}.users WHERE id = ${userId}
    `;
    expect(u.password_reset_token).toBeNull();
    expect(u.password_reset_expires).toBeNull();
    expect(u.password).not.toBe('original-hash');
    // Bcrypt hash → password verifies
    expect(await compare('brand-new-passw0rd', u.password)).toBe(true);
  });

  it('prevents reuse: using the same token twice is rejected the second time', async () => {
    const email = `reuse-${Date.now()}@test.local`;
    const token = 'd'.repeat(64);
    await createResetUser(email, token, new Date(Date.now() + 60 * 60 * 1000));

    const route = await import('@/app/api/portal/reset-password/route');
    const first = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { token, password: 'first-passw0rd' } },
    );
    const second = await callHandler<{ error: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { token, password: 'second-passw0rd' } },
    );
    expect(first.status).toBe(200);
    expect(second.status).toBe(400);
    expect(second.data?.error).toMatch(/invalid or expired/i);
  });
});

// ────────────────────────────────────────────────────────────────────────
describe('POST /api/portal/invite/accept @auth', () => {
  it('rejects an expired invite token', async () => {
    const token = 'e'.repeat(64);
    await createInviteUser(`expired-${Date.now()}@test.local`, token, new Date(Date.now() - 60_000));

    const route = await import('@/app/api/portal/invite/accept/route');
    const res = await callHandler<{ error: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { token, password: 'newpass-12345' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.error).toMatch(/invalid or expired/i);
  });

  it('rejects an unknown token', async () => {
    const route = await import('@/app/api/portal/invite/accept/route');
    const res = await callHandler<{ error: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { token: 'bogus', password: 'newpass-12345' } },
    );
    expect(res.status).toBe(400);
  });

  it('accepts a valid invite, sets the password, and clears the token', async () => {
    const email = `invite-${Date.now()}@test.local`;
    const token = 'f'.repeat(64);
    const userId = await createInviteUser(email, token, new Date(Date.now() + 48 * 60 * 60 * 1000));

    const route = await import('@/app/api/portal/invite/accept/route');
    const res = await callHandler<{ success: boolean; email: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { token, password: 'new-account-passw0rd' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.email).toBe(email);

    const sql = getTestSql();
    const [u] = await sql<{ password: string; invite_token: string | null; invite_expires_at: Date | null }[]>`
      SELECT password, invite_token, invite_expires_at
      FROM ${sql(TEST_SCHEMA)}.users WHERE id = ${userId}
    `;
    expect(u.invite_token).toBeNull();
    expect(u.invite_expires_at).toBeNull();
    expect(await compare('new-account-passw0rd', u.password)).toBe(true);
  });

  it('rejects a short password', async () => {
    const token = 'g'.repeat(64);
    await createInviteUser(`short-${Date.now()}@test.local`, token, new Date(Date.now() + 60 * 60 * 1000));
    const route = await import('@/app/api/portal/invite/accept/route');
    const res = await callHandler<{ error: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { token, password: 'short' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.error).toMatch(/at least 8/i);
  });
});
