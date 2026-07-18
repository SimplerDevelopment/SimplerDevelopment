/**
 * Per-Domain Onboarding — in-domain "get started" card E2E tests (DOB-019).
 *
 * Covers the DomainGetStarted card (components/portal/onboarding/DomainGetStarted.tsx)
 * mounted at the top of individual domain landing pages, driven by:
 *   - GET /api/portal/onboarding/status — per-domain step detection
 *   - lib/onboarding/module-segments.ts — the step registry (every domain's
 *     FIRST action is `preCredited: true` so progress can never read 0%)
 *   - lib/onboarding/detections.ts — the tenant-scoped "has this tenant done
 *     the thing?" queries backing each step
 *
 * Test tenant note: `clientApi` / `loginAsOtherClient` both authenticate as
 * the shared seed tenant (`client@example.com`), which runs in `agency`
 * billing mode (gatingBypassed) and is therefore entitled to every domain in
 * the catalog (lib/billing/entitlements.ts). That tenant is NOT a clean-room
 * fixture — other specs in this suite create/leave behind surveys, booking
 * pages, and automation rules for it — so this file avoids asserting an
 * exact zero baseline for any single domain's steps. Instead it:
 *   1. Verifies the pre-credited invariant holds for every entitled domain
 *      directly against the status API (deterministic, data-independent).
 *   2. Visits a few representative domain landing pages and checks the card
 *      renders with a non-zero progress readout — or, if the card is hidden,
 *      independently verifies via the status API that the domain is genuinely
 *      complete (the only reason DomainGetStarted ever hides itself besides
 *      user dismissal, which this file resets before every test).
 *   3. Creates one real survey and asserts the surveys domain's
 *      `create-survey` step flips to `done`.
 */
import { test, expect } from './setup/fixtures';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

interface StatusStep {
  key: string;
  done: boolean;
  preCredited: boolean;
  counted: boolean;
}

interface DomainStatus {
  steps: StatusStep[];
  done: number;
  total: number;
  complete: boolean;
}

type ApiClientLike = {
  get: (path: string) => Promise<{ status: number; data: any }>;
  post: (path: string, body?: Record<string, unknown>) => Promise<{ status: number; data: any }>;
  patch: (path: string, body?: Record<string, unknown>) => Promise<{ status: number; data: any }>;
  delete: (path: string, body?: Record<string, unknown>) => Promise<{ status: number; data: any }>;
};

/** Clear any dismissed-card state so DomainGetStarted cards are eligible to
 *  render. Deliberately does NOT touch the wizard (`reopen` resets `step` and
 *  races portal-onboarding.spec.ts's @critical API tests under local 4-worker
 *  parallelism); an incomplete wizard is handled by the redirect branch below. */
async function resetOnboarding(api: ApiClientLike) {
  await api.patch('/api/portal/onboarding', { answers: { dismissedDomains: [] } });
}

test.describe('Per-domain onboarding cards @onboarding', () => {
  test.beforeEach(async ({ clientApi }) => {
    await resetOnboarding(clientApi);
  });

  test('status API pre-credits every entitled domain — never 0 of N / 0%', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/onboarding/status');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);

    const domains = res.data.data.domains as Record<string, DomainStatus>;
    const keys = Object.keys(domains);
    expect(keys.length).toBeGreaterThan(0);

    for (const key of keys) {
      const d = domains[key];
      if (d.total === 0) continue; // domain has no countable steps — nothing to credit
      // The registry's first action per domain is always preCredited, so
      // `done` must be >= 1 whenever there is at least one countable step.
      expect(d.done, `domain "${key}" reported 0 done steps`).toBeGreaterThanOrEqual(1);
      const pct = Math.round((d.done / d.total) * 100);
      expect(pct, `domain "${key}" computed 0% progress`).toBeGreaterThan(0);
    }
  });

  const domainPages: Array<{ path: string; domainKey: string; title: string }> = [
    { path: '/portal/surveys', domainKey: 'surveys', title: 'Create your first survey' },
    { path: '/portal/tools/booking', domainKey: 'bookings', title: 'Start taking bookings' },
    { path: '/portal/brain/automations', domainKey: 'automations', title: 'Automate your first workflow' },
  ];

  for (const { path, domainKey, title } of domainPages) {
    test(`${domainKey} landing page mounts the get-started card with non-zero progress`, async ({
      page,
      loginAsOtherClient,
    }) => {
      await loginAsOtherClient(page);
      await resetOnboarding({
        get: async (p: string) => {
          const r = await page.request.get(p);
          return { status: r.status(), data: await r.json().catch(() => null) };
        },
        post: async (p: string, body?: Record<string, unknown>) => {
          const r = await page.request.post(p, { data: body });
          return { status: r.status(), data: await r.json().catch(() => null) };
        },
        patch: async (p: string, body?: Record<string, unknown>) => {
          const r = await page.request.patch(p, { data: body });
          return { status: r.status(), data: await r.json().catch(() => null) };
        },
        delete: async (p: string) => {
          const r = await page.request.delete(p);
          return { status: r.status(), data: await r.json().catch(() => null) };
        },
      });

      await page.goto(`${BASE_URL}${path}`);

      const heading = page.getByRole('heading', { name: title });
      // The card mounts only after the component's own status + onboarding
      // fetches resolve — wait bounded rather than sampling instantly.
      const visible = await heading
        .waitFor({ state: 'visible', timeout: 10_000 })
        .then(() => true)
        .catch(() => false);

      if (!visible) {
        // The card self-hides when the domain is complete or user-dismissed.
        // Locally the suite runs 4 workers against ONE shared tenant, and
        // sibling specs (portal-onboarding.spec.ts) reopen/complete onboarding
        // concurrently — which can re-dismiss domains or bounce this page to
        // the wizard mid-test. Accept any of those verified causes; fail only
        // if the card is hidden with no legitimate reason.
        if (page.url().includes('/portal/onboarding')) return; // wizard redirect race

        const statusRes = await page.request.get('/api/portal/onboarding/status');
        const statusBody = await statusRes.json();
        const domainStatus = statusBody?.data?.domains?.[domainKey] as DomainStatus | undefined;
        expect(domainStatus, `expected onboarding status for domain "${domainKey}"`).toBeTruthy();

        const obRes = await page.request.get('/api/portal/onboarding');
        const obBody = await obRes.json().catch(() => null);
        const dismissedNow: string[] = obBody?.data?.answers?.dismissedDomains ?? [];

        expect(
          domainStatus!.complete || dismissedNow.includes(domainKey),
          `${domainKey} get-started card was hidden but domain is neither complete nor dismissed`,
        ).toBe(true);
        return;
      }

      await expect(heading).toBeVisible();

      // "N of M steps complete" — must never read "0 of ..." (goal gradient /
      // pre-credited-step invariant, spec "Per-Domain Onboarding" UX req 1).
      const progressRow = page.getByText(/steps complete/);
      await expect(progressRow).toBeVisible();
      const progressText = (await progressRow.textContent())?.trim() ?? '';
      expect(progressText).not.toBe('');
      expect(progressText).not.toMatch(/^0 of/);

      // The percentage badge rendered alongside it must never read exactly 0%.
      const zeroPercent = page.getByText('0%', { exact: true });
      await expect(zeroPercent).toHaveCount(0);
    });
  }

  test('creating a survey flips the surveys "create-survey" step to done', async ({ clientApi }) => {
    const ts = Date.now();
    const created = await clientApi.post('/api/portal/surveys', {
      title: `DOB-019 Onboarding Flip ${ts}`,
      description: 'E2E: onboarding per-domain step-flip regression',
      fields: [{ id: 'q1', type: 'text', label: 'Name', required: true }],
    });

    if (created.status === 403) {
      // Surveys is a paid module; this tenant isn't entitled in this
      // environment — nothing to flip. Mirrors the tolerant-gate pattern in
      // portal-surveys.spec.ts rather than failing the whole suite.
      test.skip(true, 'Tenant not entitled to surveys — skipping step-flip assertion.');
      return;
    }
    expect(created.data?.success).toBe(true);
    const surveyId = created.data.data.id;

    try {
      const after = await clientApi.get('/api/portal/onboarding/status');
      expect(after.status).toBe(200);
      const afterSurveys = after.data.data.domains?.surveys as DomainStatus | undefined;
      expect(afterSurveys, 'expected a "surveys" domain in onboarding status').toBeTruthy();

      const step = afterSurveys!.steps.find((s) => s.key === 'create-survey');
      expect(step, 'expected a "create-survey" step in the surveys segment').toBeTruthy();
      expect(step!.done).toBe(true);
    } finally {
      await clientApi.delete(`/api/portal/surveys/${surveyId}`).catch(() => {});
    }
  });
});
