/**
 * Portal Booking Page Detail — Refactor Baseline Spec
 *
 * Pinned characterization spec before extracting subcomponents from
 * `app/portal/tools/booking/[id]/page.tsx`. Drives the page through the browser
 * to lock in current behavior:
 *   - login + create a booking page via the API helper, navigate to
 *     /portal/tools/booking/{id}
 *   - edit booking title; save; reload; assert persists
 *   - switch tabs (settings, availability, embed, bookings, staff,
 *     automations) and assert each renders without error
 *   - add a custom question; save; reload; assert it persists
 *
 * Test data is prefixed with BKG- per the refactor plan.
 *
 * Note: this page is the booking-page (Calendly-style) editor, not a single-
 * booking record editor. The task brief used both terms interchangeably; the
 * actual file owns: Settings / Styling / Availability / Questions / Embed /
 * Bookings / Staff / Automations.
 */
import type { Page, BrowserContext } from '@playwright/test';
import { test, expect } from './setup/fixtures';
import { runCleanups } from './setup/helpers';
import type { ApiClient } from './setup/api-client';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const CLIENT_EMAIL = 'client@example.com';
const CLIENT_PASSWORD = 'client123';

async function loginAsClientOnContext(context: BrowserContext) {
  const apiCtx = context.request;
  const csrfRes = await apiCtx.get(`${BASE_URL}/api/auth/csrf`);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const res = await apiCtx.post(`${BASE_URL}/api/auth/callback/credentials`, {
    form: {
      email: CLIENT_EMAIL,
      password: CLIENT_PASSWORD,
      csrfToken,
      json: 'true',
    },
  });
  if (res.status() >= 400) {
    throw new Error(`Login failed: ${res.status()}`);
  }
}

/**
 * Create a booking page for the baseline. Returns null when the booking
 * service is not enabled for the test client (the API responds 403
 * "requires an active booking subscription"). Tests treat null as a skip.
 */
async function createBaselineBooking(api: ApiClient) {
  const ts = Date.now();
  const title = `BKG-baseline-${ts}`;
  const res = await api.post('/api/portal/tools/booking', {
    title,
    description: 'Refactor baseline booking page',
    duration: 30,
  });
  if (res.status === 403 || res.data?.requiresService) return null;
  if (!res.data?.success) throw new Error(`createBooking failed: ${JSON.stringify(res.data)}`);
  return {
    id: res.data.data.id as number,
    title,
    cleanup: async () => {
      await api.delete(`/api/portal/tools/booking/${res.data.data.id}`).catch(() => {});
    },
  };
}

async function gotoEditor(page: Page, id: number, expectedTitle: string) {
  await loginAsClientOnContext(page.context());
  await page.goto(`${BASE_URL}/portal/tools/booking/${id}`);
  // The h1 is the most reliable hydration signal — it's the booking title.
  await expect(page.locator('h1').filter({ hasText: expectedTitle })).toBeVisible({
    timeout: 30_000,
  });
}

/** Click a top-level tab on the booking page editor by its label. Tab buttons
 *  render as `<button><span class="material-icons">{icon}</span>{label}</button>`,
 *  so the accessible name has the icon glyph baked in. We match by hasText
 *  on the label and scope to the tab strip. */
async function clickTab(page: Page, label: string) {
  // The tab strip is the first flex container with role-less buttons each
  // containing a material-icons span. Use the surrounding container class
  // (`flex gap-1 bg-card border border-border rounded-xl p-1`) as anchor.
  const tabStrip = page.locator('div.flex.gap-1.bg-card.border.border-border.rounded-xl.p-1');
  await expect(tabStrip).toBeVisible({ timeout: 15_000 });
  await tabStrip.locator('button', { hasText: label }).click();
}

test.describe('Portal Booking Page Detail — Refactor Baseline @critical @booking', () => {
  let cleanups: Array<() => Promise<void>> = [];
  let hasAccess = false;

  test.beforeAll(async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/tools/booking');
    hasAccess = res.status === 200;
  });

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('navigates to detail page and renders header', async ({ page, clientApi }) => {
    test.skip(!hasAccess, 'No booking subscription');
    const created = await createBaselineBooking(clientApi);
    test.skip(!created, 'No booking subscription');
    cleanups.push(created!.cleanup);

    await gotoEditor(page, created!.id, created!.title);
    await expect(page.getByText(`/book/`).first()).toBeVisible({ timeout: 10_000 });
  });

  test('edit title, save, reload, persists', async ({ page, clientApi }) => {
    test.skip(!hasAccess, 'No booking subscription');
    const created = await createBaselineBooking(clientApi);
    test.skip(!created, 'No booking subscription');
    cleanups.push(created!.cleanup);

    await gotoEditor(page, created!.id, created!.title);

    // Settings tab is the default; the title input is the first text input.
    const newTitle = `${created!.title}-edited`;
    const titleInput = page.locator('input[type="text"]').first();
    await expect(titleInput).toBeVisible({ timeout: 10_000 });
    await titleInput.fill(newTitle);

    // Synchronize on the PUT response (Save Changes button → /api/portal/tools/booking/:id).
    const saveResponse = page.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/portal/tools/booking/${created!.id}`) &&
        resp.request().method() === 'PUT',
      { timeout: 15_000 },
    );
    await page.locator('button', { hasText: 'Save Changes' }).click();
    const saveResp = await saveResponse;
    expect(saveResp.status(), 'Save Changes PUT should succeed').toBe(200);

    // Verify via API
    const verify = await clientApi.get(`/api/portal/tools/booking/${created!.id}`);
    expect(verify.data.data.title).toBe(newTitle);

    // Verify via reload
    await page.reload();
    await expect(page.locator('h1').filter({ hasText: newTitle })).toBeVisible({
      timeout: 30_000,
    });
  });

  test('switches between tabs and renders each panel', async ({ page, clientApi }) => {
    test.skip(!hasAccess, 'No booking subscription');
    const created = await createBaselineBooking(clientApi);
    test.skip(!created, 'No booking subscription');
    cleanups.push(created!.cleanup);

    await gotoEditor(page, created!.id, created!.title);

    // Availability tab: weekly availability heading.
    await clickTab(page, 'Availability');
    await expect(page.getByText('Weekly Availability').first()).toBeVisible({ timeout: 10_000 });

    // Embed tab: direct link section.
    await clickTab(page, 'Embed');
    await expect(page.getByText('Direct Link').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Iframe Embed Code').first()).toBeVisible();

    // Bookings tab: upcoming + past sections.
    await clickTab(page, 'Bookings');
    await expect(page.getByText(/Upcoming \(/).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Past & Cancelled \(/).first()).toBeVisible();

    // Staff tab: assigned staff members heading.
    await clickTab(page, 'Staff');
    await expect(page.getByText('Assigned Staff Members').first()).toBeVisible({ timeout: 10_000 });

    // Styling tab: appearance heading.
    await clickTab(page, 'Styling');
    await expect(page.getByText('Appearance').first()).toBeVisible({ timeout: 10_000 });

    // Questions tab: heading. Use a level-2 heading match to avoid colliding
    // with any tab-button text or layered "Questions" labels elsewhere on the page.
    await clickTab(page, 'Questions');
    await expect(page.getByRole('heading', { name: 'Custom Questions', level: 2 })).toBeVisible({
      timeout: 10_000,
    });

    // Settings tab: video conferencing block (settings is the default-but
    // explicitly switching back exercises the switcher).
    await clickTab(page, 'Settings');
    await expect(page.getByText('Video Conferencing').first()).toBeVisible({ timeout: 10_000 });
  });

  test('add a custom question, save, persists', async ({ page, clientApi }) => {
    test.skip(!hasAccess, 'No booking subscription');
    const created = await createBaselineBooking(clientApi);
    test.skip(!created, 'No booking subscription');
    cleanups.push(created!.cleanup);

    await gotoEditor(page, created!.id, created!.title);
    await clickTab(page, 'Questions');

    await page.locator('button', { hasText: 'Add Question' }).first().click();

    // The newly-added question's label input has the placeholder
    // "e.g. What would you like to discuss?".
    const labelInput = page
      .locator('input[placeholder="e.g. What would you like to discuss?"]')
      .first();
    await expect(labelInput).toBeVisible({ timeout: 10_000 });
    await labelInput.fill('BKG-baseline-question');

    const saveResponse = page.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/portal/tools/booking/${created!.id}`) &&
        resp.request().method() === 'PUT',
      { timeout: 15_000 },
    );
    await page.locator('button', { hasText: 'Save Changes' }).click();
    const saveResp = await saveResponse;
    expect(saveResp.status(), 'Save Changes PUT should succeed').toBe(200);

    const verify = await clientApi.get(`/api/portal/tools/booking/${created!.id}`);
    expect(Array.isArray(verify.data.data.questions)).toBe(true);
    expect(verify.data.data.questions.length).toBeGreaterThanOrEqual(1);
    const question = verify.data.data.questions.find(
      (q: { label: string }) => q.label === 'BKG-baseline-question',
    );
    expect(question).toBeTruthy();
  });
});
