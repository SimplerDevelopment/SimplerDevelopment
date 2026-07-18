/**
 * Portal login flow — the REAL browser form (@critical)
 *
 * Every other spec authenticates by POSTing to /api/auth/callback/credentials
 * directly (see tests/e2e/setup/fixtures.ts `loginPage`), which bypasses the
 * actual UI: the form submit, the `signIn()` result handling, the
 * /api/portal/my-subdomain hop, and the redirect to /portal/dashboard.
 *
 * That gap let a real regression ship: the session cookie's `domain` was pinned
 * to `.simplerdevelopment.com` whenever NODE_ENV==='production' (which includes
 * every *.vercel.app preview), so the browser rejected the cookie on preview
 * hosts → "successful" sign-in, no session, bounced back to /portal/login.
 *
 * This spec drives the genuine UI so that the login → redirect → authenticated
 * landing path is covered going forward.
 *
 * Account: client@example.com / client123, seeded by scripts/seed-admin-e2e.ts.
 */
import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const EMAIL = 'client@example.com';
const PASSWORD = 'client123';

test.describe('portal login flow @critical', () => {
  test('valid credentials redirect off the login page into the authenticated portal', async ({ page }) => {
    await page.goto(`${BASE_URL}/portal/login`);

    // Form renders.
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();

    await page.getByPlaceholder('you@company.com').fill(EMAIL);
    await page.getByPlaceholder('••••••••').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign In' }).click();

    // The core assertion: we must leave /portal/login. A logged-in user lands on
    // /portal/dashboard (which may itself forward to /portal/onboarding for a
    // fresh tenant) — anything but staying stuck on the login screen.
    // 30 s instead of 15 s: the NextAuth credential callback → subdomain hop →
    // redirect chain can be slow on a cold dev server / busy CI worker.
    await page.waitForURL(
      (url) => /\/portal\//.test(url.pathname) && url.pathname !== '/portal/login',
      { timeout: 30_000 },
    );
    expect(page.url()).not.toContain('/portal/login');

    // The session is actually established (the bug left this empty).
    const session = await page.request.get(`${BASE_URL}/api/auth/session`).then((r) => r.json());
    expect(session?.user?.email).toBe(EMAIL);

    // Re-visiting the login page while authenticated bounces back into the portal
    // (the `authorized` callback's "already logged in" branch) — never shows the
    // form again.
    await page.goto(`${BASE_URL}/portal/login`);
    await page.waitForURL(
      (url) => /\/portal\//.test(url.pathname) && url.pathname !== '/portal/login',
      { timeout: 30_000 },
    );
  });

  test('invalid credentials keep the user on the login page with an error', async ({ page }) => {
    await page.goto(`${BASE_URL}/portal/login`);

    await page.getByPlaceholder('you@company.com').fill(EMAIL);
    await page.getByPlaceholder('••••••••').fill('definitely-the-wrong-password');
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Stays on login and surfaces the error — never silently navigates.
    await expect(page.getByText(/invalid email or password/i)).toBeVisible({ timeout: 10_000 });
    expect(page.url()).toContain('/portal/login');
  });
});
