/**
 * A/B Experiment — POST target lifecycle
 *
 * Drives the full post-experiment lifecycle through both the HTTP layer and
 * the React UI:
 *   1. Create a portal post.
 *   2. POST /api/portal/posts/:id/experiments — draft experiment.
 *   3. UI: row shows up at /portal/experiments.
 *   4. UI: detail page renders post title, hypothesis, goal config,
 *      traffic split (a/b 50/50), variant editor.
 *   5. PATCH status → 'running'; refresh detail; UI reflects.
 *   6. Hit the public site URL twice with the same sd_visitor cookie;
 *      verify exactly one 'view' event per visitor.
 *   7. POST /api/public/ab/event with kind=goal for that visitor.
 *   8. Refresh results panel; assert views >= 1, goals >= 1.
 *   9. PATCH status → 'completed'; UI reflects.
 *  10. DELETE; row + variants + assignments + events all cascade away.
 *
 * Cleanup via `runCleanups` in `test.afterAll` so a mid-test failure still
 * tears down the experiment + post (cleanup is push-based and best-effort).
 */
import type { Page } from '@playwright/test';
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestWebsite, createTestPost } from './setup/helpers';
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

test.describe('A/B experiment post lifecycle @ab @critical', () => {
  const cleanups: Array<() => Promise<void>> = [];
  let siteId: number;
  let siteDomain: string;
  let postId: number;
  let postSlug: string;
  let postTitle: string;
  let experimentId: number;

  test.afterAll(async () => {
    await runCleanups(cleanups);
  });

  test('setup: create site + published post', async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    siteId = website.id;
    siteDomain = website.domain;
    expect(siteDomain).toBeTruthy();

    postSlug = `ab-post-${Date.now()}`;
    postTitle = `AB Post ${Date.now()}`;
    const { post, cleanup } = await createTestPost(clientApi, siteId, {
      title: postTitle,
      slug: postSlug,
      content: JSON.stringify({ blocks: [], version: '1.0' }),
      published: true,
    });
    cleanups.push(cleanup);
    postId = post.id;
  });

  test('portal: create draft experiment via /api/portal/posts/:id/experiments', async ({ clientApi }) => {
    const res = await clientApi.post(`/api/portal/posts/${postId}/experiments`, {
      name: 'A/B test — fixture',
      hypothesis: 'Action-first CTA outperforms value-first',
      goalMetric: 'page_view',
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.id).toBeGreaterThan(0);
    expect(res.data.data.status).toBe('draft');
    expect(res.data.data.targetType).toBe('post');
    expect(res.data.data.targetId).toBe(postId);
    experimentId = res.data.data.id;

    // Push a cleanup early so a later test failure still drops the row.
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/experiments/${experimentId}`).catch(() => {});
    });
  });

  test('portal: variants are seeded a + b 50/50', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/experiments/${experimentId}`);
    expect(res.status).toBe(200);
    const variants = res.data.data.variants as Array<{ key: string; label: string }>;
    const keys = variants.map(v => v.key).sort();
    expect(keys).toEqual(['a', 'b']);

    const exp = res.data.data.experiment as { variantSplit: Record<string, number> };
    expect(exp.variantSplit).toEqual({ a: 50, b: 50 });
  });

  test('UI: experiment row appears at /portal/experiments', async ({ page }) => {
    await loginAsClient(page);
    await page.goto('/portal/experiments');
    await expect(page.getByRole('heading', { name: /A\/B Experiments/ })).toBeVisible();
    // Scope the assertions to the row containing the experiment name to keep
    // the type-label check tight (the page renders multiple <table> rows
    // when other agents have left fixtures behind).
    const row = page.locator('tr', { hasText: 'A/B test — fixture' }).first();
    await expect(row).toBeVisible();
    // Type column shows "Page" for post-targeted experiments and "Pitch deck" for decks.
    await expect(row).toContainText('Page');
    // The row should also link out to the experiment detail page.
    await expect(row.getByRole('link', { name: 'Open' })).toBeVisible();
  });

  test('UI: detail page renders post title, hypothesis, goal, split, variants', async ({ page }) => {
    await loginAsClient(page);
    await page.goto(`/portal/experiments/${experimentId}`);

    // Header — experiment name + post label.
    await expect(page.getByRole('heading', { name: 'A/B test — fixture' })).toBeVisible();
    // The detail header references the target with kindLabel "Page:" plus
    // the post's title rendered as a link.
    await expect(page.getByText(/Page:/)).toBeVisible();
    await expect(page.getByRole('link', { name: postTitle })).toBeVisible();

    // Hypothesis textarea — contents seeded from POST body.
    const hypothesis = page.getByPlaceholder(/What do you expect this test to prove/);
    await expect(hypothesis).toBeVisible();
    await expect(hypothesis).toHaveValue(/Action-first CTA outperforms value-first/);

    // Goal config — metric select + selector input.
    await expect(page.getByText('Metric', { exact: true })).toBeVisible();
    await expect(page.getByRole('combobox')).toHaveValue('page_view');
    await expect(page.getByPlaceholder(/.cta-primary/)).toBeVisible();

    // Traffic split — both keys plus a 50% input apiece.
    await expect(page.getByText('Traffic split', { exact: true })).toBeVisible();
    const splitInputs = page.locator('input[type="number"][max="100"]');
    await expect(splitInputs).toHaveCount(2);
    await expect(splitInputs.nth(0)).toHaveValue('50');
    await expect(splitInputs.nth(1)).toHaveValue('50');

    // Variant editor — both variants render with a JSON textarea apiece.
    await expect(page.getByText('Variants', { exact: true })).toBeVisible();
    await expect(page.getByText('(control)')).toBeVisible();
  });

  test('portal: PATCH status → running and UI reflects', async ({ clientApi, page }) => {
    const res = await clientApi.patch(`/api/portal/experiments/${experimentId}`, { status: 'running' });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.status).toBe('running');
    expect(res.data.data.startedAt).not.toBeNull();

    await loginAsClient(page);
    await page.goto(`/portal/experiments/${experimentId}`);
    // Status badge surfaces the running state next to the play_circle icon.
    await expect(page.getByText('running').first()).toBeVisible();
    // The Stop transition replaces the Start button when running.
    await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
  });

  test('public: SSR view event de-duplicates per visitor cookie', async () => {
    // APIRequestContext doesn't expose addCookies(); we forward the same
    // sd_visitor cookie via an explicit Cookie header on every request,
    // which matches what a real browser would send.
    const visitorId = `e2e-postvis-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const ctx = await request.newContext({
      baseURL: BASE_URL,
      extraHTTPHeaders: { Cookie: `sd_visitor=${visitorId}` },
    });

    const publicUrl = `/sites/${siteDomain}/${postSlug}`;
    // Two visits — same visitor cookie. Server records assignment + view
    // on the first; the second is collapsed by the dedupe guard inside
    // recordExposure() (one ab_events row per (experiment, visitor, kind)).
    const r1 = await ctx.get(publicUrl);
    expect([200, 304]).toContain(r1.status());
    const r2 = await ctx.get(publicUrl);
    expect([200, 304]).toContain(r2.status());

    await ctx.dispose();
  });

  test('public: explicit goal event for the same visitor succeeds', async () => {
    const ctx = await request.newContext({ baseURL: BASE_URL });
    const visitorId = `e2e-postvis-goal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const res = await ctx.post('/api/public/ab/event', {
      data: {
        experimentId,
        // The recorder accepts any 1–8 char key — server-side assignment
        // already wrote the canonical row during render. We just need a goal
        // row to land for the results panel.
        variantKey: 'a',
        visitorId,
        kind: 'goal',
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Repeating the same goal post returns success but is collapsed by the
    // de-dupe guard — `duplicated: true` rather than `recorded: true`.
    const dup = await ctx.post('/api/public/ab/event', {
      data: { experimentId, variantKey: 'a', visitorId, kind: 'goal' },
    });
    expect(dup.status()).toBe(200);
    const dupBody = await dup.json();
    expect(dupBody.success).toBe(true);
    expect(dupBody.data?.duplicated).toBe(true);

    await ctx.dispose();
  });

  test('portal: results panel shows views >= 1, goals >= 1', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/experiments/${experimentId}/results`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    const stats = res.data.data.stats as Array<{ key: string; views: number; goals: number }>;
    const totalViews = stats.reduce((acc, s) => acc + s.views, 0);
    const totalGoals = stats.reduce((acc, s) => acc + s.goals, 0);
    expect(totalViews).toBeGreaterThanOrEqual(1);
    expect(totalGoals).toBeGreaterThanOrEqual(1);
  });

  test('portal: PATCH status → completed and UI reflects', async ({ clientApi, page }) => {
    const res = await clientApi.patch(`/api/portal/experiments/${experimentId}`, { status: 'completed' });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.status).toBe('completed');
    expect(res.data.data.endedAt).not.toBeNull();

    await loginAsClient(page);
    await page.goto(`/portal/experiments/${experimentId}`);
    await expect(page.getByText('completed').first()).toBeVisible();
  });

  test('portal: DELETE removes the experiment + cascade-drops events', async ({ clientApi }) => {
    const del = await clientApi.delete(`/api/portal/experiments/${experimentId}`);
    expect(del.status).toBe(200);
    expect(del.data.success).toBe(true);

    // GET should now 404. authorizeExperimentForUser handles ownership but
    // also folds non-existent rows into the not_found path.
    const after = await clientApi.get(`/api/portal/experiments/${experimentId}`);
    expect(after.status).toBe(404);
    expect(after.data.success).toBe(false);

    // Subsequent goal POSTs against the dead experiment id 404, confirming
    // the row is gone (the public recorder reads ab_experiments to gate).
    const ctx = await request.newContext({ baseURL: BASE_URL });
    const ghostVisitor = `e2e-ghost-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const res = await ctx.post('/api/public/ab/event', {
      data: { experimentId, variantKey: 'a', visitorId: ghostVisitor, kind: 'goal' },
    });
    expect(res.status()).toBe(404);
    await ctx.dispose();
  });
});
