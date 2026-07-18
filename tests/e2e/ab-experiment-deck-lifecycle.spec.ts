/**
 * A/B Experiment — DECK target lifecycle
 *
 * Mirrors `ab-experiment-post-lifecycle.spec.ts` but exercises the polymorphic
 * engine on a pitch-deck target. Decks are special-cased in two places:
 *   - `POST /api/portal/experiments` accepts `{ targetType: 'deck', targetId }`
 *     and the engine writes `target_type='deck'` (legacy `post_id` is null).
 *   - The detail page renders the breadcrumb / kind label as "Pitch deck:"
 *     instead of "Page:" and links to `/portal/tools/pitch-decks/:id`.
 *
 * Test flow:
 *   1. Create a website (domain anchor for the public URL) + blank deck.
 *   2. Publish the deck so /sites/:domain/slides/:slug resolves.
 *   3. POST /api/portal/experiments with deck target.
 *   4. UI: detail page shows "Pitch deck:" + the deck title.
 *   5. PATCH status → 'running'; UI reflects.
 *   6. Hit the public deck URL with a visitor cookie; SSR records a view.
 *   7. POST /api/public/ab/event { kind: 'goal' }.
 *   8. Refresh results; views + goals are non-zero.
 *   9. DELETE; row + variants + events cascade away.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestWebsite } from './setup/helpers';
import { request } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const CLIENT_EMAIL = 'client@example.com';
const CLIENT_PASSWORD = 'client123';

async function loginAsClient(page: Page) {
  const csrfRes = await page.request.get('/api/auth/csrf');
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  await page.request.post('/api/auth/callback/credentials', {
    form: { email: CLIENT_EMAIL, password: CLIENT_PASSWORD, csrfToken, json: 'true' },
  });
}

test.describe.configure({ mode: 'serial' });

test.describe('A/B experiment deck lifecycle @ab @critical', () => {
  const cleanups: Array<() => Promise<void>> = [];
  let siteId: number;
  let siteDomain: string;
  let deckId: number;
  let deckSlug: string;
  let deckTitle: string;
  let experimentId: number;

  test.afterAll(async () => {
    await runCleanups(cleanups);
  });

  test('setup: create site (for domain) + blank deck', async ({ clientApi }) => {
    // Decks are not site-scoped — they live on the client. But the public
    // URL is `/sites/:domain/slides/:slug`, where :domain must resolve
    // to a website owned by the same client. Create a site solely for
    // its domain anchor.
    const { website } = await createTestWebsite(clientApi);
    siteId = website.id;
    siteDomain = website.domain;
    expect(siteDomain).toBeTruthy();

    // Enable public access so the site doesn't return a 200 "private" overlay
    // before the A/B resolver runs. (The slides route itself doesn't gate on
    // publicAccess, but enabling it keeps the test environment honest and
    // avoids surprises if the routing changes.)
    // Note: the route only exports PUT (not PATCH).
    await clientApi.put(`/api/portal/cms/websites/${siteId}`, { publicAccess: true });

    deckTitle = `AB Deck ${Date.now()}`;
    const create = await clientApi.post('/api/portal/tools/pitch-decks', {
      title: deckTitle,
    });
    expect(create.status).toBe(200);
    expect(create.data.success).toBe(true);
    expect(create.data.data.id).toBeGreaterThan(0);
    deckId = create.data.data.id;
    deckSlug = create.data.data.slug;
    expect(deckSlug).toBeTruthy();

    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/tools/pitch-decks/${deckId}`).catch(() => {});
    });

    // Publish so getPitchDeckByDomainAndSlug() returns it. The blank-deck
    // path leaves `status='draft'` by default.
    const publish = await clientApi.patch(`/api/portal/tools/pitch-decks/${deckId}`, {
      status: 'published',
    });
    expect(publish.status).toBe(200);
    expect(publish.data.success).toBe(true);
    expect(publish.data.data.status).toBe('published');
  });

  test('portal: POST /api/portal/experiments creates a deck experiment', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/experiments', {
      targetType: 'deck',
      targetId: deckId,
      name: 'A/B test — fixture',
      hypothesis: 'Slide order drives more goals',
      goalMetric: 'page_view',
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.id).toBeGreaterThan(0);
    expect(res.data.data.targetType).toBe('deck');
    expect(res.data.data.targetId).toBe(deckId);
    // Deck experiments do NOT mirror to the legacy post_id column.
    expect(res.data.data.postId).toBeNull();
    experimentId = res.data.data.id;

    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/experiments/${experimentId}`).catch(() => {});
    });
  });

  test('portal: variants are seeded a + b', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/experiments/${experimentId}`);
    expect(res.status).toBe(200);
    const variants = res.data.data.variants as Array<{ key: string }>;
    expect(variants.map(v => v.key).sort()).toEqual(['a', 'b']);
  });

  test('UI: list page labels deck experiments with Pitch deck type', async ({ page }) => {
    await loginAsClient(page);
    await page.goto('/portal/experiments');
    // Scope to the row containing this deck's title — multiple experiments
    // may exist for the active client at any time.
    const row = page.locator('tr', { hasText: deckTitle }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText('Pitch deck');
    await expect(row).toContainText('A/B test — fixture');
  });

  test('UI: detail page renders "Pitch deck:" breadcrumb and deck title link', async ({ page }) => {
    await loginAsClient(page);
    await page.goto(`/portal/experiments/${experimentId}`);

    await expect(page.getByRole('heading', { name: 'A/B test — fixture' })).toBeVisible();
    // The kindLabel for decks is "Pitch deck" — rendered as "Pitch deck:"
    // followed by the deck title as a link to the editor.
    await expect(page.getByText(/Pitch deck:/)).toBeVisible();
    await expect(page.getByRole('link', { name: deckTitle })).toBeVisible();

    // Variant editor renders. The "Seed from <kind>" button uses
    // kindLabel.toLowerCase() — so for a deck it reads "Seed from pitch deck".
    await expect(page.getByRole('button', { name: /Seed from pitch deck/i }).first()).toBeVisible();
  });

  test('portal: PATCH status → running and UI reflects', async ({ clientApi, page }) => {
    const res = await clientApi.patch(`/api/portal/experiments/${experimentId}`, { status: 'running' });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.status).toBe('running');

    await loginAsClient(page);
    await page.goto(`/portal/experiments/${experimentId}`);
    await expect(page.getByText('running').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
  });

  test('public: SSR records a view for the deck visitor', async () => {
    // APIRequestContext doesn't expose addCookies(); we forward the
    // sd_visitor cookie via an explicit Cookie header — matches a real
    // browser's request and lets the SSR resolver bucket us deterministically.
    const visitorId = `e2e-deckvis-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const ctx = await request.newContext({
      baseURL: BASE_URL,
      extraHTTPHeaders: { Cookie: `sd_visitor=${visitorId}` },
    });

    // Use the canonical /slides/:slug path — the deck page that calls
    // applyAbToDeckSlides() lives at app/sites/[domain]/slides/[slug]/page.tsx.
    // The legacy /pitch-deck/:slug rewrite only covers root-level paths, not
    // /sites/:domain/pitch-deck/:slug, so that variant hits the [[...slug]]
    // catch-all which doesn't run the A/B resolver.
    const publicUrl = `/sites/${siteDomain}/slides/${deckSlug}`;
    const r1 = await ctx.get(publicUrl);
    expect([200, 304]).toContain(r1.status());
    // Second hit with the same cookie de-dupes server-side.
    const r2 = await ctx.get(publicUrl);
    expect([200, 304]).toContain(r2.status());

    await ctx.dispose();
  });

  test('public: explicit goal event for the deck experiment succeeds', async () => {
    const ctx = await request.newContext({ baseURL: BASE_URL });
    const visitorId = `e2e-deckvis-goal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const res = await ctx.post('/api/public/ab/event', {
      data: {
        experimentId,
        variantKey: 'b',
        visitorId,
        kind: 'goal',
      },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).success).toBe(true);

    await ctx.dispose();
  });

  test('portal: results panel shows views + goals', async ({ clientApi }) => {
    // The SSR view event is recorded fire-and-forget (detached promise in
    // resolve.ts) so it may not have committed by the time we read results.
    // Poll until both counters are non-zero or we hit the 10 s deadline.
    const deadline = Date.now() + 10_000;
    let totalViews = 0;
    let totalGoals = 0;
    let lastStatus = 0;
    while (Date.now() < deadline) {
      const res = await clientApi.get(`/api/portal/experiments/${experimentId}/results`);
      lastStatus = res.status;
      if (res.status === 200 && res.data.success) {
        const stats = res.data.data.stats as Array<{ key: string; views: number; goals: number }>;
        totalViews = stats.reduce((acc, s) => acc + s.views, 0);
        totalGoals = stats.reduce((acc, s) => acc + s.goals, 0);
        if (totalViews >= 1 && totalGoals >= 1) break;
      }
      await new Promise(r => setTimeout(r, 500));
    }
    expect(lastStatus).toBe(200);
    expect(totalViews).toBeGreaterThanOrEqual(1);
    expect(totalGoals).toBeGreaterThanOrEqual(1);
  });

  test('portal: DELETE removes the deck experiment + cascade-drops events', async ({ clientApi }) => {
    const del = await clientApi.delete(`/api/portal/experiments/${experimentId}`);
    expect(del.status).toBe(200);
    expect(del.data.success).toBe(true);

    const after = await clientApi.get(`/api/portal/experiments/${experimentId}`);
    expect(after.status).toBe(404);
    expect(after.data.success).toBe(false);

    // The public recorder gates on the experiment row — once it's gone,
    // any in-flight beacon should 404 rather than recording orphan rows.
    const ctx = await request.newContext({ baseURL: BASE_URL });
    const ghostVisitor = `e2e-deck-ghost-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const res = await ctx.post('/api/public/ab/event', {
      data: { experimentId, variantKey: 'a', visitorId: ghostVisitor, kind: 'goal' },
    });
    expect(res.status()).toBe(404);
    await ctx.dispose();
  });
});
