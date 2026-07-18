/**
 * Admin billing module-management gap coverage.
 *
 * Finding: admin-billing-module-actions-no-coverage (CRITICAL).
 *   POST /api/admin/portal/clients/[id]/billing implements the six
 *   highest-blast-radius staff billing actions — add-module, remove-module,
 *   set-comp, set-seats, set-bundle, set-byok — each of which grants/revokes
 *   paid-module access, applies comp discounts, overrides seat counts, flips
 *   BYOK eligibility, and triggers recomputeClientSubscription (Stripe sync).
 *   The route is staff-only via requireStaffSession (role ∈ {admin, employee}
 *   → else 401). Before this spec, GET + all six POST actions had ZERO test
 *   coverage, so a regression that dropped the guard would ship silently.
 *
 * This spec locks the contract so the hole cannot reopen:
 *   - GUARD (the regression core): unauthenticated AND client-role callers
 *     get 401 on GET and on every one of the six POST actions.
 *   - HAPPY PATH (admin, with verified DB side-effects via the GET read-model):
 *       set-comp / set-seats / set-byok mutate the `clients` row and the
 *       change is reflected back through GET. These three need no seeded SKU.
 *   - VALIDATION: out-of-range / unknown-slug / missing-id inputs are rejected
 *     with 400/404 (proving the admin reaches the handler — never 401).
 *   - MODULE SKU actions (add-module / set-bundle): asserted reachable by the
 *     admin (never 401). When the per-domain module SKUs are seeded they return
 *     200 and the module/bundle appears in GET (and is cleaned up); the e2e seed
 *     (scripts/seed-admin-e2e.ts) does NOT seed the `module-*` catalog, so a
 *     404 "…not found" is the legitimate env-dependent outcome and is tolerated
 *     — but a 401 there would be a real guard regression and fails the test.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups } from './setup/helpers';
import type { ApiClient } from './setup/api-client';

const ACTIONS = [
  { action: 'set-comp', percent: 10 },
  { action: 'set-seats', override: 5 },
  { action: 'set-byok', override: true },
  { action: 'add-module', slug: 'module-crm' },
  { action: 'remove-module', clientServiceId: 1 },
  { action: 'set-bundle' },
] as const;

async function createTestClient(api: ApiClient) {
  const email = `e2e-billing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const res = await api.post('/api/admin/portal/clients', {
    name: 'E2E Billing Client',
    email,
    password: 'testpass123',
    company: `E2E Billing Corp ${Date.now()}`,
  });
  if (!res.data?.success) throw new Error(`Failed to create test client: ${res.data?.message}`);
  const clientId = res.data.data.client.id as number;
  const userId = res.data.data.user.id as number;
  const cleanup = async () => {
    await api.delete(`/api/users/${userId}`).catch(() => {});
  };
  return { clientId, cleanup };
}

test.describe('Admin billing module management — staff guard @gap @admin @billing', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('GET billing read-model rejects unauthenticated (401)', async ({ unauthApi }) => {
    // Guard runs before the client lookup, so any id is fine.
    const res = await unauthApi.get('/api/admin/portal/clients/1/billing');
    expect(res.status).toBe(401);
  });

  test('GET billing read-model rejects client role (401)', async ({ clientApi }) => {
    const res = await clientApi.get('/api/admin/portal/clients/1/billing');
    expect(res.status).toBe(401);
  });

  for (const payload of ACTIONS) {
    test(`POST ${payload.action} rejects unauthenticated (401)`, async ({ unauthApi }) => {
      const res = await unauthApi.post('/api/admin/portal/clients/1/billing', { ...payload });
      expect(res.status).toBe(401);
    });

    test(`POST ${payload.action} rejects client role (401)`, async ({ clientApi }) => {
      const res = await clientApi.post('/api/admin/portal/clients/1/billing', { ...payload });
      expect(res.status).toBe(401);
    });
  }
});

test.describe('Admin billing module management — admin happy path & side-effects @gap @admin @billing', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('GET returns the billing read-model for a real client (200)', async ({ adminApi }) => {
    const { clientId, cleanup } = await createTestClient(adminApi);
    cleanups.push(cleanup);

    const res = await adminApi.get(`/api/admin/portal/clients/${clientId}/billing`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toHaveProperty('seats');
    expect(res.data.data).toHaveProperty('grossMrrCents');
    expect(res.data.data).toHaveProperty('netMrrCents');
  });

  test('GET returns 404 for a non-existent client', async ({ adminApi }) => {
    const res = await adminApi.get('/api/admin/portal/clients/99999999/billing');
    expect(res.status).toBe(404);
  });

  test('set-comp mutates compDiscountPercent and is reflected in GET (200)', async ({ adminApi }) => {
    const { clientId, cleanup } = await createTestClient(adminApi);
    cleanups.push(cleanup);
    const base = `/api/admin/portal/clients/${clientId}/billing`;

    const set = await adminApi.post(base, { action: 'set-comp', percent: 25 });
    expect(set.status).toBe(200);
    expect(set.data.success).toBe(true);

    const after = await adminApi.get(base);
    expect(after.status).toBe(200);
    expect(after.data.data.compDiscountPercent).toBe(25);

    // Clear it back to null and confirm the writer accepts null.
    const clear = await adminApi.post(base, { action: 'set-comp', percent: null });
    expect(clear.status).toBe(200);
    const cleared = await adminApi.get(base);
    expect(cleared.data.data.compDiscountPercent).toBeNull();
  });

  test('set-comp rejects out-of-range percent (400)', async ({ adminApi }) => {
    const { clientId, cleanup } = await createTestClient(adminApi);
    cleanups.push(cleanup);
    const res = await adminApi.post(`/api/admin/portal/clients/${clientId}/billing`, {
      action: 'set-comp',
      percent: 150,
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('set-seats mutates billableSeatsOverride and is reflected in GET (200)', async ({ adminApi }) => {
    const { clientId, cleanup } = await createTestClient(adminApi);
    cleanups.push(cleanup);
    const base = `/api/admin/portal/clients/${clientId}/billing`;

    const set = await adminApi.post(base, { action: 'set-seats', override: 7 });
    expect(set.status).toBe(200);
    expect(set.data.success).toBe(true);

    const after = await adminApi.get(base);
    expect(after.status).toBe(200);
    expect(after.data.data.seats.override).toBe(7);
    expect(after.data.data.seats.effective).toBe(7);

    const clear = await adminApi.post(base, { action: 'set-seats', override: null });
    expect(clear.status).toBe(200);
    const cleared = await adminApi.get(base);
    expect(cleared.data.data.seats.override).toBeNull();
  });

  test('set-seats rejects a negative override (400)', async ({ adminApi }) => {
    const { clientId, cleanup } = await createTestClient(adminApi);
    cleanups.push(cleanup);
    const res = await adminApi.post(`/api/admin/portal/clients/${clientId}/billing`, {
      action: 'set-seats',
      override: -1,
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('set-byok mutates byokEligibleOverride and is reflected in GET (200)', async ({ adminApi }) => {
    const { clientId, cleanup } = await createTestClient(adminApi);
    cleanups.push(cleanup);
    const base = `/api/admin/portal/clients/${clientId}/billing`;

    const set = await adminApi.post(base, { action: 'set-byok', override: true });
    expect(set.status).toBe(200);
    expect(set.data.success).toBe(true);

    const after = await adminApi.get(base);
    expect(after.status).toBe(200);
    expect(after.data.data.byokEligibleOverride).toBe(true);

    const clear = await adminApi.post(base, { action: 'set-byok', override: null });
    expect(clear.status).toBe(200);
    const cleared = await adminApi.get(base);
    expect(cleared.data.data.byokEligibleOverride).toBeNull();
  });

  test('set-byok rejects a non-boolean override (400)', async ({ adminApi }) => {
    const { clientId, cleanup } = await createTestClient(adminApi);
    cleanups.push(cleanup);
    const res = await adminApi.post(`/api/admin/portal/clients/${clientId}/billing`, {
      action: 'set-byok',
      override: 'yes',
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('add-module rejects an unknown slug (400)', async ({ adminApi }) => {
    const { clientId, cleanup } = await createTestClient(adminApi);
    cleanups.push(cleanup);
    const res = await adminApi.post(`/api/admin/portal/clients/${clientId}/billing`, {
      action: 'add-module',
      slug: 'not-a-real-module',
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('add-module is reachable by admin and grants the module when the SKU is seeded', async ({ adminApi }) => {
    const { clientId, cleanup } = await createTestClient(adminApi);
    cleanups.push(cleanup);
    const base = `/api/admin/portal/clients/${clientId}/billing`;

    const res = await adminApi.post(base, { action: 'add-module', slug: 'module-crm' });
    // The admin is authorized — a guard regression would surface here as 401.
    expect(res.status).not.toBe(401);
    // 200 when the module-* catalog is seeded; 404 ("Module not found") in the
    // default e2e env which seeds only legacy SKUs.
    expect([200, 404]).toContain(res.status);

    if (res.status === 200) {
      const after = await adminApi.get(base);
      const slugs = (after.data.data.modules as Array<{ slug: string }>).map((m) => m.slug);
      expect(slugs).toContain('module-crm');
      const csId = (after.data.data.modules as Array<{ slug: string; clientServiceId: number }>)
        .find((m) => m.slug === 'module-crm')!.clientServiceId;
      const removed = await adminApi.post(base, { action: 'remove-module', clientServiceId: csId });
      expect(removed.status).toBe(200);
    }
  });

  test('remove-module rejects a missing clientServiceId (400)', async ({ adminApi }) => {
    const { clientId, cleanup } = await createTestClient(adminApi);
    cleanups.push(cleanup);
    const res = await adminApi.post(`/api/admin/portal/clients/${clientId}/billing`, {
      action: 'remove-module',
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('remove-module returns 404 for a clientServiceId not owned by the client', async ({ adminApi }) => {
    const { clientId, cleanup } = await createTestClient(adminApi);
    cleanups.push(cleanup);
    const res = await adminApi.post(`/api/admin/portal/clients/${clientId}/billing`, {
      action: 'remove-module',
      clientServiceId: 99999999,
    });
    expect(res.status).toBe(404);
    expect(res.data.success).toBe(false);
  });

  test('set-bundle is reachable by admin and swaps to the bundle when the SKU is seeded', async ({ adminApi }) => {
    const { clientId, cleanup } = await createTestClient(adminApi);
    cleanups.push(cleanup);
    const base = `/api/admin/portal/clients/${clientId}/billing`;

    const res = await adminApi.post(base, { action: 'set-bundle' });
    expect(res.status).not.toBe(401);
    // 200 when BUNDLE_SLUG is seeded; 404 ("Bundle SKU not found") otherwise.
    expect([200, 404]).toContain(res.status);

    if (res.status === 200) {
      const after = await adminApi.get(base);
      expect(after.data.data.bundle).not.toBeNull();
    }
  });

  test('unknown action is rejected (400)', async ({ adminApi }) => {
    const { clientId, cleanup } = await createTestClient(adminApi);
    cleanups.push(cleanup);
    const res = await adminApi.post(`/api/admin/portal/clients/${clientId}/billing`, {
      action: 'definitely-not-an-action',
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });
});
