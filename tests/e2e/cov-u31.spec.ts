/**
 * cov-u31 — Email Campaigns coverage slice (indices 4-7 of "To Test" backlog)
 *
 * Card 4: Approval-vs-send governance gate — no implementation found → gap (no test)
 * Card 5: A/B subject test — PATCH campaign with abEnabled=true + abSubjectB
 * Card 6: A/B winner promotion — GET promote-winner returns counts + projectedWinner
 * Card 7: Schedule campaign — PATCH scheduledAt sets status=scheduled; clearing reverts to draft
 */

import { test, expect } from './setup/fixtures';

// ---------------------------------------------------------------------------
// Helpers (local, no import from helpers.ts to keep file self-contained)
// ---------------------------------------------------------------------------

async function createTestList(api: import('./setup/api-client').ApiClient) {
  const ts = Date.now();
  const res = await api.post('/api/portal/email/lists', {
    name: `u31-list-${ts}`,
    description: 'cov-u31 test list',
  });
  if (!res.data?.success) throw new Error(`createTestList failed: ${JSON.stringify(res.data)}`);
  const listId = res.data.data.id;
  return {
    listId,
    cleanup: async () => {
      await api.delete(`/api/portal/email/lists/${listId}`).catch(() => {});
    },
  };
}

async function createTestCampaign(api: import('./setup/api-client').ApiClient) {
  const { listId, cleanup: listCleanup } = await createTestList(api);
  const ts = Date.now();
  const res = await api.post('/api/portal/email/campaigns', {
    name: `u31-campaign-${ts}`,
    subject: `Subject ${ts}`,
    fromName: 'Tester',
    fromEmail: `tester-${ts}@example.com`,
    listId,
    htmlContent: '<p>Hello u31</p>',
  });
  if (!res.data?.success) throw new Error(`createTestCampaign failed: ${JSON.stringify(res.data)}`);
  const campaignId = res.data.data.id;
  return {
    campaignId,
    listId,
    cleanup: async () => {
      await api.delete(`/api/portal/email/campaigns/${campaignId}`).catch(() => {});
      await listCleanup();
    },
  };
}

// ---------------------------------------------------------------------------
// Card 5: A/B subject test
// PATCH /api/portal/email/campaigns/[id] with abEnabled=true + abSubjectB
// ---------------------------------------------------------------------------

test.describe('Email Campaigns — A/B Subject Test @email @ab', () => {
  let cleanupFns: Array<() => Promise<void>> = [];

  test.afterAll(async () => {
    for (const fn of cleanupFns) await fn().catch(() => {});
    cleanupFns = [];
  });

  test('PATCH with abEnabled=true + abSubjectB stores both fields', async ({ clientApi }) => {
    const { campaignId, cleanup } = await createTestCampaign(clientApi);
    cleanupFns.push(cleanup);

    const ts = Date.now();
    const subjectB = `Subject B variant ${ts}`;

    const res = await clientApi.patch(`/api/portal/email/campaigns/${campaignId}`, {
      abEnabled: true,
      abSubjectB: subjectB,
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.abEnabled).toBe(true);
    expect(res.data.data.abSubjectB).toBe(subjectB);
  });

  test('PATCH abWinnerMetric=click stores click metric', async ({ clientApi }) => {
    const { campaignId, cleanup } = await createTestCampaign(clientApi);
    cleanupFns.push(cleanup);

    const res = await clientApi.patch(`/api/portal/email/campaigns/${campaignId}`, {
      abEnabled: true,
      abSubjectB: 'Alt subject',
      abWinnerMetric: 'click',
    });
    expect(res.status).toBe(200);
    expect(res.data.data.abWinnerMetric).toBe('click');
  });

  test('PATCH abTestSizePct=20 stores the percentage', async ({ clientApi }) => {
    const { campaignId, cleanup } = await createTestCampaign(clientApi);
    cleanupFns.push(cleanup);

    const res = await clientApi.patch(`/api/portal/email/campaigns/${campaignId}`, {
      abEnabled: true,
      abSubjectB: 'Alt subject',
      abTestSizePct: 20,
    });
    expect(res.status).toBe(200);
    expect(res.data.data.abTestSizePct).toBe(20);
  });

  test('PATCH abEnabled=false clears the A/B flag', async ({ clientApi }) => {
    const { campaignId, cleanup } = await createTestCampaign(clientApi);
    cleanupFns.push(cleanup);

    // First enable A/B
    await clientApi.patch(`/api/portal/email/campaigns/${campaignId}`, {
      abEnabled: true,
      abSubjectB: 'Alt subject',
    });

    // Then disable
    const res = await clientApi.patch(`/api/portal/email/campaigns/${campaignId}`, {
      abEnabled: false,
    });
    expect(res.status).toBe(200);
    expect(res.data.data.abEnabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Card 6: A/B winner promotion
// GET /api/portal/email/campaigns/[id]/promote-winner — returns counts + projectedWinner
// POST /api/portal/email/campaigns/[id]/promote-winner?force=1 — promotes winner
// ---------------------------------------------------------------------------

test.describe('Email Campaigns — A/B Winner Promotion @email @ab-promote', () => {
  let cleanupFns: Array<() => Promise<void>> = [];

  test.afterAll(async () => {
    for (const fn of cleanupFns) await fn().catch(() => {});
    cleanupFns = [];
  });

  test('GET promote-winner returns counts + projectedWinner for an A/B campaign', async ({ clientApi }) => {
    const { campaignId, cleanup } = await createTestCampaign(clientApi);
    cleanupFns.push(cleanup);

    // Enable A/B on the campaign
    await clientApi.patch(`/api/portal/email/campaigns/${campaignId}`, {
      abEnabled: true,
      abSubjectB: 'Subject B for promote test',
    });

    const res = await clientApi.get(`/api/portal/email/campaigns/${campaignId}/promote-winner`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toHaveProperty('counts');
    expect(res.data.data).toHaveProperty('projectedWinner');
    expect(res.data.data).toHaveProperty('ready');
    expect(res.data.data).toHaveProperty('metric');
  });

  test('GET promote-winner returns 400 when A/B not enabled', async ({ clientApi }) => {
    const { campaignId, cleanup } = await createTestCampaign(clientApi);
    cleanupFns.push(cleanup);

    const res = await clientApi.get(`/api/portal/email/campaigns/${campaignId}/promote-winner`);
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('GET promote-winner returns 404 for unknown campaign', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/email/campaigns/999999/promote-winner');
    expect(res.status).toBe(404);
  });

  test('POST promote-winner?force=1 returns 400 (A/B not enabled on fresh campaign)', async ({ clientApi }) => {
    const { campaignId, cleanup } = await createTestCampaign(clientApi);
    cleanupFns.push(cleanup);

    // campaign has abEnabled=false — should get 400
    const res = await clientApi.post(`/api/portal/email/campaigns/${campaignId}/promote-winner?force=1`, {});
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('POST promote-winner?force=1 returns 400 (A/B enabled but never sent — abSubjectB missing)', async ({ clientApi }) => {
    const { campaignId, cleanup } = await createTestCampaign(clientApi);
    cleanupFns.push(cleanup);

    // Enable A/B but don't set abSubjectB
    await clientApi.patch(`/api/portal/email/campaigns/${campaignId}`, {
      abEnabled: true,
    });

    const res = await clientApi.post(`/api/portal/email/campaigns/${campaignId}/promote-winner?force=1`, {});
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('unauthenticated GET promote-winner returns 401', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/email/campaigns/1/promote-winner');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Card 7: Schedule campaign
// PATCH scheduledAt (future) → status=scheduled
// PATCH scheduledAt=null → status=draft
// ---------------------------------------------------------------------------

test.describe('Email Campaigns — Schedule Campaign @email @schedule', () => {
  let cleanupFns: Array<() => Promise<void>> = [];

  test.afterAll(async () => {
    for (const fn of cleanupFns) await fn().catch(() => {});
    cleanupFns = [];
  });

  test('PATCH scheduledAt to future timestamp sets status=scheduled', async ({ clientApi }) => {
    const { campaignId, cleanup } = await createTestCampaign(clientApi);
    cleanupFns.push(cleanup);

    // Future timestamp: 1 hour from now
    const futureAt = new Date(Date.now() + 3600 * 1000).toISOString();

    const res = await clientApi.patch(`/api/portal/email/campaigns/${campaignId}`, {
      scheduledAt: futureAt,
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.status).toBe('scheduled');
    expect(res.data.data.scheduledAt).toBeTruthy();
  });

  test('PATCH scheduledAt=null reverts status to draft', async ({ clientApi }) => {
    const { campaignId, cleanup } = await createTestCampaign(clientApi);
    cleanupFns.push(cleanup);

    // First schedule it
    await clientApi.patch(`/api/portal/email/campaigns/${campaignId}`, {
      scheduledAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    // Then clear the schedule
    const res = await clientApi.patch(`/api/portal/email/campaigns/${campaignId}`, {
      scheduledAt: null,
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.status).toBe('draft');
    expect(res.data.data.scheduledAt).toBeNull();
  });

  test('Scheduled campaign GET reflects status=scheduled', async ({ clientApi }) => {
    const { campaignId, cleanup } = await createTestCampaign(clientApi);
    cleanupFns.push(cleanup);

    const futureAt = new Date(Date.now() + 7200 * 1000).toISOString();
    await clientApi.patch(`/api/portal/email/campaigns/${campaignId}`, {
      scheduledAt: futureAt,
    });

    const res = await clientApi.get(`/api/portal/email/campaigns/${campaignId}`);
    expect(res.status).toBe(200);
    expect(res.data.data.campaign.status).toBe('scheduled');
  });

  test('Unscheduled campaign GET reflects status=draft', async ({ clientApi }) => {
    const { campaignId, cleanup } = await createTestCampaign(clientApi);
    cleanupFns.push(cleanup);

    // Schedule then unschedule
    await clientApi.patch(`/api/portal/email/campaigns/${campaignId}`, {
      scheduledAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    });
    await clientApi.patch(`/api/portal/email/campaigns/${campaignId}`, {
      scheduledAt: null,
    });

    const res = await clientApi.get(`/api/portal/email/campaigns/${campaignId}`);
    expect(res.status).toBe(200);
    expect(res.data.data.campaign.status).toBe('draft');
    expect(res.data.data.campaign.scheduledAt).toBeNull();
  });
});
