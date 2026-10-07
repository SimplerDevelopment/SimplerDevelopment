import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { request, type APIRequestContext, type BrowserContext } from '@playwright/test';

export const seededAccounts = {
  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@example.com',
    password: process.env.ADMIN_PASSWORD || 'admin123',
  },
  client: { email: 'client@example.com', password: 'client123' },
};
export type SeededRole = keyof typeof seededAccounts;

/** Only exact seeded credentials may reuse state; wrong/new passwords still log in. */
export function sharedStorageState(email: string, password: string): string | undefined {
  const directory = process.env.E2E_AUTH_RUN_DIR;
  if (!directory) return undefined;
  const role = (Object.keys(seededAccounts) as SeededRole[]).find((candidate) => {
    const account = seededAccounts[candidate];
    return account.email === email && account.password === password;
  });
  if (!role) return undefined;
  const filename = resolve(directory, `${role}.json`);
  if (!existsSync(filename)) throw new Error(`Missing prepared E2E session for ${role}`);
  return filename;
}

/** Real login for global setup and tests of new/negative credentials. */
export async function loginRequestContext(ctx: APIRequestContext, email: string, password: string, requireSession = true) {
  const csrfRes = await ctx.get('/api/auth/csrf');
  if (!csrfRes.ok()) throw new Error(`CSRF request failed: ${csrfRes.status()}`);
  const { csrfToken } = await csrfRes.json();
  const response = await ctx.post('/api/auth/callback/credentials', {
    form: { email, password, csrfToken, json: 'true' },
  });
  if (!response.ok()) throw new Error(`Login failed for ${email}: ${response.status()}`);
  // Auth.js can return 200 with an error URL. Never cache an anonymous cookie jar.
  const sessionResponse = await ctx.get('/api/auth/session');
  const session = await sessionResponse.json();
  if (!sessionResponse.ok() || session?.user?.email !== email) {
    // API auth-negative specs inspect the resulting anonymous context themselves.
    if (!requireSession) return;
    throw new Error(`Login did not establish a session for ${email}`);
  }

  // Cookie-only portal resolvers require an active workspace, including staff.
  const clientsResponse = await ctx.get('/api/portal/clients');
  if (clientsResponse.ok()) {
    const { activeClientId } = await clientsResponse.json();
    if (activeClientId) {
      const switched = await ctx.post('/api/portal/switch-client', { data: { clientId: activeClientId } });
      if (!switched.ok()) throw new Error(`Selecting the E2E workspace failed: ${switched.status()}`);
    }
  }
}

/** Each test keeps its own cookie jar; shared files are read-only snapshots. */
export async function authenticateBrowserContext(context: BrowserContext, email: string, password: string) {
  const filename = sharedStorageState(email, password);
  if (!filename) return loginRequestContext(context.request, email, password);
  const state = JSON.parse(readFileSync(filename, 'utf8')) as Awaited<ReturnType<APIRequestContext['storageState']>>;
  // Prepared API contexts have cookies only. Refuse to silently drop future origin state.
  if (state.origins.length !== 0) throw new Error('Prepared E2E browser auth must be cookie-only');
  await context.clearCookies();
  await context.addCookies(state.cookies);
}

export async function authenticatedRequestContext(email: string, password: string, baseURL = process.env.BASE_URL || 'http://localhost:3000') {
  const storageState = sharedStorageState(email, password);
  const ctx = await request.newContext({ baseURL, storageState });
  try {
    if (!storageState) await loginRequestContext(ctx, email, password);
    return ctx;
  } catch (error) {
    await ctx.dispose();
    throw error;
  }
}
