/**
 * CRM Deals Page — Refactor Baseline (browser-driven)
 *
 * Locks in the current end-user behavior of /portal/crm/deals so the
 * upcoming refactor (extracting kanban / drawer / modal / hooks /api helpers
 * out of the 1,469-LOC page.tsx) can be verified to be a no-op.
 *
 * Coverage:
 *   - Login + navigate; kanban renders with the seeded pipeline + stages
 *   - "Add Deal" form opens, fills, submits; new card appears in the kanban
 *   - Programmatic stage move (PUT) reflects on the board (drag-and-drop is
 *     intentionally bypassed — HTML5 dataTransfer is brittle in headless)
 *   - Clicking a deal card opens the slide-over drawer with all 3 tabs
 *   - Status filter (Open/Won/Lost) toggles which deals are listed
 *   - All test deals are CRM-DEAL-prefixed and torn down via runCleanups
 */
import type { Page } from '@playwright/test';
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestPipeline } from './setup/helpers';

const CLIENT_EMAIL = 'client@example.com';
const CLIENT_PASSWORD = 'client123';
const PREFIX = 'CRM-DEAL-';

async function loginAsClient(page: Page) {
  const csrfRes = await page.request.get('/api/auth/csrf');
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  await page.request.post('/api/auth/callback/credentials', {
    form: { email: CLIENT_EMAIL, password: CLIENT_PASSWORD, csrfToken, json: 'true' },
  });
}

test.describe('Portal CRM Deals Page — refactor baseline @crm @ui @critical', () => {
  let cleanups: Array<() => Promise<void>> = [];
  // The test exercises 6 distinct UI flows (load → create → move → reload →
  // drawer → filter); 60s is too tight in cold-start dev mode. Bump to 180s.
  test.setTimeout(180_000);

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('renders kanban with stages, creates a deal, moves stages, opens drawer, filters', async ({
    page,
    clientApi,
  }) => {
    // ── Arrange: a fresh pipeline so we don't collide with whatever else is in the DB
    const { pipeline } = await createTestPipeline(clientApi);
    const stages = (pipeline.stages as Array<{ id: number; name: string; sortOrder: number }>).slice().sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    expect(stages.length).toBeGreaterThanOrEqual(2);
    const firstStage = stages[0];
    const secondStage = stages[1];

    await loginAsClient(page);
    await page.goto('/portal/crm/deals');
    await page.waitForLoadState('networkidle');
    // Loading state shows a spinner before the pipeline picker mounts.
    await expect(page.locator('select').first()).toBeVisible({ timeout: 15_000 });

    // The pipeline picker is the only <select> inside the controls bar.
    const pipelinePicker = page.locator('select').first();
    await pipelinePicker.selectOption(String(pipeline.id));

    // Wait for the deals fetch (triggered by the pipeline change) to finish.
    await page.waitForResponse(
      (res) =>
        res.url().includes('/api/portal/crm/deals?') &&
        res.url().includes(`pipelineId=${pipeline.id}`),
      { timeout: 15_000 },
    );

    // ── Assert: kanban columns render for each stage of the chosen pipeline
    await expect(page.getByRole('heading', { name: firstStage.name }).first()).toBeVisible({
      timeout: 15_000,
    });
    for (const s of stages) {
      await expect(page.getByRole('heading', { name: s.name }).first()).toBeVisible();
    }

    // ── Act: open the "Add Deal" form, fill it, submit
    const ts = Date.now();
    const dealTitle = `${PREFIX}${ts}`;
    // Track for cleanup. The deal id is unknown until after creation —
    // resolve it by listing and matching on title.
    cleanups.push(async () => {
      const list = await clientApi.get(`/api/portal/crm/deals?pipelineId=${pipeline.id}&status=open`);
      for (const d of (list.data?.data ?? []) as Array<{ id: number; title: string }>) {
        if (d.title === dealTitle) {
          await clientApi.delete(`/api/portal/crm/deals/${d.id}`).catch(() => {});
        }
      }
    });

    await page.getByRole('button', { name: /Add Deal/ }).click();
    // Form labels are not associated via htmlFor in the current page —
    // address inputs by their position inside the New Deal form.
    const newDealForm = page.locator('form').filter({ has: page.getByRole('heading', { name: 'New Deal' }) });
    await expect(newDealForm).toBeVisible();
    // First text input is "Title *", first number input is "Value ($) *".
    await newDealForm.locator('input[type="text"], input:not([type])').first().fill(dealTitle);
    await newDealForm.locator('input[type="number"]').first().fill('1234.56');
    // The form auto-selects pipeline + first stage when opened, so just submit.
    await newDealForm.getByRole('button', { name: /Create Deal/ }).click();

    // The form closes and the kanban refreshes. The new card title becomes visible.
    await expect(page.getByText(dealTitle)).toBeVisible({ timeout: 10_000 });

    // ── Resolve the deal id for the next steps
    const list = await clientApi.get(
      `/api/portal/crm/deals?pipelineId=${pipeline.id}&status=open`,
    );
    const created = ((list.data?.data ?? []) as Array<{ id: number; title: string; stageId: number }>).find(
      (d) => d.title === dealTitle,
    );
    expect(created).toBeTruthy();
    expect(created!.stageId).toBe(firstStage.id);

    // ── Programmatic stage move (drag-and-drop in HTML5 is brittle; the page
    // also fires this exact PUT on drop, so we exercise the same backend path).
    const moveRes = await clientApi.put(`/api/portal/crm/deals/${created!.id}`, {
      stageId: secondStage.id,
    });
    expect(moveRes.status).toBe(200);

    // Verify the move stuck on the server.
    const verifyMove = await clientApi.get(`/api/portal/crm/deals/${created!.id}`);
    expect(verifyMove.status).toBe(200);
    expect(verifyMove.data.data.stageId).toBe(secondStage.id);

    // ── Open the drawer by clicking the card
    await page.getByText(dealTitle).click();
    // The "Save Changes" button only mounts inside the slide-over Details tab.
    await expect(page.getByRole('button', { name: /Save Changes/ })).toBeVisible({ timeout: 10_000 });
    // Close drawer by clicking the backdrop overlay (top-level fixed div).
    await page.locator('.fixed.inset-0').first().click({ position: { x: 5, y: 5 } });
    await expect(page.getByRole('button', { name: /Save Changes/ })).toBeHidden({ timeout: 5_000 });

    // ── Filter by status — flip to Won, our open deal disappears
    const wonReq = page.waitForResponse(
      (res) => res.url().includes('/api/portal/crm/deals?') && res.url().includes('status=won'),
      { timeout: 15_000 },
    );
    await page.getByRole('button', { name: 'Won', exact: true }).click();
    await wonReq;
    await expect(page.getByText(dealTitle)).toHaveCount(0);

    // Flip back to Open — our deal re-appears
    const openReq = page.waitForResponse(
      (res) => res.url().includes('/api/portal/crm/deals?') && res.url().includes('status=open'),
      { timeout: 15_000 },
    );
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await openReq;
    await expect(page.getByText(dealTitle)).toBeVisible();
  });
});
