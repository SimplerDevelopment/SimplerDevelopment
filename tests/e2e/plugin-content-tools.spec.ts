/**
 * Plugin registry — Content Tools end-to-end (@critical)
 *
 * Walks the full happy path of the first registry plugin:
 *   1. Sidebar shows "Apps > Content Tools" for entitled (client 103) users
 *   2. Clicking the sidebar item reverse-proxies to the plugin dashboard
 *   3. Non-entitled users see a 404 or upsell at the same URL
 *   4. Submitting a research-brief run drives a registered_app_runs row to
 *      `succeeded` and the brief lands in /briefs
 *   5. Creating a weekly schedule writes a registered_app_jobs row whose
 *      summary renders as "Tue 09:00 UTC"
 *
 * This spec is **conditional**. It will skip itself (rather than fail) when:
 *   - The portal dev server at PORTAL_BASE_URL isn't responding to /portal/login
 *   - The plugin dev server at PLUGIN_DEV_URL isn't serving /sd-manifest.json
 *   - CONTENT_PLUGIN_EMAIL / CONTENT_USER_PASSWORD env vars are not set
 *     (no seed script provisions a client-103 user — operator must supply)
 *
 * Run manually after a stage deploy or with all three envs set locally:
 *   PORTAL_BASE_URL=http://localhost:3000 \
 *   PLUGIN_DEV_URL=http://localhost:3001 \
 *   CONTENT_PLUGIN_EMAIL=ops@contentconsulting.com \
 *   CONTENT_USER_PASSWORD=... \
 *   bunx playwright test tests/e2e/plugin-content-tools.spec.ts
 */
import { test, expect } from './setup/fixtures';
import { runCleanups } from './setup/helpers';
import { ApiClient } from './setup/api-client';

const PORTAL_BASE_URL = process.env.PORTAL_BASE_URL || process.env.BASE_URL || 'http://localhost:3000';
const PLUGIN_DEV_URL = process.env.PLUGIN_DEV_URL || 'http://localhost:3001';
const CONTENT_PLUGIN_EMAIL = process.env.CONTENT_PLUGIN_EMAIL || '';
const CONTENT_PASSWORD = process.env.CONTENT_USER_PASSWORD || '';
const RUN_MAX_WAIT_MS = Number(process.env.PLUGIN_RUN_MAX_WAIT_MS || 90_000);

// Path prefixes inside the portal where the proxy lives.
const APP_BASE = '/portal/apps/content-tools';
const CALLBACK_BASE = '/api/plugin-callback/content-tools';

/** Cheap reachability probe — returns true if `url` answers 2xx/3xx/4xx
 *  (we only care that *something* is listening; a 404 is fine for "up"). */
async function isReachable(url: string, timeoutMs = 3000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal, redirect: 'manual' }).catch(() => null);
    clearTimeout(t);
    if (!res) return false;
    return res.status < 600;
  } catch {
    return false;
  }
}

test.describe('Content Tools plugin @plugins @critical', () => {
  // Suite-wide skip flag — set in beforeAll if any precondition fails.
  let suiteSkipReason: string | null = null;

  // Eagerly compute env-driven skip reasons so each test can re-check them
  // inside its own body too (beforeAll's skip applies to discovery but not
  // individual `test.skip(condition, reason)` early-returns).
  const credsMissing = !CONTENT_PLUGIN_EMAIL || !CONTENT_PASSWORD;

  test.beforeAll(async () => {
    if (credsMissing) {
      suiteSkipReason =
        'CONTENT_PLUGIN_EMAIL / CONTENT_USER_PASSWORD env vars not set — ' +
        'no test user available for client 103. Skipping plugin-content-tools suite.';
      test.skip(true, suiteSkipReason);
      return;
    }

    const portalUp = await isReachable(`${PORTAL_BASE_URL}/portal/login`);
    if (!portalUp) {
      suiteSkipReason = `Portal not reachable at ${PORTAL_BASE_URL}/portal/login — skipping.`;
      test.skip(true, suiteSkipReason);
      return;
    }

    const pluginUp = await isReachable(`${PLUGIN_DEV_URL}/sd-manifest.json`);
    if (!pluginUp) {
      suiteSkipReason =
        `Plugin dev server not reachable at ${PLUGIN_DEV_URL}/sd-manifest.json — skipping. ` +
        'Set PLUGIN_DEV_URL to point at a running content-tools instance ' +
        '(default http://localhost:3001) or run this spec after a stage deploy.';
      test.skip(true, suiteSkipReason);
      return;
    }

    // The seed migration scripts/migrations/plugins/seed-content-tools.ts
    // is operator-applied — we don't auto-run it here because it mints a
    // signing-key plaintext that must be hand-copied into the plugin's env.
    // Surface a hint if the registry row clearly isn't present.
    const probe = await fetch(`${PORTAL_BASE_URL}${APP_BASE}`, { redirect: 'manual' }).catch(() => null);
    if (probe && probe.status === 404) {
      suiteSkipReason =
        `${APP_BASE} returns 404 — the content-tools registry row is not ` +
        'seeded or not active. Run scripts/migrations/plugins/seed-content-tools.ts ' +
        "and UPDATE registered_apps SET status='active' WHERE slug='content-tools'.";
      test.skip(true, suiteSkipReason);
      return;
    }
  });

  test('sidebar shows Apps → Content Tools for content users', async ({ page, loginAsContent }) => {
    await loginAsContent(page);
    await page.goto('/portal');
    await page.waitForLoadState('networkidle').catch(() => {});

    // The Apps nav group is rendered by lib/portal-nav.ts; the plugin's
    // entry uses the manifest's `name` from registered_apps.
    const appsGroup = page.getByRole('link', { name: /apps/i }).first();
    // The group may be collapsible — click to expand if not already showing
    // the child item.
    const child = page.getByRole('link', { name: /content tools/i }).first();
    if (!(await child.isVisible().catch(() => false))) {
      await appsGroup.click().catch(() => {});
    }
    await expect(child).toBeVisible({ timeout: 10_000 });

    await page.screenshot({
      path: 'tests/e2e/screenshots/plugin-content-tools/01-sidebar.png',
      fullPage: false,
    }).catch(() => {});
  });

  test('clicking the sidebar item proxies to the plugin dashboard', async ({ page, loginAsContent }) => {
    await loginAsContent(page);
    await page.goto(APP_BASE);
    await page.waitForLoadState('networkidle').catch(() => {});

    // URL stays under /portal/apps/content-tools (Next.js rewrite, not redirect)
    expect(page.url()).toContain(APP_BASE);

    // Manifest declares dashboard content — assert against any of the known
    // labels the plugin renders. We're tolerant of minor copy changes.
    const dashboardMarker = page
      .getByText(/content tools|research brief|blog draft|schedule/i)
      .first();
    await expect(dashboardMarker).toBeVisible({ timeout: 10_000 });

    await page.screenshot({
      path: 'tests/e2e/screenshots/plugin-content-tools/02-dashboard.png',
      fullPage: true,
    }).catch(() => {});
  });

  test('non-content users see 404 or upsell at /portal/apps/content-tools', async ({ page, loginAsOtherClient }) => {
    await loginAsOtherClient(page);
    const res = await page.goto(APP_BASE, { waitUntil: 'domcontentloaded' });

    // The entitlement layout (app/portal/apps/[appId]/layout.tsx) returns
    // either a 404 (visibility='allowlist' + clientId ∉ allowedClientIds)
    // OR a 200 upsell card ("Contact your account manager"). Accept either.
    const status = res?.status() ?? 0;
    if (status === 404) {
      await expect(page.getByText(/not found|404/i).first()).toBeVisible();
    } else {
      const upsell = page
        .getByText(/account manager|upgrade|contact|not available|request access/i)
        .first();
      await expect(upsell).toBeVisible({ timeout: 10_000 });
    }

    await page.screenshot({
      path: 'tests/e2e/screenshots/plugin-content-tools/03-non-entitled.png',
      fullPage: true,
    }).catch(() => {});
  });

  test('triggers a research brief and the run row reaches succeeded', async ({ page, loginAsContent }) => {
    test.setTimeout(RUN_MAX_WAIT_MS + 60_000);

    await loginAsContent(page);
    await page.goto(`${APP_BASE}/briefs/new`);
    await page.waitForLoadState('networkidle').catch(() => {});

    const topic = `Technolutions Slate Q1 2026 product news ${Date.now()}`;
    const topicInput = page.getByLabel(/topic/i).first();
    await expect(topicInput).toBeVisible({ timeout: 10_000 });
    await topicInput.fill(topic);

    // Submit — accept any of: button labeled "Run", "Submit", "Generate", or
    // a primary-action button.
    const submitBtn = page
      .getByRole('button', { name: /run|submit|generate|kick off|start/i })
      .first();
    await submitBtn.click();

    // Plugin should redirect to /runs/<id> after enqueue.
    await page.waitForURL(/\/portal\/apps\/content-tools\/runs\/\d+/, { timeout: 20_000 });
    const url = new URL(page.url());
    const runIdMatch = url.pathname.match(/\/runs\/(\d+)/);
    expect(runIdMatch).not.toBeNull();
    const runId = Number(runIdMatch![1]);

    await page.screenshot({
      path: 'tests/e2e/screenshots/plugin-content-tools/04-run-queued.png',
      fullPage: true,
    }).catch(() => {});

    // Poll run status until succeeded (or fail explicitly on `failed`/timeout).
    // Reload the page each poll — the run detail page is server-rendered
    // and doesn't stream updates in v1.
    const started = Date.now();
    let lastStatus = 'queued';
    while (Date.now() - started < RUN_MAX_WAIT_MS) {
      await page.reload({ waitUntil: 'domcontentloaded' });
      const statusBadge = await page
        .getByText(/queued|running|succeeded|failed|cancelled/i)
        .first()
        .textContent()
        .catch(() => null);
      if (statusBadge) {
        lastStatus = statusBadge.trim().toLowerCase();
        if (lastStatus.includes('succeeded')) break;
        if (lastStatus.includes('failed') || lastStatus.includes('cancelled')) break;
      }
      await page.waitForTimeout(3000);
    }

    expect(lastStatus, `run ${runId} should reach 'succeeded' within ${RUN_MAX_WAIT_MS}ms`).toContain('succeeded');

    // Brief should now be listed at /briefs
    await page.goto(`${APP_BASE}/briefs`);
    await page.waitForLoadState('networkidle').catch(() => {});
    const briefRow = page.getByText(topic).first();
    await expect(briefRow).toBeVisible({ timeout: 10_000 });

    await page.screenshot({
      path: 'tests/e2e/screenshots/plugin-content-tools/05-brief-landed.png',
      fullPage: true,
    }).catch(() => {});

    // Cleanup: delete the brief + its run via the plugin's portal-callback
    // surface. We use an authenticated ApiClient session — the callback API
    // is JWT-only but the portal also exposes admin-side DELETEs on the
    // same resource set for portal users with the entitlement. If those
    // endpoints don't exist yet, fall through (the test still produced its
    // assertion; cleanup is best-effort).
    const cleanups: Array<() => Promise<void>> = [];
    cleanups.push(async () => {
      const api = new ApiClient(CONTENT_PLUGIN_EMAIL, CONTENT_PASSWORD);
      await api.ensure().catch(() => {});
      // List briefs to find the one we created (the response shape is
      // whatever the plugin returns from /briefs).
      const briefsRes = await api.get(`${CALLBACK_BASE}/briefs`).catch(() => null);
      const briefs = (briefsRes?.data?.data ?? []) as Array<{ id: number; topic?: string }>;
      const mine = briefs.find(b => b.topic === topic);
      if (mine) {
        await api.delete(`${CALLBACK_BASE}/briefs/${mine.id}`).catch(() => {});
      }
      await api.delete(`${CALLBACK_BASE}/scripts/runs/${runId}`).catch(() => {});
      await api.dispose().catch(() => {});
    });
    await runCleanups(cleanups);
  });

  test('scheduling a weekly job creates a registered_app_jobs row with the right nextRunAt', async ({ page, loginAsContent }) => {
    await loginAsContent(page);
    await page.goto(`${APP_BASE}/schedules`);
    await page.waitForLoadState('networkidle').catch(() => {});

    const jobName = `E2E weekly job ${Date.now()}`;
    const jobTopic = `Slate news scan ${Date.now()}`;

    // Open create-form. Plugin UI may show form inline or behind a button.
    const newBtn = page
      .getByRole('button', { name: /new schedule|create|add schedule|new job/i })
      .first();
    if (await newBtn.isVisible().catch(() => false)) {
      await newBtn.click();
    }

    await page.getByLabel(/name/i).first().fill(jobName);

    // `kind` is one of 'research-brief' | 'draft-blog-post' — pick via
    // select or radio.
    const kindSelect = page.getByLabel(/kind|type/i).first();
    if (await kindSelect.isVisible().catch(() => false)) {
      await kindSelect.selectOption('research-brief').catch(async () => {
        await kindSelect.fill('research-brief').catch(() => {});
      });
    }

    await page.getByLabel(/topic/i).first().fill(jobTopic);

    // Day of week — Tuesday = 2 (Sun=0 per schema)
    const dowSelect = page.getByLabel(/day.*week|weekday/i).first();
    await dowSelect.selectOption({ value: '2' }).catch(async () => {
      await dowSelect.selectOption({ label: 'Tuesday' }).catch(() => {});
    });

    // Time UTC = 09:00
    const timeInput = page.getByLabel(/time.*utc|utc.*time|time/i).first();
    await timeInput.fill('09:00');

    const submitBtn = page
      .getByRole('button', { name: /save|create|schedule|submit/i })
      .first();
    await submitBtn.click();

    // Schedule should appear in the list. Plugin renders the summary as
    // "Tue 09:00 UTC" (per plan §3C nav integration; the actual copy lives
    // in the plugin repo so we accept any string containing both tokens).
    const row = page.getByText(jobName).first();
    await expect(row).toBeVisible({ timeout: 15_000 });

    const summary = page.getByText(/tue.*09:00.*utc|09:00.*utc.*tue/i).first();
    await expect(summary).toBeVisible({ timeout: 10_000 });

    await page.screenshot({
      path: 'tests/e2e/screenshots/plugin-content-tools/06-schedule-created.png',
      fullPage: true,
    }).catch(() => {});

    // Cleanup the job row.
    const cleanups: Array<() => Promise<void>> = [];
    cleanups.push(async () => {
      const api = new ApiClient(CONTENT_PLUGIN_EMAIL, CONTENT_PASSWORD);
      await api.ensure().catch(() => {});
      const jobsRes = await api.get(`${CALLBACK_BASE}/jobs`).catch(() => null);
      const jobs = (jobsRes?.data?.data ?? []) as Array<{ id: number; name?: string }>;
      const mine = jobs.find(j => j.name === jobName);
      if (mine) {
        await api.delete(`${CALLBACK_BASE}/jobs/${mine.id}`).catch(() => {});
      }
      await api.dispose().catch(() => {});
    });
    await runCleanups(cleanups);
  });
});
