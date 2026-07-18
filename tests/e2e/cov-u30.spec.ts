/**
 * cov-u30 — Email Campaigns E2E coverage slice (indices 0–3)
 *
 * Cards under test:
 *   0. Branching journey / drip sequence builder          → gap (no implementation)
 *   1. Deliverability testing (inbox preview, spam score) → gap (no implementation)
 *   2. List-growth forms embedded on site                 → gap (no implementation)
 *   3. Scheduled campaign dispatch (cron wiring)          → tests below
 *
 * Card 3 exercises the PATCH /api/portal/email/campaigns/[id] scheduledAt
 * field: a future timestamp must set status=scheduled; clearing it reverts
 * to draft.  The cron endpoint itself (GET /api/cron/email-scheduled-send)
 * is also probed to confirm it is wired and reachable.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups } from './setup/helpers';

// ── helpers ──────────────────────────────────────────────────────────────────

async function createTestList(clientApi: import('./setup/api-client').ApiClient) {
  const ts = Date.now();
  const res = await clientApi.post('/api/portal/email/lists', {
    name: `u30-list-${ts}`,
    description: 'cov-u30 temp list',
  });
  if (res.status !== 201) throw new Error(`createTestList failed: ${res.status} ${JSON.stringify(res.data)}`);
  const listId: number = res.data.data.id;
  return {
    listId,
    cleanup: async () => {
      await clientApi.delete(`/api/portal/email/lists/${listId}`).catch(() => {});
    },
  };
}

async function createTestCampaign(
  clientApi: import('./setup/api-client').ApiClient,
  listId: number,
) {
  const ts = Date.now();
  const res = await clientApi.post('/api/portal/email/campaigns', {
    name: `u30-campaign-${ts}`,
    subject: `U30 Subject ${ts}`,
    fromName: 'U30 Tester',
    fromEmail: `u30-${ts}@example.com`,
    listId,
    htmlContent: '<p>Hello world</p>',
  });
  if (res.status !== 201) throw new Error(`createTestCampaign failed: ${res.status} ${JSON.stringify(res.data)}`);
  const campaign = res.data.data;
  return {
    campaign,
    cleanup: async () => {
      await clientApi.delete(`/api/portal/email/campaigns/${campaign.id}`).catch(() => {});
    },
  };
}

// ── Card 3: Scheduled campaign dispatch (scheduledAt / status wiring) ────────

test.describe('Email Campaigns — Scheduled dispatch (card 3) @email @schedule', () => {
  let cleanups: Array<() => Promise<void>> = [];
  let hasAccess = false;

  test.beforeAll(async ({ clientApi }) => {
    const probe = await clientApi.get('/api/portal/email/lists');
    hasAccess = probe.status === 200;
  });

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test(
    'PATCH scheduledAt to future timestamp sets status=scheduled',
    async ({ clientApi }) => {
      test.skip(!hasAccess, 'No email subscription on test seed');

      const { listId, cleanup: listCleanup } = await createTestList(clientApi);
      cleanups.push(listCleanup);

      const { campaign, cleanup: campCleanup } = await createTestCampaign(clientApi, listId);
      cleanups.push(campCleanup);

      // Schedule 1 hour in the future
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const res = await clientApi.patch(
        `/api/portal/email/campaigns/${campaign.id}`,
        { scheduledAt: future },
      );
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.data.status).toBe('scheduled');
      expect(res.data.data.scheduledAt).toBeTruthy();
    },
  );

  test(
    'PATCH scheduledAt=null reverts status to draft',
    async ({ clientApi }) => {
      test.skip(!hasAccess, 'No email subscription on test seed');

      const { listId, cleanup: listCleanup } = await createTestList(clientApi);
      cleanups.push(listCleanup);

      const { campaign, cleanup: campCleanup } = await createTestCampaign(clientApi, listId);
      cleanups.push(campCleanup);

      // First schedule it
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const scheduled = await clientApi.patch(
        `/api/portal/email/campaigns/${campaign.id}`,
        { scheduledAt: future },
      );
      expect(scheduled.status).toBe(200);
      expect(scheduled.data.data.status).toBe('scheduled');

      // Then unschedule by clearing scheduledAt
      const cleared = await clientApi.patch(
        `/api/portal/email/campaigns/${campaign.id}`,
        { scheduledAt: null },
      );
      expect(cleared.status).toBe(200);
      expect(cleared.data.success).toBe(true);
      expect(cleared.data.data.status).toBe('draft');
      expect(cleared.data.data.scheduledAt).toBeNull();
    },
  );

  test(
    'cron endpoint GET /api/cron/email-scheduled-send is wired and responds',
    async ({ unauthApi }) => {
      // With no CRON_SECRET set in test env, the endpoint should respond 200 (open)
      // or 401 (guarded). Either is acceptable — what we verify is that the route
      // is mounted and returns a known status, not 404.
      const res = await unauthApi.get('/api/cron/email-scheduled-send');
      expect([200, 401]).toContain(res.status);
    },
  );
});
