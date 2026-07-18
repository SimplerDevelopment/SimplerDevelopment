import { test as base, type Page } from '@playwright/test';
import { ApiClient } from './api-client';

// Seed credentials (from scripts/seed-admin.ts and seed-portal-client.ts)
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const CLIENT_EMAIL = 'client@example.com';
const CLIENT_PASSWORD = 'client123';

// Plugin / multi-client e2e credentials. The "content" user belongs to
// client 103 (the plugin test tenant) — the only client that is allowlisted
// onto the `content-tools` plugin. No seed script creates this user, so
// the env vars must point at an account provisioned out-of-band (or specs
// that rely on this fixture must skip themselves when the env is missing).
const CONTENT_PLUGIN_EMAIL = process.env.CONTENT_PLUGIN_EMAIL || '';
const CONTENT_PASSWORD = process.env.CONTENT_USER_PASSWORD || '';

/** Page-scoped login helper. Authenticates the given Playwright `Page`'s
 *  request context via NextAuth credentials. Mirrors the inline pattern used
 *  by other browser-based @critical specs (e.g. ab-experiment-post-lifecycle).
 */
async function loginPage(page: Page, email: string, password: string) {
  const csrfRes = await page.request.get('/api/auth/csrf');
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const res = await page.request.post('/api/auth/callback/credentials', {
    form: { email, password, csrfToken, json: 'true' },
  });
  if (res.status() >= 400) {
    throw new Error(`Login failed for ${email}: ${res.status()}`);
  }
}

type Fixtures = {
  clientApi: ApiClient;
  adminApi: ApiClient;
  unauthApi: ApiClient;
  /** Log the current `page` in as the content (client 103) test user.
   *  Throws if CONTENT_PLUGIN_EMAIL / CONTENT_USER_PASSWORD env vars
   *  are not set — specs using this fixture should `test.skip` upstream when
   *  those vars are missing. */
  loginAsContent: (page: Page) => Promise<void>;
  /** Log the current `page` in as a non-content client (Acme Corp /
   *  `client@example.com` from the standard portal seed). */
  loginAsOtherClient: (page: Page) => Promise<void>;
};

export const test = base.extend<Fixtures>({
  clientApi: async ({}, use) => {
    const api = new ApiClient(CLIENT_EMAIL, CLIENT_PASSWORD);
    await api.ensure();
    await use(api);
    await api.dispose();
  },
  adminApi: async ({}, use) => {
    const api = new ApiClient(ADMIN_EMAIL, ADMIN_PASSWORD);
    await api.ensure();
    await use(api);
    await api.dispose();
  },
  unauthApi: async ({}, use) => {
    const api = new ApiClient(); // no credentials
    await api.ensure();
    await use(api);
    await api.dispose();
  },
  loginAsContent: async ({}, use) => {
    await use(async (page: Page) => {
      if (!CONTENT_PLUGIN_EMAIL || !CONTENT_PASSWORD) {
        throw new Error(
          'CONTENT_PLUGIN_EMAIL / CONTENT_USER_PASSWORD env vars not set. ' +
            'Provision a user for client 103 and export these before running ' +
            'plugin-content-tools specs.',
        );
      }
      await loginPage(page, CONTENT_PLUGIN_EMAIL, CONTENT_PASSWORD);
    });
  },
  loginAsOtherClient: async ({}, use) => {
    await use(async (page: Page) => {
      await loginPage(page, CLIENT_EMAIL, CLIENT_PASSWORD);
    });
  },
});

export { expect, request } from '@playwright/test';
