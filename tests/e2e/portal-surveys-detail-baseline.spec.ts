/**
 * Portal Surveys Detail — Refactor Baseline Spec
 *
 * Pinned baseline before extracting subcomponents from
 * app/portal/surveys/[id]/page.tsx. Drives the page through the browser to
 * lock in current behavior:
 *   - login + navigate to surveys list
 *   - create survey via API helper, navigate to /portal/surveys/{id}
 *   - add a text question; save; reload; assert persists
 *   - edit the question label; save; reload; assert persists
 *   - add a multiple-choice question; save; assert persists
 *   - reorder the two questions; assert order persists
 *   - open analytics tab; assert it renders (zero responses is fine)
 *   - cleanup: delete survey
 *
 * Test data is prefixed with SURVEY- per the refactor plan.
 *
 * Note: tab buttons render as `<button><span class="material-icons">edit</span>
 * Edit</button>`. The icon glyph's text is NOT aria-hidden, so the button's
 * accessible name includes the icon name ("edit Edit"). We locate tabs by
 * filtering buttons with `hasText` instead of role+name regex.
 */
import type { Locator, Page } from '@playwright/test';
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

/** Click a top-level tab on the survey detail page. Tabs live inside the
 *  border-bottom flex container. We resolve by ordinal index, which matches
 *  the page's authoritative tab order (overview, edit, recommendation,
 *  responses, analytics, share, settings). */
const TAB_INDEX: Record<string, number> = {
  overview: 0,
  edit: 1,
  recommendation: 2,
  responses: 3,
  analytics: 4,
  share: 5,
  settings: 6,
};

async function clickTab(page: Page, key: keyof typeof TAB_INDEX) {
  // Wait for the tab strip to render (7 tab buttons).
  const tabStrip = page.locator('div.border-b.border-border > button');
  await expect(tabStrip.nth(TAB_INDEX.settings)).toBeVisible({ timeout: 20_000 });
  await tabStrip.nth(TAB_INDEX[key]).click();
}

/** Locate the page-header survey title (h1). The h1 is the most reliable
 *  signal that the survey detail page has finished its initial fetch. */
function surveyHeading(page: Page, title: string): Locator {
  return page.locator('h1').filter({ hasText: title });
}

/** Create a survey for the baseline; returns survey + cleanup. Yields null when service-gated. */
async function createBaselineSurvey(api: ApiClient) {
  const ts = Date.now();
  const res = await api.post('/api/portal/surveys', {
    title: `SURVEY-baseline-${ts}`,
    description: 'Refactor baseline survey',
    fields: [],
  });
  if (res.status === 403) return null;
  if (!res.data?.success) throw new Error(`Failed to create survey: ${res.data?.message}`);
  const survey = res.data.data;
  return {
    survey,
    cleanup: async () => {
      await api.delete(`/api/portal/surveys/${survey.id}`).catch(() => {});
    },
  };
}

test.describe('Portal Surveys Detail — Refactor Baseline @critical @surveys', () => {
  let cleanups: Array<() => Promise<void>> = [];
  let hasAccess = false;

  test.beforeAll(async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/surveys');
    hasAccess = res.status === 200;
  });

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('navigates from surveys list to detail page', async ({ page, clientApi }) => {
    test.skip(!hasAccess, 'No surveys subscription');
    const result = await createBaselineSurvey(clientApi);
    expect(result).toBeTruthy();
    cleanups.push(result!.cleanup);

    await loginAsClient(page);
    await page.goto('/portal/surveys');
    // Survey title should appear in the list
    await expect(page.getByText(result!.survey.title).first()).toBeVisible({ timeout: 30_000 });

    // Navigate to detail page directly (link variations vary by row layout).
    await page.goto(`/portal/surveys/${result!.survey.id}`);
    await expect(surveyHeading(page, result!.survey.title)).toBeVisible({ timeout: 30_000 });
  });

  test('add a text question, save, reload, persists', async ({ page, clientApi }) => {
    test.skip(!hasAccess, 'No surveys subscription');
    const result = await createBaselineSurvey(clientApi);
    expect(result).toBeTruthy();
    cleanups.push(result!.cleanup);

    await loginAsClient(page);
    await page.goto(`/portal/surveys/${result!.survey.id}`);
    await expect(surveyHeading(page, result!.survey.title)).toBeVisible({ timeout: 30_000 });

    // Switch to Edit tab
    await clickTab(page, 'edit');

    // Click "Add Field"
    await page.locator('button', { hasText: 'Add Field' }).first().click();

    // Pick "Short Text"
    await page.locator('button', { hasText: 'Short Text' }).first().click();

    // Edit label inside the expanded editor (the label input is the first Label
    // input visible after adding). Use the unique placeholder from SurveyBuilder.
    const labelInput = page.locator('input[placeholder="e.g. What is your domain name?"]').first();
    await expect(labelInput).toBeVisible({ timeout: 10_000 });
    await labelInput.fill('SURVEY-baseline-question-1');

    // Save Changes
    // The "Saved" success toast clears after 2s, so we synchronize on the
    // network response from the PUT instead of the ephemeral DOM banner.
    const saveResponse = page.waitForResponse(
      (resp) => resp.url().includes('/api/portal/surveys/') && resp.request().method() === 'PUT',
      { timeout: 15_000 },
    );
    await page.locator('button', { hasText: 'Save Changes' }).click();
    const saveResp = await saveResponse;
    expect(saveResp.status(), 'Save Changes PUT should succeed').toBe(200);

    // Verify via API (reload-equivalent)
    const verify = await clientApi.get(`/api/portal/surveys/${result!.survey.id}`);
    expect(verify.data.data.fields.length).toBe(1);
    expect(verify.data.data.fields[0].type).toBe('text');
    expect(verify.data.data.fields[0].label).toBe('SURVEY-baseline-question-1');

    // Reload the page and assert label persists in the DOM
    await page.reload();
    await expect(surveyHeading(page, result!.survey.title)).toBeVisible({ timeout: 30_000 });
    await clickTab(page, 'edit');
    await expect(page.getByText('SURVEY-baseline-question-1').first()).toBeVisible({ timeout: 10_000 });
  });

  test('edit question label, save, reload, persists', async ({ page, clientApi }) => {
    test.skip(!hasAccess, 'No surveys subscription');
    const result = await createBaselineSurvey(clientApi);
    expect(result).toBeTruthy();
    cleanups.push(result!.cleanup);

    // Seed one question via API
    await clientApi.put(`/api/portal/surveys/${result!.survey.id}`, {
      fields: [
        { id: 'q-edit-1', type: 'text', label: 'SURVEY-original-label', required: false, options: [], placeholder: '', helpText: '', order: 0 },
      ],
    });

    await loginAsClient(page);
    await page.goto(`/portal/surveys/${result!.survey.id}`);
    await expect(surveyHeading(page, result!.survey.title)).toBeVisible({ timeout: 30_000 });
    await clickTab(page, 'edit');

    // Expand the field card via the Edit (pencil) button
    await page.getByTitle('Edit', { exact: true }).first().click();

    // Change the label
    const labelInput = page.locator('input[placeholder="e.g. What is your domain name?"]').first();
    await expect(labelInput).toBeVisible();
    await labelInput.fill('SURVEY-edited-label');

    // The "Saved" success toast clears after 2s, so we synchronize on the
    // network response from the PUT instead of the ephemeral DOM banner.
    const saveResponse = page.waitForResponse(
      (resp) => resp.url().includes('/api/portal/surveys/') && resp.request().method() === 'PUT',
      { timeout: 15_000 },
    );
    await page.locator('button', { hasText: 'Save Changes' }).click();
    const saveResp = await saveResponse;
    expect(saveResp.status(), 'Save Changes PUT should succeed').toBe(200);

    const verify = await clientApi.get(`/api/portal/surveys/${result!.survey.id}`);
    expect(verify.data.data.fields[0].label).toBe('SURVEY-edited-label');

    await page.reload();
    await expect(surveyHeading(page, result!.survey.title)).toBeVisible({ timeout: 30_000 });
    await clickTab(page, 'edit');
    await expect(page.getByText('SURVEY-edited-label').first()).toBeVisible({ timeout: 10_000 });
  });

  test('add a multiple-choice question and persist', async ({ page, clientApi }) => {
    test.skip(!hasAccess, 'No surveys subscription');
    const result = await createBaselineSurvey(clientApi);
    expect(result).toBeTruthy();
    cleanups.push(result!.cleanup);

    // Seed an existing text question
    await clientApi.put(`/api/portal/surveys/${result!.survey.id}`, {
      fields: [
        { id: 'q-mc-base', type: 'text', label: 'SURVEY-base-text', required: false, options: [], placeholder: '', helpText: '', order: 0 },
      ],
    });

    await loginAsClient(page);
    await page.goto(`/portal/surveys/${result!.survey.id}`);
    await expect(surveyHeading(page, result!.survey.title)).toBeVisible({ timeout: 30_000 });
    await clickTab(page, 'edit');

    await page.locator('button', { hasText: 'Add Field' }).first().click();
    await page.locator('button', { hasText: 'Multiple Choice' }).first().click();

    // Update the label of the newly-added (expanded) field — last visible label input.
    const labelInputs = page.locator('input[placeholder="e.g. What is your domain name?"]');
    await expect(labelInputs.last()).toBeVisible({ timeout: 10_000 });
    await labelInputs.last().fill('SURVEY-baseline-mc');

    // The "Saved" success toast clears after 2s, so we synchronize on the
    // network response from the PUT instead of the ephemeral DOM banner.
    const saveResponse = page.waitForResponse(
      (resp) => resp.url().includes('/api/portal/surveys/') && resp.request().method() === 'PUT',
      { timeout: 15_000 },
    );
    await page.locator('button', { hasText: 'Save Changes' }).click();
    const saveResp = await saveResponse;
    expect(saveResp.status(), 'Save Changes PUT should succeed').toBe(200);

    const verify = await clientApi.get(`/api/portal/surveys/${result!.survey.id}`);
    expect(verify.data.data.fields.length).toBe(2);
    const mc = verify.data.data.fields.find((f: { type: string }) => f.type === 'radio');
    expect(mc).toBeTruthy();
    expect(mc.label).toBe('SURVEY-baseline-mc');
  });

  test('reorder questions persists', async ({ page, clientApi }) => {
    test.skip(!hasAccess, 'No surveys subscription');
    const result = await createBaselineSurvey(clientApi);
    expect(result).toBeTruthy();
    cleanups.push(result!.cleanup);

    // Seed two questions; we'll drive reordering programmatically through the
    // UI's Down arrow, which is the same codepath the manual button uses.
    await clientApi.put(`/api/portal/surveys/${result!.survey.id}`, {
      fields: [
        { id: 'q-order-a', type: 'text', label: 'SURVEY-question-A', required: false, options: [], placeholder: '', helpText: '', order: 0 },
        { id: 'q-order-b', type: 'text', label: 'SURVEY-question-B', required: false, options: [], placeholder: '', helpText: '', order: 1 },
      ],
    });

    await loginAsClient(page);
    await page.goto(`/portal/surveys/${result!.survey.id}`);
    await expect(surveyHeading(page, result!.survey.title)).toBeVisible({ timeout: 30_000 });
    await clickTab(page, 'edit');

    // Click the first "Move down" button (belongs to question A → swaps with B).
    await page.getByTitle('Move down').first().click();
    // The "Saved" success toast clears after 2s, so we synchronize on the
    // network response from the PUT instead of the ephemeral DOM banner.
    const saveResponse = page.waitForResponse(
      (resp) => resp.url().includes('/api/portal/surveys/') && resp.request().method() === 'PUT',
      { timeout: 15_000 },
    );
    await page.locator('button', { hasText: 'Save Changes' }).click();
    const saveResp = await saveResponse;
    expect(saveResp.status(), 'Save Changes PUT should succeed').toBe(200);

    const verify = await clientApi.get(`/api/portal/surveys/${result!.survey.id}`);
    expect(verify.data.data.fields[0].id).toBe('q-order-b');
    expect(verify.data.data.fields[1].id).toBe('q-order-a');
  });

  test('analytics tab renders (zero responses ok)', async ({ page, clientApi }) => {
    test.skip(!hasAccess, 'No surveys subscription');
    const result = await createBaselineSurvey(clientApi);
    expect(result).toBeTruthy();
    cleanups.push(result!.cleanup);

    await loginAsClient(page);
    await page.goto(`/portal/surveys/${result!.survey.id}`);
    await expect(surveyHeading(page, result!.survey.title)).toBeVisible({ timeout: 30_000 });

    await clickTab(page, 'analytics');
    // Zero-state message
    await expect(page.getByText(/No responses to analyze yet/)).toBeVisible({ timeout: 10_000 });
  });
});
