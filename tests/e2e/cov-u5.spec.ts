/**
 * Company Brain AI — E2E coverage slice (unit 5, indices 0-3).
 *
 * Cards audited:
 *   0. Auto-ingest connectors (Slack, Confluence, SharePoint) — gap: no routes exist
 *   1. ACL-aware retrieval (per-tenant scoping enforced)       — gap: not a distinct feature
 *   2. Brain RAG → approval queue → publish loop              — needs-spec: complex AI pipeline
 *   3. review-items approve mutation: POST /brain/review-items/[id]/approve
 *
 * Cards 0–2 have no testable route; only card 3 is covered here.
 * The test for card 3 relies on a review item pre-seeded into the test DB
 * (brain_ai_review_items id=1, client_id=1, proposed_type='task').
 */
import { test, expect } from './setup/fixtures';

// ── Card 3: review-items approve mutation ──────────────────────────────────

test.describe('Brain Review-Items — approve mutation @brain @brain-review-items', () => {
  /**
   * POST /api/portal/brain/review-items/[id]/approve
   *
   * A pending review item of type 'task' should be approved: the handler
   * calls approveReviewItem() which transactionally inserts a brain_tasks row
   * and marks the review item as 'approved'.
   *
   * Seed: brain_ai_review_items id=1 was inserted directly into the test DB
   * (client_id=1, proposed_type='task', status='pending').
   */
  test('POST /review-items/1/approve commits a task proposal and returns resultEntityType @brain', async ({
    clientApi,
  }) => {
    // First verify the review item exists in the queue
    const listRes = await clientApi.get('/api/portal/brain/review?status=pending');
    // If brain is not entitled this will be 402 — skip gracefully
    if (listRes.status === 402) {
      test.skip(true, 'Brain not entitled for this tenant; skipping approve test');
      return;
    }
    expect(listRes.status).toBe(200);

    // Check whether our seeded item is visible
    const items = listRes.data?.data?.items ?? [];
    const seededItem = items.find((i: { id: number }) => i.id === 1);

    // If no seeded item is visible (already approved/rejected in a prior run),
    // skip rather than fail — the seed is persistent across runs.
    if (!seededItem) {
      test.skip(true, 'Seeded review item id=1 not in pending queue (already consumed or absent)');
      return;
    }

    // Approve it
    const res = await clientApi.post('/api/portal/brain/review-items/1/approve', {});
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    expect(res.data.success).toBe(true);
    // The approve handler returns { item, resultEntityType, resultEntityId }
    expect(res.data.data).toHaveProperty('resultEntityType');
    expect(res.data.data.resultEntityType).toBe('brain_task');
    expect(typeof res.data.data.resultEntityId).toBe('number');
    // The item itself should now be approved
    expect(res.data.data.item).toHaveProperty('status');
    expect(res.data.data.item.status).toBe('approved');
  });

  test('POST /review-items/[unknown]/approve returns 400 for unknown item @brain', async ({
    clientApi,
  }) => {
    const res = await clientApi.post('/api/portal/brain/review-items/999999/approve', {});
    if (res.status === 402) {
      test.skip(true, 'Brain not entitled; skipping');
      return;
    }
    // Approve of non-existent item throws "Review item not found" → 400
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('POST /review-items/[id]/approve rejects unauthenticated @brain', async ({
    unauthApi,
  }) => {
    const res = await unauthApi.post('/api/portal/brain/review-items/1/approve', {});
    expect(res.status).toBe(401);
  });
});
