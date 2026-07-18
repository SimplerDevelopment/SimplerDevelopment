/**
 * Admin metered-billing E2E.
 *
 * Covers:
 *   - GET   /api/admin/portal/clients/:id/billing/metered-items   (list)
 *   - POST  ...                                                    (create via existing si_)
 *   - PATCH ...                                                    (status change)
 *   - DELETE ...                                                   (soft remove)
 *   - GET   /api/admin/portal/clients/:id/billing/usage            (dryRun preview)
 *   - POST  ...                                                    (force=false dry-run)
 *   - role gate (client / unauth = 401)
 *
 * Stripe is NOT touched — every test uses the "existing
 * stripeSubscriptionItemId" code path so the API skips the Stripe SDK call.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups } from './setup/helpers';

test.describe('Admin metered Stripe billing @admin @billing @critical', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('admin can configure a metered item, see it in the dry-run preview, then delete it', async ({ adminApi }) => {
    const { clientId, cleanup } = await createTestClient(adminApi);
    cleanups.push(cleanup);

    // List should start empty
    const empty = await adminApi.get(`/api/admin/portal/clients/${clientId}/billing/metered-items`);
    expect(empty.status).toBe(200);
    expect(empty.data.success).toBe(true);
    expect(empty.data.data).toEqual([]);

    // Create one via the existing-item path (no Stripe call)
    const created = await adminApi.post(`/api/admin/portal/clients/${clientId}/billing/metered-items`, {
      resource: 'hosting_bandwidth_gb',
      unitPriceCents: 5,
      includedQuantity: 50,
      stripeSubscriptionId: `sub_e2e_${Date.now()}`,
      stripeSubscriptionItemId: `si_e2e_${Date.now()}`,
    });
    expect(created.status).toBe(201);
    expect(created.data.success).toBe(true);
    expect(created.data.data.resource).toBe('hosting_bandwidth_gb');
    expect(created.data.data.unitPriceCents).toBe(5);
    const itemId = created.data.data.id;

    // List shows it
    const listed = await adminApi.get(`/api/admin/portal/clients/${clientId}/billing/metered-items`);
    expect(listed.data.data).toHaveLength(1);
    expect(listed.data.data[0].id).toBe(itemId);
    expect(listed.data.data[0].status).toBe('active');

    // Pause it
    const paused = await adminApi.patch(`/api/admin/portal/clients/${clientId}/billing/metered-items/${itemId}`, {
      status: 'paused',
    });
    expect(paused.status).toBe(200);
    expect(paused.data.data.status).toBe('paused');

    // Usage GET — dry-run preview should now include zero rows because the
    // only item is paused. liveTotals + history may still be empty.
    const usage = await adminApi.get(`/api/admin/portal/clients/${clientId}/billing/usage`);
    expect(usage.status).toBe(200);
    expect(usage.data.success).toBe(true);
    expect(usage.data.data).toHaveProperty('period');
    expect(usage.data.data).toHaveProperty('liveTotals');
    expect(usage.data.data).toHaveProperty('dryRun');
    expect(usage.data.data).toHaveProperty('history');
    expect(Array.isArray(usage.data.data.dryRun)).toBe(true);
    expect(usage.data.data.dryRun).toHaveLength(0); // paused item is skipped

    // Re-activate, dry-run preview now has one row
    await adminApi.patch(`/api/admin/portal/clients/${clientId}/billing/metered-items/${itemId}`, {
      status: 'active',
    });
    const usageActive = await adminApi.get(`/api/admin/portal/clients/${clientId}/billing/usage`);
    expect(usageActive.data.data.dryRun).toHaveLength(1);
    expect(usageActive.data.data.dryRun[0].resource).toBe('hosting_bandwidth_gb');
    expect(usageActive.data.data.dryRun[0].included).toBe(50);

    // POST usage with default (dry-run) — Stripe NOT touched
    const dryRun = await adminApi.post(`/api/admin/portal/clients/${clientId}/billing/usage`, {});
    expect(dryRun.status).toBe(200);
    expect(dryRun.data.data.dryRun).toBe(true);
    expect(Array.isArray(dryRun.data.data.result)).toBe(true);

    // Delete the item
    const removed = await adminApi.delete(`/api/admin/portal/clients/${clientId}/billing/metered-items/${itemId}`);
    expect(removed.status).toBe(200);
    expect(removed.data.success).toBe(true);

    const afterDelete = await adminApi.get(`/api/admin/portal/clients/${clientId}/billing/metered-items`);
    expect(afterDelete.data.data).toHaveLength(0);
  });

  test('POST metered-items rejects missing required fields', async ({ adminApi }) => {
    const { clientId, cleanup } = await createTestClient(adminApi);
    cleanups.push(cleanup);

    const noResource = await adminApi.post(`/api/admin/portal/clients/${clientId}/billing/metered-items`, {
      unitPriceCents: 5,
      stripeSubscriptionId: 'sub_x',
      stripeSubscriptionItemId: 'si_x',
    });
    expect(noResource.status).toBe(400);

    const noUnit = await adminApi.post(`/api/admin/portal/clients/${clientId}/billing/metered-items`, {
      resource: 'hosting_bandwidth_gb',
      stripeSubscriptionId: 'sub_x',
      stripeSubscriptionItemId: 'si_x',
    });
    expect(noUnit.status).toBe(400);

    const noStripe = await adminApi.post(`/api/admin/portal/clients/${clientId}/billing/metered-items`, {
      resource: 'hosting_bandwidth_gb',
      unitPriceCents: 5,
    });
    expect(noStripe.status).toBe(400);
  });

  test('PATCH metered-items rejects invalid status', async ({ adminApi }) => {
    const { clientId, cleanup } = await createTestClient(adminApi);
    cleanups.push(cleanup);

    const created = await adminApi.post(`/api/admin/portal/clients/${clientId}/billing/metered-items`, {
      resource: 'email_send', unitPriceCents: 1,
      stripeSubscriptionId: `sub_e2e_${Date.now()}`,
      stripeSubscriptionItemId: `si_e2e_${Date.now()}`,
    });
    expect(created.status).toBe(201);
    const itemId = created.data.data.id;

    const bad = await adminApi.patch(`/api/admin/portal/clients/${clientId}/billing/metered-items/${itemId}`, {
      status: 'banana',
    });
    expect(bad.status).toBe(400);
  });

  test('GET billing endpoints reject client (non-admin) role', async ({ clientApi }) => {
    const list = await clientApi.get('/api/admin/portal/clients/1/billing/metered-items');
    expect(list.status).toBe(401);
    const usage = await clientApi.get('/api/admin/portal/clients/1/billing/usage');
    expect(usage.status).toBe(401);
  });

  test('GET billing endpoints reject unauthenticated', async ({ unauthApi }) => {
    const list = await unauthApi.get('/api/admin/portal/clients/1/billing/metered-items');
    expect(list.status).toBe(401);
    const usage = await unauthApi.get('/api/admin/portal/clients/1/billing/usage');
    expect(usage.status).toBe(401);
  });

  test('PATCH/DELETE rejects items belonging to a different client', async ({ adminApi }) => {
    const a = await createTestClient(adminApi);
    cleanups.push(a.cleanup);
    const b = await createTestClient(adminApi);
    cleanups.push(b.cleanup);

    const created = await adminApi.post(`/api/admin/portal/clients/${a.clientId}/billing/metered-items`, {
      resource: 'hosting_invocations', unitPriceCents: 1,
      stripeSubscriptionId: `sub_e2e_${Date.now()}`,
      stripeSubscriptionItemId: `si_e2e_${Date.now()}`,
    });
    expect(created.status).toBe(201);
    const itemId = created.data.data.id;

    // Try to mutate it as if it belonged to client B → 404 tenant guard
    const wrongPatch = await adminApi.patch(`/api/admin/portal/clients/${b.clientId}/billing/metered-items/${itemId}`, {
      status: 'paused',
    });
    expect(wrongPatch.status).toBe(404);

    const wrongDelete = await adminApi.delete(`/api/admin/portal/clients/${b.clientId}/billing/metered-items/${itemId}`);
    expect(wrongDelete.status).toBe(404);
  });
});

// --- Helper ----------------------------------------------------------------

async function createTestClient(api: import('./setup/api-client').ApiClient) {
  const email = `e2e-billing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const res = await api.post('/api/admin/portal/clients', {
    name: 'E2E Billing Client',
    email,
    password: 'testpass123',
    company: `E2E Billing ${Date.now()}`,
  });
  if (!res.data?.success) throw new Error(`Failed to create test client: ${res.data?.message}`);
  const clientId = res.data.data.client.id;
  const userId = res.data.data.user.id;
  const cleanup = async () => {
    await api.delete(`/api/users/${userId}`).catch(() => {});
  };
  return { clientId, userId, cleanup };
}
