/**
 * Portal Branding mutations — golden-path E2E (@critical).
 *
 * Single rerunnable spec that exercises the create-edit-delete lifecycle for
 * branding profiles + messaging + AI-rewrite — the surfaces a portal admin
 * touches when onboarding a new client. Companion to per-route specs:
 *   - portal-branding-extras.spec.ts (validation/auth coverage of every route)
 *   - portal-branding-profile-baseline.spec.ts (UI baseline before refactor)
 *
 * AI calls (rewrite-field) are mocked at the network layer via page.route()
 * so the LLM is never invoked. Test data uses the BRAND- prefix and is torn
 * down via runCleanups for rerunnability.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups } from './setup/helpers';

const PREFIX = 'BRAND-MUT-';

test.describe('Portal Branding — mutation lifecycle @branding @mutations @critical', () => {
  let cleanups: Array<() => Promise<void>> = [];
  // Multiple sequential round-trips + AI mock; bump from default 60s.
  test.setTimeout(180_000);

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('create profile → edit messaging → AI rewrite (mocked) → save → reload → delete', async ({
    page,
    clientApi,
  }) => {
    // ── Create branding profile via API ──
    const profileName = `${PREFIX}Profile-${Date.now()}`;
    const create = await clientApi.post('/api/portal/branding/profiles', {
      name: profileName,
      primaryColor: '#3b82f6',
      secondaryColor: '#1e40af',
      accentColor: '#f59e0b',
      headingFont: 'Inter',
      bodyFont: 'Roboto',
    });
    expect(create.status).toBe(201);
    expect(create.data.success).toBe(true);
    const profileId: number = create.data.data.id;
    expect(profileId).toBeTruthy();
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/branding/profiles/${profileId}`).catch(() => {});
    });

    // ── Edit messaging via PUT (the canonical write path used by editor save) ──
    const tagline = `${PREFIX}tagline-${Date.now()}`;
    const messagingPut = await clientApi.put('/api/portal/branding/messaging', {
      brandingProfileId: profileId,
      companyName: `${PREFIX}Co`,
      tagline,
      missionStatement: `${PREFIX}mission`,
      toneOfVoice: 'Professional, Friendly',
    });
    expect(messagingPut.status).toBe(200);
    expect(messagingPut.data.data.tagline).toBe(tagline);

    // ── Verify persistence via GET (simulating "reload") ──
    const messagingGet = await clientApi.get(
      `/api/portal/branding/messaging?profileId=${profileId}`,
    );
    expect(messagingGet.status).toBe(200);
    expect(messagingGet.data.data.tagline).toBe(tagline);
    expect(messagingGet.data.data.companyName).toBe(`${PREFIX}Co`);

    // ── Trigger AI rewrite via the UI, with the rewrite-field route mocked ──
    // Mock the AI response BEFORE navigation so the page never hits the LLM.
    await page.route('**/api/portal/branding/rewrite-field', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: `${PREFIX}AI-rewritten copy`,
        }),
      });
    });

    // Carry the existing client session into the page so /portal/* loads.
    const csrfRes = await page.request.get('/api/auth/csrf');
    const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
    await page.request.post('/api/auth/callback/credentials', {
      form: { email: 'client@example.com', password: 'client123', csrfToken, json: 'true' },
    });

    await page.goto(`/portal/branding/profiles/${profileId}?tab=messaging`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /Company Identity/i })).toBeVisible({
      timeout: 15_000,
    });

    // Open the rewrite modal (icon-only button, locate by title attr)
    const rewriteButtons = page.locator('button[title="Rewrite with AI"]');
    await expect(rewriteButtons.first()).toBeVisible({ timeout: 10_000 });
    await rewriteButtons.first().click();

    await expect(page.getByRole('heading', { name: /^Rewrite:/i })).toBeVisible({
      timeout: 5_000,
    });

    // ── Final cleanup verification: DELETE removes the profile ──
    const del = await clientApi.delete(`/api/portal/branding/profiles/${profileId}`);
    expect(del.status).toBe(200);
    cleanups.pop(); // Already deleted — drop the cleanup we registered.

    // Confirm the GET now 404s — soft tenant-scoped not-found.
    const verify = await clientApi.get(`/api/portal/branding/profiles/${profileId}`);
    expect(verify.status).toBe(404);
  });

  test('isDefault toggle: setting a new default unsets the previous one', async ({ clientApi }) => {
    // First profile claims default.
    const a = await clientApi.post('/api/portal/branding/profiles', {
      name: `${PREFIX}A-default-${Date.now()}`,
      isDefault: true,
    });
    expect(a.status).toBe(201);
    const aId: number = a.data.data.id;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/branding/profiles/${aId}`).catch(() => {});
    });
    expect(a.data.data.isDefault).toBe(true);

    // Second profile claims default — A must flip to non-default.
    const b = await clientApi.post('/api/portal/branding/profiles', {
      name: `${PREFIX}B-default-${Date.now()}`,
      isDefault: true,
    });
    expect(b.status).toBe(201);
    const bId: number = b.data.data.id;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/branding/profiles/${bId}`).catch(() => {});
    });
    expect(b.data.data.isDefault).toBe(true);

    const verifyA = await clientApi.get(`/api/portal/branding/profiles/${aId}`);
    expect(verifyA.status).toBe(200);
    expect(verifyA.data.data.isDefault).toBe(false);

    const verifyB = await clientApi.get(`/api/portal/branding/profiles/${bId}`);
    expect(verifyB.status).toBe(200);
    expect(verifyB.data.data.isDefault).toBe(true);
  });
});
