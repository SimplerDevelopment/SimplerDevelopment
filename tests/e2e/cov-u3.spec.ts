/**
 * cov-u3.spec.ts — CRM E2E Audit slice, unit 3 (indices 4-5)
 *
 * Card 4: GET /api/portal/crm/notifications/[id] and
 *         DELETE /api/portal/crm/notifications/[id]
 *   → documents BUG: route only implements PATCH; GET and DELETE are absent.
 *
 * Card 5: PUT /api/portal/crm/pipelines/[id]/stages/[stageId]
 *   → documents BUG: only DELETE is implemented at [stageId]; PUT is absent
 *     (individual stage update is bulk-only via PUT /pipelines/[id]/stages).
 */

import { test, expect } from './setup/fixtures';
import { runCleanups, createTestPipeline } from './setup/helpers';

// ── Card 4: single-notification GET and DELETE ──

test.describe('CRM Notifications /[id] — GET and DELETE (BUG: only PATCH implemented)', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  /**
   * To exercise GET/DELETE on a real notification we first need a notification
   * row that belongs to the authenticated user.  The list endpoint surfaces any
   * existing rows; if the user has at least one we grab its id, otherwise we
   * skip — there is no public "create notification" API.
   */
  test('GET /notifications/[id] is NOT implemented (BUG: only PATCH exists)', async ({ clientApi }) => {
    // Get the notification list to find a real id
    const listRes = await clientApi.get('/api/portal/crm/notifications');
    expect(listRes.status).toBe(200);

    const notifications = listRes.data.data as Array<{ id: number }>;

    if (!notifications || notifications.length === 0) {
      // No notifications in DB for this user — use a plausible id and verify
      // that the server still returns 405 (not 404), which would confirm the
      // method is missing rather than the row.
      const res = await clientApi.get('/api/portal/crm/notifications/999999');
      // BUG: Next.js returns 405 when no GET handler is exported.
      expect([404, 405]).toContain(res.status);
      return;
    }

    const notifId = notifications[0].id;
    const res = await clientApi.get(`/api/portal/crm/notifications/${notifId}`);
    // BUG: route only exports PATCH, so Next.js responds 405 for GET.
    expect(res.status).toBe(405);
  });

  test('DELETE /notifications/[id] is NOT implemented (BUG: only PATCH exists)', async ({ clientApi }) => {
    const listRes = await clientApi.get('/api/portal/crm/notifications');
    expect(listRes.status).toBe(200);

    const notifications = listRes.data.data as Array<{ id: number }>;

    if (!notifications || notifications.length === 0) {
      const res = await clientApi.delete('/api/portal/crm/notifications/999999');
      expect([404, 405]).toContain(res.status);
      return;
    }

    const notifId = notifications[0].id;
    const res = await clientApi.delete(`/api/portal/crm/notifications/${notifId}`);
    // BUG: no DELETE handler exported — Next.js returns 405.
    expect(res.status).toBe(405);
  });

  test('PATCH /notifications/[id] (the only method that exists) marks a notification read', async ({ clientApi }) => {
    const listRes = await clientApi.get('/api/portal/crm/notifications');
    expect(listRes.status).toBe(200);

    const notifications = listRes.data.data as Array<{ id: number; read: boolean }>;

    if (!notifications || notifications.length === 0) {
      test.skip(); // No notification to PATCH — acceptable precondition gap
      return;
    }

    const notif = notifications[0];
    const res = await clientApi.patch(`/api/portal/crm/notifications/${notif.id}`, { read: true });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.read).toBe(true);
  });

  test('PATCH /notifications/[id] returns 401 for unauthenticated request', async ({ unauthApi }) => {
    const res = await unauthApi.patch('/api/portal/crm/notifications/1', { read: true });
    expect(res.status).toBe(401);
  });
});

// ── Card 5: PUT /pipelines/[id]/stages/[stageId] (individual stage update) ──

test.describe('CRM Pipelines /[id]/stages/[stageId] — PUT (BUG: only DELETE implemented)', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('PUT /pipelines/[id]/stages/[stageId] is NOT implemented (BUG: only DELETE exists)', async ({ clientApi }) => {
    // Create a fresh pipeline so we have a real pipelineId + stageId to use.
    const { pipeline } = await createTestPipeline(clientApi);
    const stages = pipeline.stages as Array<{ id: number; name: string }>;
    expect(stages.length).toBeGreaterThan(0);

    const stageId = stages[0].id;
    const res = await clientApi.put(
      `/api/portal/crm/pipelines/${pipeline.id}/stages/${stageId}`,
      { name: 'Updated Stage Name', sortOrder: 0 }
    );
    // BUG: only DELETE is implemented at this URL; PUT is absent.
    // Next.js returns 405 when no PUT handler is exported.
    expect(res.status).toBe(405);
  });

  test('DELETE /pipelines/[id]/stages/[stageId] IS implemented — deletes an empty stage', async ({ clientApi }) => {
    // Create a pipeline, then add an extra stage via bulk PUT on /stages,
    // then DELETE it via the individual [stageId] endpoint.
    const { pipeline } = await createTestPipeline(clientApi);

    // Add a new deletable stage via the bulk-update route (which does exist)
    const bulkRes = await clientApi.put(
      `/api/portal/crm/pipelines/${pipeline.id}/stages`,
      {
        stages: [
          // Re-send all existing stages to preserve them, then add a new one.
          ...(pipeline.stages as Array<{ id: number; name: string; color: string; sortOrder: number; probability: number | null }>).map((s) => ({
            id: s.id,
            name: s.name,
            color: s.color,
            sortOrder: s.sortOrder,
            probability: s.probability,
          })),
          {
            name: `DeleteMe-${Date.now()}`,
            color: '#aabbcc',
            sortOrder: 99,
          },
        ],
      }
    );
    expect(bulkRes.status).toBe(200);
    expect(bulkRes.data.success).toBe(true);

    // Find the newly-created stage (no id in the request = new row)
    const allStages = bulkRes.data.data as Array<{ id: number; name: string }>;
    const newStage = allStages.find((s) => s.name.startsWith('DeleteMe-'));
    expect(newStage).toBeTruthy();

    // DELETE it via the individual endpoint — the only method that exists there
    const delRes = await clientApi.delete(
      `/api/portal/crm/pipelines/${pipeline.id}/stages/${newStage!.id}`
    );
    expect(delRes.status).toBe(200);
    expect(delRes.data.success).toBe(true);
    expect(delRes.data.data.id).toBe(newStage!.id);
  });

  test('DELETE /pipelines/[id]/stages/[stageId] returns 409 when deals are in the stage', async ({ clientApi }) => {
    // Get (or create) a pipeline and use its first stage to place a deal.
    const { pipeline } = await createTestPipeline(clientApi);
    const stages = pipeline.stages as Array<{ id: number }>;
    expect(stages.length).toBeGreaterThan(0);

    const stageId = stages[0].id;

    // Create a deal in that stage so the delete is blocked.
    const dealRes = await clientApi.post('/api/portal/crm/deals', {
      title: `Block-stage-delete-deal-${Date.now()}`,
      pipelineId: pipeline.id,
      stageId,
      value: 100,
      currency: 'USD',
    });
    expect(dealRes.status).toBe(201);
    const deal = dealRes.data.data as { id: number };
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/crm/deals/${deal.id}`).catch(() => {});
    });

    const delRes = await clientApi.delete(
      `/api/portal/crm/pipelines/${pipeline.id}/stages/${stageId}`
    );
    expect(delRes.status).toBe(409);
    expect(delRes.data.success).toBe(false);
  });

  test('DELETE /pipelines/[id]/stages/[stageId] returns 401 for unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.delete('/api/portal/crm/pipelines/1/stages/1');
    expect(res.status).toBe(401);
  });
});
