/**
 * Admin Agentic OS — UI smoke (executor-disabled mode)
 *
 * The Agentic OS page at `/admin/agentic-os` catalogs Claude Code "skills"
 * by domain and (when `AGENTIC_OS_EXECUTOR_ENABLED=1` AND the `claude` CLI is
 * on PATH) lets staff fire them as headless `claude -p` runs. By default the
 * executor is disabled — the page falls back to "Copy prompt" mode.
 *
 * This smoke runs in executor-disabled mode (the default). It verifies the
 * page loads, renders the catalog, opens the run drawer, and gracefully
 * surfaces the disabled state without crashing. We are NOT trying to actually
 * fire `claude -p` here.
 *
 * Auth pattern (NextAuth credentials POST) is copied from
 * `pm-kanban-ui.spec.ts` — the canonical browser-level login helper in this
 * repo. API-only admin specs (e.g. `admin-automations.spec.ts`,
 * `admin-dashboard.spec.ts`) just use the `adminApi` fixture, but we need a
 * real browser session here because the page is client-rendered and fetches
 * `/api/admin/agentic-os` from the browser.
 *
 * NOTE on selectors: `app/admin/agentic-os/page.tsx` does not expose
 * `data-testid` attributes. We use role+text selectors (the heading "Agentic
 * OS", domain section h2 text, button names) — these are stable because the
 * domain labels come from `DOMAIN_LABELS` in `lib/agentic-os/types.ts` and
 * the button copy is hard-coded in the page component. If this spec ever
 * starts flaking on selector ambiguity, the right fix is to add testids to
 * the page (not to weaken these assertions).
 */
import type { Page } from '@playwright/test';
import { test, expect } from './setup/fixtures';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

/** Log the browser context in as the seeded admin user via the NextAuth
 *  credentials callback. Mirrors `loginAsClient` in pm-kanban-ui.spec.ts. */
async function loginAsAdmin(page: Page) {
  const csrfRes = await page.request.get('/api/auth/csrf');
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const signInRes = await page.request.post('/api/auth/callback/credentials', {
    form: {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      csrfToken,
      json: 'true',
    },
  });
  if (signInRes.status() >= 400) {
    throw new Error(`Admin browser login failed: ${signInRes.status()}`);
  }
}

test.describe('admin agentic-os @admin @agentic-os @critical', () => {
  test.describe.configure({ mode: 'serial' });

  // Agentic OS is a local-dev-only surface: app/api/admin/agentic-os/route.ts
  // (and the page) return 404 when !isLocalDev(), i.e. under a production build
  // (`--mode=prod` / `next start`). Skip the whole suite when the feature is
  // gated off so a prod-mode e2e run isn't red on a dev-only feature.
  test.beforeEach(async ({ page }) => {
    const res = await page.request.get('/api/admin/agentic-os');
    test.skip(res.status() === 404, 'Agentic OS disabled in this build (isLocalDev gate)');
  });

  test('catalog loads with heading, a domain section, and skill cards', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/agentic-os', { waitUntil: 'domcontentloaded' });

    // Top-level heading — h1 in the page header.
    await expect(
      page.getByRole('heading', { level: 1, name: 'Agentic OS' }),
    ).toBeVisible({ timeout: 15_000 });

    // At least one domain section heading. "Developer Workflow" and
    // "Scheduled Automations" both come straight from DOMAIN_LABELS — we
    // expect at least one of them to be present given the SKILLS registry
    // covers both domains. Use first() so the assertion doesn't trip on
    // strict-mode locator ambiguity if both are rendered.
    const domainHeading = page
      .getByRole('heading', { level: 2, name: /(Developer Workflow|Scheduled Automations)/ })
      .first();
    await expect(domainHeading).toBeVisible({ timeout: 10_000 });

    // The catalog ships ~45 skills; 10 is a safe floor that won't get tripped
    // by a future skill being added or temporarily removed. Skill cards each
    // expose the skill id in a `font-mono` <p> with `title={skill.id}`. The
    // most stable proxy is the "Run" button (rendered on every on-demand
    // skill card) plus the "Cron-managed" / "Cloud-triggered" affordances on
    // the other triggers. Count all of them combined.
    const runButtons = page.getByRole('button', { name: /^Run$/ });
    const cronAffordances = page.getByText('Cron-managed');
    const cloudAffordances = page.getByText('Cloud-triggered');
    const runCount = await runButtons.count();
    const cronCount = await cronAffordances.count();
    const cloudCount = await cloudAffordances.count();
    expect(
      runCount + cronCount + cloudCount,
      'expected at least 10 skill cards (run/cron/cloud affordances combined)',
    ).toBeGreaterThanOrEqual(10);
  });

  test('executor-disabled state is surfaced', async ({ page }) => {
    // Log in first so that subsequent requests (API probe + page navigation)
    // all use an authenticated session.
    await loginAsAdmin(page);

    // Query the API (now with auth) to know which executor state this
    // environment has, so the assertion can match whichever badge the page
    // renders. A dev machine with AGENTIC_OS_EXECUTOR_ENABLED=1 in .env.local
    // will render "Local executor available" rather than "Catalog mode"; CI
    // (env var unset) renders "Catalog mode". Either is correct.
    const apiRes = await page.request.get('/api/admin/agentic-os');
    const apiJson = await apiRes.json();
    const executorAvailable: boolean = apiJson?.data?.executorAvailable ?? false;

    await page.goto('/admin/agentic-os', { waitUntil: 'domcontentloaded' });

    // Wait for the catalog to hydrate so the executor badge has a chance to
    // render. The header heading is the cheapest hydration anchor — it only
    // appears after the client-side fetch to /api/admin/agentic-os completes
    // (the page renders a spinner while loading=true).
    await expect(
      page.getByRole('heading', { level: 1, name: 'Agentic OS' }),
    ).toBeVisible({ timeout: 15_000 });

    // The page renders exactly one of two badges next to the h1:
    //   • "Local executor available" when executorAvailable === true
    //   • "Catalog mode"             when executorAvailable === false
    // (page.tsx ~line 636-650; route.ts ~line 49-63)
    if (executorAvailable) {
      // The badge span also contains the "bolt" material-icon text node, so
      // exact matching won't work; use a regex and .first() to avoid
      // strict-mode ambiguity from ancestor elements that include this text.
      await expect(
        page.getByText(/Local executor available/).first(),
      ).toBeVisible({ timeout: 10_000 });
    } else {
      // Same structure: the span contains "visibility" + "Catalog mode".
      await expect(page.getByText(/Catalog mode/).first()).toBeVisible({
        timeout: 10_000,
      });

      // Belt-and-suspenders: when executor is off, the host hint should also
      // be visible. If the server ever changes the hint string this assertion
      // will need updating, but it catches regressions where the hint stops
      // rendering at all.
      await expect(
        page.getByText(/Set AGENTIC_OS_EXECUTOR_ENABLED=1/),
      ).toBeVisible();
    }
  });

  test('run drawer opens with Copy prompt enabled and Run disabled', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/agentic-os', { waitUntil: 'domcontentloaded' });

    await expect(
      page.getByRole('heading', { level: 1, name: 'Agentic OS' }),
    ).toBeVisible({ timeout: 15_000 });

    // Click the first on-demand "Run" button on a skill card. The drawer
    // mounts a footer with another "Run" button + a "Copy prompt" button,
    // so after the click we expect both to be visible.
    // Material Icons render the icon name as text ("play_arrow") inside a
    // <span class="material-icons">, so the computed accessible name becomes
    // "play_arrow Run" — /^Run$/ fails.  Match the word "Run" anywhere.
    const firstCardRunButton = page.getByRole('button', { name: /\bRun\b/ }).first();
    await expect(firstCardRunButton).toBeVisible({ timeout: 10_000 });
    await firstCardRunButton.click();

    // The "Copy prompt" button only renders inside the drawer footer.
    const copyPromptButton = page.getByRole('button', { name: /Copy prompt/ });
    await expect(copyPromptButton).toBeVisible({ timeout: 10_000 });
    await expect(copyPromptButton).toBeEnabled();

    // The drawer's "Run" button must be disabled when the executor is off.
    // It carries the title="Executor disabled on this host" attribute when
    // `executorAvailable === false` (see page.tsx line 514-516). Use the
    // title-locator to disambiguate from the card-level "Run" buttons that
    // are still rendered behind the modal overlay.
    const drawerRunButton = page.locator('button[title="Executor disabled on this host"]');
    await expect(drawerRunButton).toBeVisible();
    await expect(drawerRunButton).toBeDisabled();

    // The drawer footer also surfaces the disabled hint text.
    await expect(
      page.getByText(/Executor disabled.*Copy prompt/i),
    ).toBeVisible();
  });

  test('recent runs section renders (contents may be empty)', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/agentic-os', { waitUntil: 'domcontentloaded' });

    await expect(
      page.getByRole('heading', { level: 1, name: 'Agentic OS' }),
    ).toBeVisible({ timeout: 15_000 });

    // The page always renders the compact `RunHistory` footer below the
    // domain sections. When there are zero runs the empty state shows the
    // "No runs yet" headline; when there are runs the section heading is
    // "Recent runs". Either is acceptable — we just need the section to
    // mount cleanly without throwing.
    const recentRunsHeading = page.getByRole('heading', { level: 2, name: 'Recent runs' });
    const emptyState = page.getByText('No runs yet', { exact: true });

    // Wait for either marker — whichever shows up first wins. Race them so
    // the test is fast on a hot cache and tolerant of either state.
    await expect(recentRunsHeading.or(emptyState).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
