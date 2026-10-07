import { test, expect } from './setup/fixtures';
import { ApiClient } from './setup/api-client';
import { authenticateBrowserContext, seededAccounts } from './setup/auth-session';

test.describe('prepared session isolation @auth @critical', () => {
  test('logging out one client cookie jar leaves its sibling authenticated', async ({ clientApi }) => {
    const account = seededAccounts.client;
    const sibling = await new ApiClient(account.email, account.password).ensure();
    try {
      expect((await clientApi.get('/api/auth/session')).data?.user?.email).toBe(account.email);
      expect((await clientApi.post('/api/portal/sign-out')).status).toBe(200);
      expect((await clientApi.get('/api/auth/session')).data?.user).toBeUndefined();
      expect((await sibling.get('/api/auth/session')).data?.user?.email).toBe(account.email);
    } finally {
      await sibling.dispose();
    }
  });

  test('browser role changes do not authenticate anonymous or mutate API cookie jars', async ({ page, clientApi, adminApi, unauthApi }) => {
    for (const role of ['admin', 'client'] as const) {
      const account = seededAccounts[role];
      await authenticateBrowserContext(page.context(), account.email, account.password);
      const response = await page.request.get('/api/auth/session');
      expect((await response.json()).user.email).toBe(account.email);
    }
    await page.context().clearCookies();
    const anonymousSession = await page.request.get('/api/auth/session');
    expect(anonymousSession.status()).toBe(200);
    expect(await anonymousSession.json()).toBeNull();
    expect((await unauthApi.get('/api/auth/session')).data?.user).toBeUndefined();
    expect((await adminApi.get('/api/auth/session')).data?.user?.email).toBe(seededAccounts.admin.email);
    expect((await clientApi.get('/api/auth/session')).data?.user?.email).toBe(seededAccounts.client.email);
  });
});
