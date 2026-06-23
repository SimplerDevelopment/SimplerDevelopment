/**
 * Brand Profile Editor — UI baseline spec
 *
 * Locks the user-visible behavior of /portal/branding/profiles/[profileId]
 * BEFORE the page.tsx refactor. Must continue to pass AFTER the refactor.
 *
 * Covers:
 *   - load profile detail page
 *   - edit messaging (company name, mission) -> save -> reload -> persisted
 *   - switch to colors tab, change primary color -> save -> reload -> persisted
 *   - open AI rewrite modal (assert open; do NOT invoke real LLM)
 *
 * Test data uses the BRAND- prefix for easy cleanup.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './setup/fixtures';
import { runCleanups } from './setup/helpers';
import type { ApiClient } from './setup/api-client';

const CLIENT_EMAIL = 'client@example.com';
const CLIENT_PASSWORD = 'client123';

async function loginAsClient(page: Page) {
  const csrfRes = await page.request.get('/api/auth/csrf');
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  await page.request.post('/api/auth/callback/credentials', {
    form: { email: CLIENT_EMAIL, password: CLIENT_PASSWORD, csrfToken, json: 'true' },
  });
}

async function createBrandProfile(api: ApiClient, name: string) {
  const res = await api.post('/api/portal/branding/profiles', {
    name,
    primaryColor: '#3b82f6',
    secondaryColor: '#1e40af',
    accentColor: '#f59e0b',
  });
  if (!res.data?.success) {
    throw new Error(`Failed to create brand profile: ${res.data?.message ?? 'unknown'}`);
  }
  const profile = res.data.data as { id: number; name: string };
  const cleanup = async () => {
    await api.delete(`/api/portal/branding/profiles/${profile.id}`).catch(() => {});
  };
  return { profile, cleanup };
}

test.describe('Brand Profile editor — UI baseline @branding @critical', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('messaging edits persist across reload', async ({ page, clientApi }) => {
    const profileName = `BRAND-baseline-msg-${Date.now()}`;
    const { profile, cleanup } = await createBrandProfile(clientApi, profileName);
    cleanups.push(cleanup);

    await loginAsClient(page);
    await page.goto(`/portal/branding/profiles/${profile.id}?tab=messaging`);
    await page.waitForLoadState('networkidle');

    // The "Company Identity" heading is unique to the messaging tab and only
    // renders once it hydrates with profile data.
    await expect(page.getByRole('heading', { name: /Company Identity/i })).toBeVisible({ timeout: 15_000 });

    // Type into Company Name + Mission Statement
    const companyName = page.getByPlaceholder('Acme Corp');
    await companyName.fill('BRAND-co');
    const mission = page.getByPlaceholder("What is your company's mission?");
    await mission.fill('BRAND-mission-text');

    // Click save and wait for the messaging PUT to complete (the messaging
    // tab is dirty so a PUT to /api/portal/branding/messaging fires).
    const saveResp = page.waitForResponse(
      (r) =>
        r.url().includes('/api/portal/branding/messaging') &&
        r.request().method() === 'PUT',
      { timeout: 15_000 },
    );
    await page.getByRole('button', { name: /Save Changes|Saving/i }).click();
    await saveResp;

    // Reload — values must persist
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /Company Identity/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByPlaceholder('Acme Corp')).toHaveValue('BRAND-co');
    await expect(page.getByPlaceholder("What is your company's mission?")).toHaveValue('BRAND-mission-text');
  });

  test('color tab edits persist across reload', async ({ page, clientApi }) => {
    const profileName = `BRAND-baseline-color-${Date.now()}`;
    const { profile, cleanup } = await createBrandProfile(clientApi, profileName);
    cleanups.push(cleanup);

    await loginAsClient(page);
    await page.goto(`/portal/branding/profiles/${profile.id}?tab=colors`);
    await page.waitForLoadState('networkidle');

    // Anchor on a heading unique to the colors tab (the tab's "Link Colors"
    // sub-heading is unique within the page once Colors tab renders).
    await expect(page.getByRole('heading', { name: /Link Colors/i })).toBeVisible({ timeout: 15_000 });

    // Find the primary color text input (hex). The Colors grid renders
    // each role with both <input type="color"> and <input type="text">
    // for the hex. We target the primary text by its (font-mono) value.
    const primaryHexInput = page.locator('input[type="text"]').filter({ hasText: '' }).nth(0);
    // Fallback: locate the first text input next to a color input whose
    // value matches the seeded primary.
    const seededPrimary = '#3b82f6';
    const primaryInput = page.locator(`input[type="text"][value="${seededPrimary}"]`).first();
    await expect(primaryInput).toBeVisible({ timeout: 10_000 });
    await primaryInput.fill('#10b981');

    // Click save and wait for the PUT to complete.
    const saveResp = page.waitForResponse(
      (r) =>
        r.url().includes(`/api/portal/branding/profiles/${profile.id}`) &&
        r.request().method() === 'PUT',
      { timeout: 15_000 },
    );
    await page.getByRole('button', { name: /Save Changes|Saving/i }).click();
    await saveResp;

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /Link Colors/i })).toBeVisible({ timeout: 15_000 });
    // After reload the value should be #10b981 on a text input
    await expect(page.locator('input[type="text"][value="#10b981"]').first()).toBeVisible({ timeout: 10_000 });
    // Mark unused locator referenced
    void primaryHexInput;
  });

  test('AI rewrite modal opens for messaging field', async ({ page, clientApi }) => {
    const profileName = `BRAND-baseline-rewrite-${Date.now()}`;
    const { profile, cleanup } = await createBrandProfile(clientApi, profileName);
    cleanups.push(cleanup);

    await loginAsClient(page);
    await page.goto(`/portal/branding/profiles/${profile.id}?tab=messaging`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /Company Identity/i })).toBeVisible({ timeout: 15_000 });

    // The Mission Statement field has a sibling button with title="Rewrite
    // with AI" (icon-only — no accessible role-name). Use a title locator.
    const rewriteButtons = page.locator('button[title="Rewrite with AI"]');
    await expect(rewriteButtons.first()).toBeVisible({ timeout: 5_000 });
    await rewriteButtons.first().click();

    // Modal heading should appear (matches "Rewrite: <label>")
    await expect(page.getByRole('heading', { name: /^Rewrite:/i })).toBeVisible({ timeout: 5_000 });
  });
});
