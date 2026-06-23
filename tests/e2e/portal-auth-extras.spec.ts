/**
 * Portal Auth Extras E2E Tests
 *
 * Covers portal endpoints in the auth/session adjacency that aren't already
 * exercised by tests/integration/api/auth-flows.test.ts:
 *  - POST   /api/portal/change-password
 *  - POST   /api/portal/sign-out
 *  - POST   /api/portal/switch-client
 *  - GET    /api/portal/default-portal
 *  - GET    /api/portal/default-website
 *  - GET    /api/portal/my-subdomain
 *  - GET    /api/portal/resolve-subdomain
 *
 * Safety: never mutates the seeded `client@example.com` / `admin@example.com`
 * passwords. Password-change tests run against a freshly-invited team member
 * scoped to the throwaway client owned by `clientApi`. Sign-out tests use a
 * throwaway `ApiClient` so the shared `clientApi` fixture stays valid.
 */
import { test, expect } from './setup/fixtures';
import { ApiClient } from './setup/api-client';
import { runCleanups, createTestTeamMember, createTestWebsite } from './setup/helpers';

test.describe('Portal change-password @auth @password', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('POST rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/change-password', {
      currentPassword: 'whatever',
      newPassword: 'whatever-new-1234',
    });
    expect(res.status).toBe(401);
  });

  test('POST rejects missing currentPassword', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/change-password', {
      newPassword: 'something-new-1234',
    });
    expect(res.status).toBe(400);
  });

  test('POST rejects newPassword shorter than 8 chars', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/change-password', {
      currentPassword: 'client123',
      newPassword: 'short',
    });
    expect(res.status).toBe(400);
  });

  test('POST rejects incorrect currentPassword on a fresh user', async ({ clientApi }) => {
    // Use a fresh team member so the seeded `client@example.com` password is never touched.
    const { memberApi, cleanup } = await createTestTeamMember(clientApi);
    cleanups.push(cleanup);

    const res = await memberApi.post('/api/portal/change-password', {
      currentPassword: 'definitely-not-the-password',
      newPassword: 'a-valid-new-password-1234',
    });
    expect(res.status).toBe(400);
    expect(res.data?.error).toMatch(/current password/i);
  });

  test('POST changes password and old credentials no longer authenticate', async ({ clientApi }) => {
    // Fresh user — capture their temp password from the invite, then change it
    // and confirm only the new one logs in. Restoration not required because
    // the user is throwaway and gets removed in cleanup.
    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2, 8);
    const email = `pwchange-${ts}-${rand}@example.com`;
    const inviteRes = await clientApi.post('/api/portal/settings/team', {
      name: `PwChange ${ts}`,
      email,
    });
    expect(inviteRes.data?.success).toBe(true);
    const member = inviteRes.data.data as { memberId: number; tempPassword: string };
    const oldPassword = member.tempPassword;
    const newPassword = `NewPw-${ts}-${rand}!`;

    const memberApi = new ApiClient(email, oldPassword);
    await memberApi.ensure();

    cleanups.push(async () => {
      await memberApi.dispose().catch(() => {});
      await clientApi.delete(`/api/portal/settings/team/${member.memberId}`).catch(() => {});
    });

    // Change the password
    const change = await memberApi.post('/api/portal/change-password', {
      currentPassword: oldPassword,
      newPassword,
    });
    expect(change.status).toBe(200);
    expect(change.data?.success).toBe(true);

    // Old password should now fail
    const tryOld = new ApiClient(email, oldPassword);
    let oldFailed = false;
    try {
      await tryOld.ensure();
    } catch {
      oldFailed = true;
    } finally {
      await tryOld.dispose().catch(() => {});
    }
    expect(oldFailed).toBe(true);

    // New password should authenticate
    const tryNew = new ApiClient(email, newPassword);
    await tryNew.ensure();
    const me = await tryNew.get('/api/portal/default-portal');
    expect(me.status).toBe(200);
    await tryNew.dispose();
  });
});

test.describe('Portal sign-out @auth @sign-out', () => {
  test('POST returns 200 and reports success', async () => {
    // Fresh ApiClient so we don't disturb the shared `clientApi` fixture.
    const throwaway = new ApiClient('client@example.com', 'client123');
    await throwaway.ensure();
    try {
      const res = await throwaway.post('/api/portal/sign-out');
      expect(res.status).toBe(200);
      expect(res.data?.success).toBe(true);
    } finally {
      await throwaway.dispose();
    }
  });

  test('POST clears session — subsequent authed calls return 401', async () => {
    const throwaway = new ApiClient('client@example.com', 'client123');
    await throwaway.ensure();
    try {
      // Sanity check — authed call works
      const before = await throwaway.get('/api/portal/default-portal');
      expect(before.status).toBe(200);

      // Sign out
      const out = await throwaway.post('/api/portal/sign-out');
      expect(out.status).toBe(200);

      // Now an authed call should fail
      const after = await throwaway.get('/api/portal/default-portal');
      expect(after.status).toBe(401);
    } finally {
      await throwaway.dispose();
    }
  });

  test('POST works without an active session (idempotent)', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/sign-out');
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
  });
});

test.describe('Portal switch-client @auth @switch', () => {
  test('POST rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/switch-client', { clientId: 1 });
    expect(res.status).toBe(401);
  });

  test('POST rejects missing clientId', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/switch-client', {});
    expect(res.status).toBe(400);
  });

  test('POST rejects non-numeric clientId', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/switch-client', { clientId: 'not-a-number' });
    expect(res.status).toBe(400);
  });

  test('POST rejects clientId the user has no access to (admin has no portal clients)', async ({ adminApi }) => {
    // The seeded admin is a global admin with no client membership, so any
    // numeric clientId should be denied.
    const res = await adminApi.post('/api/portal/switch-client', { clientId: 999_999 });
    expect(res.status).toBe(403);
    expect(res.data?.error).toMatch(/access denied/i);
  });

  test('POST rejects an unrelated clientId for a single-tenant client user', async ({ clientApi }) => {
    // The seeded portal client only has one accessible client; switching to a
    // foreign id must be denied.
    const res = await clientApi.post('/api/portal/switch-client', { clientId: 999_999 });
    expect(res.status).toBe(403);
  });

  test('POST returns 200 and active client info when clientId is accessible', async ({ clientApi }) => {
    // Discover the client's own accessible clients via my-subdomain (which
    // surfaces the portals list) and switch to one of them — a legal no-op.
    const ms = await clientApi.get('/api/portal/my-subdomain');
    expect(ms.status).toBe(200);
    const portals = ms.data?.portals as Array<{ clientId: number; company: string | null }>;
    expect(Array.isArray(portals)).toBe(true);
    expect(portals.length).toBeGreaterThan(0);

    const target = portals[0];
    const res = await clientApi.post('/api/portal/switch-client', { clientId: target.clientId });
    expect(res.status).toBe(200);
    expect(res.data?.activeClientId).toBe(target.clientId);
  });
});

test.describe('Portal default-portal @auth @default-portal', () => {
  test('GET rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/default-portal');
    expect(res.status).toBe(401);
  });

  test('GET returns defaultClientId field for an authed user', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/default-portal');
    expect(res.status).toBe(200);
    // Field exists; value can be null or a number depending on prior runs.
    expect(res.data).toHaveProperty('defaultClientId');
    if (res.data.defaultClientId !== null) {
      expect(typeof res.data.defaultClientId).toBe('number');
    }
  });
});

test.describe('Portal default-website @auth @default-website', () => {
  test('GET rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/default-website');
    expect(res.status).toBe(401);
  });

  test('GET returns websites array and defaultWebsiteId for client', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/default-website');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data?.websites)).toBe(true);
    expect(res.data).toHaveProperty('defaultWebsiteId');
  });

  test('GET returns 404 when caller has no client (admin user)', async ({ adminApi }) => {
    const res = await adminApi.get('/api/portal/default-website');
    expect(res.status).toBe(404);
  });
});

test.describe('Portal my-subdomain @auth @my-subdomain', () => {
  test('GET on unauthenticated returns null subdomain (handler does not 401)', async ({ unauthApi }) => {
    // Per the route handler, an unauthenticated call returns
    // { subdomain: null, portals: [], needsChoice: false } with status 200
    // rather than 401 — verifying that contract here.
    const res = await unauthApi.get('/api/portal/my-subdomain');
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ subdomain: null, portals: [], needsChoice: false });
  });

  test('GET returns portals list for an authed client user', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/my-subdomain');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data?.portals)).toBe(true);
    expect(typeof res.data?.needsChoice).toBe('boolean');
  });

  test('GET for an admin (no portal clients) returns empty portals + no choice', async ({ adminApi }) => {
    const res = await adminApi.get('/api/portal/my-subdomain');
    expect(res.status).toBe(200);
    expect(res.data?.portals).toEqual([]);
    expect(res.data?.needsChoice).toBe(false);
    expect(res.data?.subdomain).toBeNull();
  });
});

test.describe('Portal resolve-subdomain @auth @resolve-subdomain', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('GET rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/resolve-subdomain?subdomain=anything');
    expect(res.status).toBe(401);
  });

  test('GET rejects missing subdomain query param', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/resolve-subdomain');
    expect(res.status).toBe(400);
  });

  test('GET returns 404 for an unknown subdomain', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/resolve-subdomain?subdomain=does-not-exist-${Date.now()}`);
    expect(res.status).toBe(404);
  });

  test('GET resolves a known subdomain owned by the user', async ({ clientApi }) => {
    // Create a fresh website so this test is self-contained.
    const { website, cleanup } = await createTestWebsite(clientApi);
    cleanups.push(cleanup);
    expect(website.subdomain).toBeTruthy();

    const res = await clientApi.get(`/api/portal/resolve-subdomain?subdomain=${encodeURIComponent(website.subdomain)}`);
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(typeof res.data?.clientId).toBe('number');
  });

  test('GET denies access to a subdomain not owned by the caller', async ({ clientApi, adminApi }) => {
    // Client owns a website; admin has no portal clients so should be denied.
    const { website, cleanup } = await createTestWebsite(clientApi);
    cleanups.push(cleanup);
    expect(website.subdomain).toBeTruthy();

    const res = await adminApi.get(`/api/portal/resolve-subdomain?subdomain=${encodeURIComponent(website.subdomain)}`);
    expect(res.status).toBe(403);
  });
});
