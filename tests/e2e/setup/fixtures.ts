import { test as base, type Page } from '@playwright/test';
import { ApiClient } from './api-client';

// Seed credentials (from scripts/seed-admin.ts and seed-portal-client.ts)
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const CLIENT_EMAIL = 'client@example.com';
const CLIENT_PASSWORD = 'client123';

// Plugin / multi-client e2e credentials. The "postcaptain" user belongs to
// client 103 (Post Captain Consulting) — the only client that is allowlisted
// onto the `postcaptain-tools` plugin. No seed script creates this user, so
// the env vars must point at an account provisioned out-of-band (or specs
// that rely on this fixture must skip themselves when the env is missing).
const POSTCAPTAIN_EMAIL = process.env.POSTCAPTAIN_USER_EMAIL || '';
const POSTCAPTAIN_PASSWORD = process.env.POSTCAPTAIN_USER_PASSWORD || '';

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
  /** Log the current `page` in as the postcaptain (client 103) test user.
   *  Throws if POSTCAPTAIN_USER_EMAIL / POSTCAPTAIN_USER_PASSWORD env vars
   *  are not set — specs using this fixture should `test.skip` upstream when
   *  those vars are missing. */
  loginAsPostcaptain: (page: Page) => Promise<void>;
  /** Log the current `page` in as a non-postcaptain client (Acme Corp /
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
  loginAsPostcaptain: async ({}, use) => {
    await use(async (page: Page) => {
      if (!POSTCAPTAIN_EMAIL || !POSTCAPTAIN_PASSWORD) {
        throw new Error(
          'POSTCAPTAIN_USER_EMAIL / POSTCAPTAIN_USER_PASSWORD env vars not set. ' +
            'Provision a user for client 103 and export these before running ' +
            'plugin-postcaptain-tools specs.',
        );
      }
      await loginPage(page, POSTCAPTAIN_EMAIL, POSTCAPTAIN_PASSWORD);
    });
  },
  loginAsOtherClient: async ({}, use) => {
    await use(async (page: Page) => {
      await loginPage(page, CLIENT_EMAIL, CLIENT_PASSWORD);
    });
  },
});

export { expect, request } from '@playwright/test';
