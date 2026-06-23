/**
 * Pitch Deck Editor — Refactor Baseline Characterization Spec
 *
 * Pinpoints the user-visible contract of `app/portal/tools/pitch-decks/[id]/page.tsx`
 * before it is split into smaller modules. Run BEFORE the refactor (must be green),
 * run AGAIN after the refactor (must still be green). If anything fails post-refactor,
 * the refactor changed behavior.
 *
 * Scope is intentionally narrow — covers the high-value UI affordances that the
 * extracted SlideList, SlideEditor, SlidePreview, VersionSidebar, GenerateModal,
 * and BatchEditModal modules collectively own:
 *  - Open existing deck → header + slide list render
 *  - Add slide → list grows
 *  - Save → "Saved" indicator appears (PATCH succeeds)
 *  - Open version sidebar → renders, lists at least one version after a save+checkpoint
 *  - Open generate-from-prompt modal (Regenerate) → renders without firing AI
 *  - Close the page (navigate back)
 *
 * Drag reorder is exercised at the DATA level by portal-pitch-decks-v2.spec.ts.
 * UI drag in headless Chromium is too brittle to gate the refactor on.
 *
 * Robustness: each test uses a single `page.goto` after the API client has logged
 * in via the shared session, then waits for a stable DOM marker before asserting.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups } from './setup/helpers';
import type { ApiClient } from './setup/api-client';
import type { Page, BrowserContext } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

/**
 * Sign in via NextAuth on the page's browser context so subsequent page.goto
 * calls are authenticated. Mirrors the in-tree debug-pitch-deck-editor pattern,
 * but issues the login from the page's own request context to avoid cookie
 * isolation between page.request and the actual page navigation.
 */
async function loginAsClientOnContext(context: BrowserContext) {
  const apiCtx = context.request;
  const csrfRes = await apiCtx.get(`${BASE_URL}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();
  const res = await apiCtx.post(`${BASE_URL}/api/auth/callback/credentials`, {
    form: {
      email: 'client@example.com',
      password: 'client123',
      csrfToken,
      json: 'true',
    },
  });
  if (res.status() >= 400) {
    throw new Error(`Login failed: ${res.status()}`);
  }
}

async function gotoEditor(page: Page, id: number) {
  await loginAsClientOnContext(page.context());
  await page.goto(`${BASE_URL}/portal/tools/pitch-decks/${id}`);
  // The page renders a top-level loading spinner until `loading=false`.
  // After that the deck heading (h1) is mounted. Wait for it as the
  // stable hydration signal — independent of the save-button label
  // (which transiently shows "Saving..." during initial brand-defaults sync).
  await page.waitForSelector('h1', { timeout: 30_000 });
  // Also wait for the "N slides" header text to confirm deck data loaded.
  await page.waitForSelector('text=/\\bslides\\b/', { timeout: 15_000 });
}

async function createDeckWithSlides(api: ApiClient) {
  const title = `Refactor Baseline ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const createRes = await api.post('/api/portal/tools/pitch-decks', {
    title,
    description: 'Refactor baseline — auto-deleted',
  });
  if (!createRes.data?.success) throw new Error(`createDeck failed: ${JSON.stringify(createRes.data)}`);
  const id = createRes.data.data.id;

  const ts = Date.now();
  const slides = [
    {
      id: `slide-cover-${ts}`,
      label: 'Cover',
      blocks: [
        { id: `block-hero-${ts}`, type: 'hero', order: 1, title: 'Baseline Deck', subtitle: 'For refactor' },
      ],
    },
    {
      id: `slide-features-${ts}`,
      label: 'Features',
      blocks: [
        { id: `block-h-${ts}`, type: 'heading', order: 1, content: 'Features', level: 2, alignment: 'center' },
      ],
    },
  ];
  const patchRes = await api.patch(`/api/portal/tools/pitch-decks/${id}`, { slides });
  if (!patchRes.data?.success) throw new Error(`seed slides failed: ${JSON.stringify(patchRes.data)}`);

  const cleanup = async () => {
    await api.delete(`/api/portal/tools/pitch-decks/${id}`).catch(() => {});
  };
  return { id, title, cleanup };
}

test.describe('Pitch Deck Editor Page — refactor baseline @pitch-decks @critical', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('opens an existing deck and renders header + slide list', async ({ page, clientApi }) => {
    const { id, title, cleanup } = await createDeckWithSlides(clientApi);
    cleanups.push(cleanup);

    await gotoEditor(page, id);

    // Header title visible (h1 element)
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
    // Slide list shows both seeded slides.
    // Use exact-text match (quotes) to avoid matching the phone-only breadcrumb
    // which prepends the slide index ("1. Cover") and is md:hidden on desktop.
    await expect(page.locator('text="Cover"').first()).toBeVisible();
    await expect(page.locator('text="Features"').first()).toBeVisible();
    // Slide count appears in header
    await expect(page.locator('text=/\\b2 slides\\b/')).toBeVisible();
  });

  test('add slide grows the slide count', async ({ page, clientApi }) => {
    const { id, cleanup } = await createDeckWithSlides(clientApi);
    cleanups.push(cleanup);

    await gotoEditor(page, id);
    await expect(page.locator('text=/\\b2 slides\\b/')).toBeVisible();

    await page.locator('button[title="Add slide"]').first().click();

    await expect(page.locator('text=/\\b3 slides\\b/')).toBeVisible({ timeout: 10_000 });
  });

  test('save button transitions through Update → Saved', async ({ page, clientApi }) => {
    const { id, cleanup } = await createDeckWithSlides(clientApi);
    cleanups.push(cleanup);

    await gotoEditor(page, id);
    await expect(page.locator('text=/\\b2 slides\\b/')).toBeVisible();

    // Make a change
    await page.locator('button[title="Add slide"]').first().click();
    await expect(page.getByRole('button', { name: /Update/ })).toBeVisible({ timeout: 10_000 });

    // Click save → eventually "Saved"
    await page.getByRole('button', { name: /Update/ }).click();
    await expect(page.getByRole('button', { name: /Saved$/ })).toBeVisible({ timeout: 15_000 });
  });

  test('opens version history sidebar', async ({ page, clientApi }) => {
    const { id, cleanup } = await createDeckWithSlides(clientApi);
    cleanups.push(cleanup);

    // Pre-create a version via API so the list is non-empty deterministically
    const cpRes = await clientApi.post(`/api/portal/tools/pitch-decks/${id}/versions`, {
      label: 'Baseline checkpoint XYZ',
    });
    expect(cpRes.status).toBe(200);

    await gotoEditor(page, id);

    // Click the History toolbar button (icon prefix in accessible name)
    await page.getByRole('button', { name: /^history History$/ }).click();

    // Panel renders
    await expect(page.getByRole('heading', { name: 'Version History' })).toBeVisible({ timeout: 10_000 });
    // The seeded checkpoint label should appear once the list loads
    await expect(page.locator('text=Baseline checkpoint XYZ')).toBeVisible({ timeout: 15_000 });
  });

  test('opens generate-from-prompt (Regenerate) modal without calling AI', async ({ page, clientApi }) => {
    const { id, cleanup } = await createDeckWithSlides(clientApi);
    cleanups.push(cleanup);

    await gotoEditor(page, id);

    await page.getByRole('button', { name: /^auto_awesome Regenerate$/ }).click();
    await expect(page.getByRole('heading', { name: 'Regenerate All Slides' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByPlaceholder('Describe what the new deck should focus on...')).toBeVisible();
  });

  test('navigates back to deck list', async ({ page, clientApi }) => {
    const { id, cleanup } = await createDeckWithSlides(clientApi);
    cleanups.push(cleanup);

    await gotoEditor(page, id);

    // Back arrow link
    await page.locator('a[href="/portal/tools/pitch-decks"]').first().click();
    await page.waitForURL(/\/portal\/tools\/pitch-decks(?:$|\?|\/)/, { timeout: 10_000 });
  });
});
