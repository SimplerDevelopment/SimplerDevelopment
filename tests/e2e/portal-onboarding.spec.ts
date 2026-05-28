/**
 * Onboarding flow E2E tests.
 *
 * Covers:
 *   - /api/portal/onboarding GET returns initial state and lazily creates a row
 *   - PATCH persists step + answers (with field sanitization)
 *   - POST { action: 'complete' } stamps completedAt
 *   - POST { action: 'reopen' } clears completedAt
 *   - Browser flow: a user with NULL completedAt is redirected from
 *     /portal/dashboard → /portal/onboarding, can advance through every step,
 *     and lands back on /portal/dashboard after the final celebration
 *   - "Skip for now" short-circuits to dashboard and marks complete
 *
 * Each test resets the user's onboarding state via the `reopen` action so the
 * suite can run repeatedly without state bleed between runs.
 */

import { test, expect } from './setup/fixtures';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Onboarding API @onboarding @critical', () => {
  test.beforeEach(async ({ clientApi }) => {
    // Reset to a clean wizard for every test.
    await clientApi.post('/api/portal/onboarding', { action: 'reopen' });
  });

  test('GET returns initial state with prefill', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/onboarding');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toHaveProperty('step');
    expect(res.data.data).toHaveProperty('answers');
    expect(res.data.data).toHaveProperty('completedAt');
    expect(res.data.data).toHaveProperty('prefill');
    expect(res.data.data.prefill).toHaveProperty('name');
    expect(res.data.data.prefill).toHaveProperty('email');
    expect(res.data.data.completedAt).toBeNull();
  });

  test('PATCH persists step and answers', async ({ clientApi }) => {
    const res = await clientApi.patch('/api/portal/onboarding', {
      step: 'about-you',
      answers: { role: 'marketing', timezone: 'America/New_York' },
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.step).toBe('about-you');
    expect(res.data.data.answers.role).toBe('marketing');
    expect(res.data.data.answers.timezone).toBe('America/New_York');

    // Round-trip: GET should reflect what we just wrote.
    const after = await clientApi.get('/api/portal/onboarding');
    expect(after.data.data.step).toBe('about-you');
    expect(after.data.data.answers.role).toBe('marketing');
  });

  test('PATCH rejects unknown step', async ({ clientApi }) => {
    const res = await clientApi.patch('/api/portal/onboarding', { step: 'lol-no' });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('PATCH ignores unknown answer fields and truncates strings', async ({ clientApi }) => {
    const longMission = 'x'.repeat(2000);
    const res = await clientApi.patch('/api/portal/onboarding', {
      answers: {
        mission: longMission,
        // Unknown fields silently dropped.
        nuclearLaunchCode: 'pew pew',
      } as Record<string, unknown>,
    });
    expect(res.status).toBe(200);
    expect(res.data.data.answers.mission.length).toBe(1000);
    expect(res.data.data.answers).not.toHaveProperty('nuclearLaunchCode');
  });

  test('POST complete stamps completedAt', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/onboarding', { action: 'complete' });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.completedAt).not.toBeNull();
    expect(res.data.data.step).toBe('done');
  });

  test('POST reopen clears completedAt but preserves answers', async ({ clientApi }) => {
    await clientApi.patch('/api/portal/onboarding', {
      answers: { mission: 'Save the bees' },
    });
    await clientApi.post('/api/portal/onboarding', { action: 'complete' });

    const reopened = await clientApi.post('/api/portal/onboarding', { action: 'reopen' });
    expect(reopened.status).toBe(200);
    expect(reopened.data.data.completedAt).toBeNull();
    expect(reopened.data.data.step).toBe('welcome');
    expect(reopened.data.data.answers.mission).toBe('Save the bees');
  });

  test('GET rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/onboarding');
    expect(res.status).toBe(401);
  });
});

test.describe('Onboarding wizard browser flow @onboarding', () => {
  test.beforeEach(async ({ clientApi }) => {
    await clientApi.post('/api/portal/onboarding', { action: 'reopen' });
  });

  test('Dashboard redirects new users to onboarding', async ({ page, loginAsOtherClient }) => {
    await loginAsOtherClient(page);
    await page.goto(`${BASE_URL}/portal/dashboard`);
    await expect(page).toHaveURL(/\/portal\/onboarding$/);
    await expect(page.getByTestId('onboarding-step-welcome')).toBeVisible();
  });

  test('Skip button stamps complete and bounces to dashboard', async ({ page, loginAsOtherClient }) => {
    await loginAsOtherClient(page);
    await page.goto(`${BASE_URL}/portal/onboarding`);
    await expect(page.getByTestId('onboarding-step-welcome')).toBeVisible();
    const completeReq = page.waitForResponse((r) => r.url().endsWith('/api/portal/onboarding') && r.request().method() === 'POST');
    await page.getByTestId('onboarding-skip-all').click();
    await completeReq;
    await expect(page).toHaveURL(/\/portal\/dashboard$/, { timeout: 15_000 });
  });

  test('Wizard advances through every step and finishes', async ({ page, loginAsOtherClient }) => {
    await loginAsOtherClient(page);
    await page.goto(`${BASE_URL}/portal/onboarding`);

    // 1. Welcome
    await expect(page.getByTestId('onboarding-step-welcome')).toBeVisible();
    await page.getByTestId('onboarding-welcome-start').click();

    // 2. About you (auto-advances on click)
    await expect(page.getByTestId('onboarding-step-about-you')).toBeVisible();
    await page.getByTestId('onboarding-role-marketing').click();

    // 3. About company
    await expect(page.getByTestId('onboarding-step-about-company')).toBeVisible();
    await page.getByTestId('onboarding-size-small').click();
    await page.getByTestId('onboarding-company-next').click();

    // 4. Brand vibe
    await expect(page.getByTestId('onboarding-step-brand-vibe')).toBeVisible();
    await page.getByTestId('onboarding-tone-professional').click();
    await page.getByTestId('onboarding-tone-friendly').click();
    await page.getByTestId('onboarding-color-7c3aed').click();
    await page.getByTestId('onboarding-brand-next').click();

    // 5. Mission
    await expect(page.getByTestId('onboarding-step-mission')).toBeVisible();
    await page.getByTestId('onboarding-mission').fill('We help indie founders ship faster.');
    await page.getByTestId('onboarding-mission-next').click();

    // 6. Features
    await expect(page.getByTestId('onboarding-step-features')).toBeVisible();
    await page.getByTestId('onboarding-feature-website').click();
    await page.getByTestId('onboarding-feature-crm').click();
    await page.getByTestId('onboarding-features-next').click();

    // 7. Power up — skip the MCP/skills boxes, just continue
    await expect(page.getByTestId('onboarding-step-power-up')).toBeVisible();
    await expect(page.getByTestId('onboarding-power-skills')).toBeVisible();
    await expect(page.getByTestId('onboarding-power-mcp')).toBeVisible();
    await page.getByTestId('onboarding-power-next').click();

    // 8. Done → click to dashboard
    await expect(page.getByTestId('onboarding-step-done')).toBeVisible();
    const completeReq = page.waitForResponse((r) => r.url().endsWith('/api/portal/onboarding') && r.request().method() === 'POST');
    await page.getByTestId('onboarding-done-go-dashboard').click();
    await completeReq;
    await expect(page).toHaveURL(/\/portal\/dashboard$/, { timeout: 15_000 });
  });

  test('Power-up step can generate an MCP key inline', async ({ page, loginAsOtherClient }) => {
    await loginAsOtherClient(page);
    // Skip ahead to power-up.
    await page.request.patch('/api/portal/onboarding', {
      data: { step: 'power-up' },
      headers: { 'Content-Type': 'application/json' },
    });
    await page.goto(`${BASE_URL}/portal/onboarding`);

    await expect(page.getByTestId('onboarding-step-power-up')).toBeVisible();
    await page.getByTestId('onboarding-mcp-generate').click();

    // Wait for the new key to appear.
    const keyEl = page.getByTestId('onboarding-mcp-key');
    await expect(keyEl).toBeVisible({ timeout: 10_000 });
    const keyText = await keyEl.textContent();
    expect(keyText).toMatch(/^sd_mcp_/);
  });
});
