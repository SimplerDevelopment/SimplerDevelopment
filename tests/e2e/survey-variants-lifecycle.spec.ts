/**
 * Survey variants — full lifecycle (W3.D, depends on W1.C wiring)
 *
 * Drives every endpoint W1.C added on `feat/ab-survey-variants`:
 *   1. Login as portal client (handled by `clientApi` fixture).
 *   2. Create a survey via POST /api/portal/surveys (default status='draft').
 *   3. Create variant A (weight 50, enabled).
 *   4. Create variant B (weight 50, enabled).
 *   5. GET list returns both, ordered by id ASC.
 *   6. PATCH variant B → weight=80; verify echo.
 *   7. Toggle variant B → enabled=false; verify the public GET only ever
 *      serves variant A (deterministic picker on (surveyId, visitorId)).
 *   8. Activate survey (PUT status='active' so the public GET stops 403'ing)
 *      and hit /api/surveys/[slug] with a fresh sd_visitor cookie. Assert
 *      the response carries variantId == A.id, variantName == 'A', and the
 *      `fields` payload is variant A's (single 'name' text field).
 *   9. POST a response with variantId=A.id; expect 201 + success:true.
 *  10. POST a response with a malformed variantId (-1) — assert 400. The
 *      W1.C cross-survey-tamper guard is two-layered: malformed numbers
 *      (NaN / <= 0) are rejected outright; valid-but-foreign variant ids
 *      are silently dropped to null. We test both arms.
 *  11. GET /variants/stats — assert at least 1 row attributed to variant A.
 *  12. DELETE variant A; subsequent GET on /variants/A.id returns 404 and
 *      the list endpoint returns only variant B.
 *  13. DELETE the survey; assert GET /api/portal/surveys/:id is 404 and
 *      /variants is 404 (cascade dropped variants + responses via the
 *      `survey_variants.survey_id` ON DELETE CASCADE FK).
 *
 * Cleanup: every fixture pushes a teardown into `cleanups`; `runCleanups`
 * runs them in reverse order in `afterAll`, even on mid-test failure. The
 * survey delete in step 13 doubles as primary cleanup; the early cleanup
 * push is a belt-and-braces guard for failures before step 13 fires.
 *
 * INTEGRATION CAVEAT: This spec assumes W1.C's branch
 * (`feat/ab-survey-variants`, ba435ceb3) has been merged or rebased onto
 * the same base as this branch. Without W1.C the variant CRUD endpoints
 * 404 and `surveyResponses.variantId` doesn't persist. See
 * `.planning/ab-overnight-2026-05-07.md` for coordination.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './setup/fixtures';
import { runCleanups } from './setup/helpers';
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

test.describe('Survey variants lifecycle @ab @critical', () => {
  const cleanups: Array<() => Promise<void>> = [];
  let surveyId: number;
  let surveySlug: string;
  let variantAId: number;
  let variantBId: number;

  test.afterAll(async () => {
    await runCleanups(cleanups);
  });

  test('setup: create survey via POST /api/portal/surveys', async ({ clientApi }) => {
    const ts = Date.now();
    const res = await clientApi.post('/api/portal/surveys', {
      title: `Variant Lifecycle Survey ${ts}`,
      description: 'E2E fixture for W3.D survey-variants spec',
      // Default fields — the variants override these per-bucket. Required false
      // so a missing answer in a non-variant submission would still pass; the
      // public GET swaps in the variant fields when one is picked.
      fields: [{ id: 'baseline', type: 'text', label: 'baseline', required: false }],
    });
    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    surveyId = res.data.data.id as number;
    surveySlug = res.data.data.slug as string;
    expect(surveyId).toBeGreaterThan(0);
    expect(surveySlug).toBeTruthy();

    // Early cleanup so a failure between here and step 13 still drops the row
    // (which cascades variants + responses via the ON DELETE CASCADE FK).
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/surveys/${surveyId}`).catch(() => {});
    });
  });

  test('portal: create variant A', async ({ clientApi }) => {
    const res = await clientApi.post(`/api/portal/surveys/${surveyId}/variants`, {
      name: 'A',
      fields: [{ id: 'name', type: 'text', label: 'name' }],
      weight: 50,
      enabled: true,
    });
    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data.name).toBe('A');
    expect(res.data.data.weight).toBe(50);
    expect(res.data.data.enabled).toBe(true);
    expect(res.data.data.surveyId).toBe(surveyId);
    variantAId = res.data.data.id as number;
    expect(variantAId).toBeGreaterThan(0);
  });

  test('portal: create variant B', async ({ clientApi }) => {
    const res = await clientApi.post(`/api/portal/surveys/${surveyId}/variants`, {
      name: 'B',
      fields: [{ id: 'company', type: 'text', label: 'company' }],
      weight: 50,
      enabled: true,
    });
    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data.name).toBe('B');
    expect(res.data.data.weight).toBe(50);
    expect(res.data.data.enabled).toBe(true);
    variantBId = res.data.data.id as number;
    expect(variantBId).toBeGreaterThan(0);
    expect(variantBId).not.toBe(variantAId);
  });

  test('portal: GET list returns both variants', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/surveys/${surveyId}/variants`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    const list = res.data.data as Array<{ id: number; name: string }>;
    // Route orders by id ASC, so A (created first) precedes B.
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe(variantAId);
    expect(list[0].name).toBe('A');
    expect(list[1].id).toBe(variantBId);
    expect(list[1].name).toBe('B');
  });

  test('portal: PATCH variant B → weight=80', async ({ clientApi }) => {
    const res = await clientApi.patch(
      `/api/portal/surveys/${surveyId}/variants/${variantBId}`,
      { weight: 80 },
    );
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.id).toBe(variantBId);
    expect(res.data.data.weight).toBe(80);
    // Other fields unchanged.
    expect(res.data.data.name).toBe('B');
    expect(res.data.data.enabled).toBe(true);
  });

  test('portal: toggle variant B → enabled=false', async ({ clientApi }) => {
    const res = await clientApi.patch(
      `/api/portal/surveys/${surveyId}/variants/${variantBId}`,
      { enabled: false },
    );
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.enabled).toBe(false);
    // Weight echo from the previous step survives — we only changed `enabled`.
    expect(res.data.data.weight).toBe(80);
  });

  test('public: activate survey then GET only serves variant A', async ({ clientApi }) => {
    // The public GET 403s on `status !== 'active'`; flip it active for the
    // remaining public-path tests.
    const activate = await clientApi.put(`/api/portal/surveys/${surveyId}`, { status: 'active' });
    expect(activate.status).toBe(200);
    expect(activate.data.success).toBe(true);
    expect(activate.data.data.status).toBe('active');

    // Fresh visitor cookie — the picker is deterministic on (surveyId, visitorId)
    // so the same cookie always lands on the same variant. With B disabled,
    // the only enabled variant is A; the picker MUST resolve to A.
    const visitorId = `e2e-survey-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const ctx = await request.newContext({
      baseURL: BASE_URL,
      extraHTTPHeaders: { Cookie: `sd_visitor=${visitorId}` },
    });
    const res = await ctx.get(`/api/surveys/${surveySlug}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.variantId).toBe(variantAId);
    expect(body.data.variantName).toBe('A');
    // Variant A's fields are swapped in for the survey-level baseline field.
    const fields = body.data.fields as Array<{ id: string; label: string }>;
    expect(fields).toHaveLength(1);
    expect(fields[0].id).toBe('name');
    expect(fields[0].label).toBe('name');

    await ctx.dispose();
  });

  test('public: POST response with variantId=A succeeds', async () => {
    const ctx = await request.newContext({ baseURL: BASE_URL });
    const res = await ctx.post(`/api/surveys/${surveySlug}`, {
      data: {
        formName: 'main',
        answers: { name: 'E2E user' },
        variantId: variantAId,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    await ctx.dispose();
  });

  test('public: POST with malformed variantId is rejected (tamper guard)', async () => {
    // The W1.C public POST validator rejects non-positive numbers outright
    // (`parsed <= 0` → 400). This is the explicit tamper-guard arm.
    const ctxMal = await request.newContext({ baseURL: BASE_URL });
    const malformed = await ctxMal.post(`/api/surveys/${surveySlug}`, {
      data: {
        formName: 'main',
        answers: { name: 'malformed' },
        variantId: -1,
      },
    });
    expect(malformed.status()).toBe(400);
    const malformedBody = await malformed.json();
    expect(malformedBody.success).toBe(false);
    await ctxMal.dispose();

    // Sanity arm: a valid-but-foreign positive number is silently dropped to
    // null — the response is accepted but unattributed. This documents W1.C's
    // intentional tradeoff (better to record orphan answers than 400 a user
    // whose variant was deleted mid-session). 999_999_999 is well outside the
    // serial id range so the lookup is guaranteed to miss.
    const ctxOrph = await request.newContext({ baseURL: BASE_URL });
    const orphan = await ctxOrph.post(`/api/surveys/${surveySlug}`, {
      data: {
        formName: 'main',
        answers: { name: 'orphan' },
        variantId: 999_999_999,
      },
    });
    expect(orphan.status()).toBe(201);
    const orphanBody = await orphan.json();
    expect(orphanBody.success).toBe(true);
    await ctxOrph.dispose();
  });

  test('portal: stats endpoint shows ≥ 1 response under variant A', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/surveys/${surveyId}/variants/stats`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    const rows = res.data.data as Array<{ variantId: number | null; total: number }>;
    const aRow = rows.find((r) => r.variantId === variantAId);
    expect(aRow).toBeDefined();
    expect(aRow!.total).toBeGreaterThanOrEqual(1);
  });

  test('UI: variants tab renders A and B in the portal detail page', async ({ page }) => {
    // Smoke — the W1.C portal UI mounts a "Variants" tab on the survey detail
    // page. We don't deep-assert the panel internals (covered in W1.C's own
    // verify pass); we just confirm both names render so the variant CRUD
    // edits above are reflected in the dashboard.
    await loginAsClient(page);
    await page.goto(`/portal/surveys/${surveyId}`);
    // The detail page exposes the variant list under a panel with both names.
    // `toContainText` is forgiving about surrounding markup (icons, badges, etc).
    await expect(page.getByText('A', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('B', { exact: true }).first()).toBeVisible();
  });

  test('portal: DELETE variant A; B remains', async ({ clientApi }) => {
    const del = await clientApi.delete(`/api/portal/surveys/${surveyId}/variants/${variantAId}`);
    expect(del.status).toBe(200);
    expect(del.data.success).toBe(true);

    // GET on the deleted variant 404s.
    const after = await clientApi.get(`/api/portal/surveys/${surveyId}/variants/${variantAId}`);
    expect(after.status).toBe(404);
    expect(after.data.success).toBe(false);

    // List shrinks to just B.
    const list = await clientApi.get(`/api/portal/surveys/${surveyId}/variants`);
    expect(list.status).toBe(200);
    const remaining = list.data.data as Array<{ id: number; name: string }>;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(variantBId);
    expect(remaining[0].name).toBe('B');
  });

  test('portal: DELETE survey cascades variants + responses', async ({ clientApi }) => {
    const del = await clientApi.delete(`/api/portal/surveys/${surveyId}`);
    expect(del.status).toBe(200);
    expect(del.data.success).toBe(true);

    // Survey GET → 404.
    const surveyAfter = await clientApi.get(`/api/portal/surveys/${surveyId}`);
    expect(surveyAfter.status).toBe(404);
    expect(surveyAfter.data.success).toBe(false);

    // Variants list endpoint also 404s — the route gates on the survey
    // ownership check before reading variants, so a missing survey collapses
    // both arms (variant rows themselves are gone via ON DELETE CASCADE).
    const variantsAfter = await clientApi.get(`/api/portal/surveys/${surveyId}/variants`);
    expect(variantsAfter.status).toBe(404);
    expect(variantsAfter.data.success).toBe(false);

    // Stats endpoint identically gated.
    const statsAfter = await clientApi.get(`/api/portal/surveys/${surveyId}/variants/stats`);
    expect(statsAfter.status).toBe(404);
    expect(statsAfter.data.success).toBe(false);
  });
});
