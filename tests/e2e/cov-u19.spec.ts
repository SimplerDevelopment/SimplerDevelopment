/**
 * cov-u19.spec.ts — Billing Stripe E2E coverage (unit 19)
 *
 * Cards covered (indices 4–7 from the "## To Test" backlog in
 * vault/05 - Feature Specs/E2E Audit/Billing Stripe E2E Audit.md):
 *
 *   4. POST /api/admin/portal/subscriptions/:id/refund — validates invoiceId required
 *      and 404 on unknown subscription
 *   5. GET /api/admin/portal/clients/:id/billing/usage — returns liveTotals, dryRun, history
 *   6. GET /api/admin/portal/clients/:id/billing/metered-items — lists metered items
 *   7. PATCH /api/admin/portal/clients/:id/billing/metered-items/:itemId — updates metered item
 */
import { test, expect } from './setup/fixtures';

// ── Shared helper ─────────────────────────────────────────────────────────────

/** Create a fresh test client and return its id + cleanup fn. */
async function createTestClient(adminApi: import('./setup/api-client').ApiClient) {
  const ts = Date.now();
  const res = await adminApi.post('/api/admin/portal/clients', {
    name: `BillingTest ${ts}`,
    email: `billing-cov-${ts}@example.com`,
    password: 'testpass123',
    company: `BillingCorp ${ts}`,
  });
  if (!res.data?.success) throw new Error(`createTestClient failed: ${res.data?.message}`);
  const clientId = res.data.data.client.id as number;
  const userId = res.data.data.user.id as number;
  const cleanup = async () => {
    await adminApi.delete(`/api/users/${userId}`).catch(() => {});
  };
  return { clientId, userId, cleanup };
}

// ── Card 4: POST /api/admin/portal/subscriptions/:id/refund ──────────────────

test.describe('Admin Billing — Subscription Refund @billing @admin', () => {
  test('POST /subscriptions/:id/refund rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/admin/portal/subscriptions/1/refund', {
      invoiceId: 1,
    });
    expect(res.status).toBe(401);
  });

  test('POST /subscriptions/:id/refund rejects client-role user', async ({ clientApi }) => {
    const res = await clientApi.post('/api/admin/portal/subscriptions/1/refund', {
      invoiceId: 1,
    });
    expect(res.status).toBe(401);
  });

  test('POST /subscriptions/:id/refund returns 404 for unknown subscription id', async ({
    adminApi,
  }) => {
    const res = await adminApi.post('/api/admin/portal/subscriptions/999999/refund', {
      invoiceId: 1,
    });
    expect(res.status).toBe(404);
  });

  test('POST /subscriptions/:id/refund returns 400 when invoiceId is missing', async ({
    adminApi,
  }) => {
    // We need a real subscription id to get past the 404 gate.
    // Fetch the subscription list and pick the first — skip if none.
    const list = await adminApi.get('/api/admin/portal/subscriptions');
    const subs = list.data?.data ?? [];
    if (!Array.isArray(subs) || subs.length === 0) {
      test.skip();
      return;
    }
    const subId = (subs[0] as { id: number }).id;

    const res = await adminApi.post(`/api/admin/portal/subscriptions/${subId}/refund`, {});
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });
});

// ── Card 5: GET /api/admin/portal/clients/:id/billing/usage ──────────────────

test.describe('Admin Billing — Client Usage @billing @admin', () => {
  let clientId: number;
  let cleanup: () => Promise<void>;

  test.beforeAll(async ({ adminApi }) => {
    const result = await createTestClient(adminApi);
    clientId = result.clientId;
    cleanup = result.cleanup;
  });

  test.afterAll(async () => {
    await cleanup?.();
  });

  test('GET /billing/usage returns liveTotals, dryRun, history @critical', async ({
    adminApi,
  }) => {
    const res = await adminApi.get(
      `/api/admin/portal/clients/${clientId}/billing/usage`,
    );
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    const d = res.data.data;
    expect(Array.isArray(d.liveTotals)).toBe(true);
    expect(d).toHaveProperty('dryRun');
    expect(Array.isArray(d.history)).toBe(true);
  });

  test('GET /billing/usage?period=YYYY-MM honors period param', async ({ adminApi }) => {
    const res = await adminApi.get(
      `/api/admin/portal/clients/${clientId}/billing/usage?period=2026-01`,
    );
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });

  test('GET /billing/usage rejects invalid period format', async ({ adminApi }) => {
    const res = await adminApi.get(
      `/api/admin/portal/clients/${clientId}/billing/usage?period=notaperiod`,
    );
    expect(res.status).toBe(400);
  });

  test('GET /billing/usage rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get(`/api/admin/portal/clients/1/billing/usage`);
    expect(res.status).toBe(401);
  });

  test('GET /billing/usage rejects client-role user', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/admin/portal/clients/1/billing/usage`);
    expect(res.status).toBe(401);
  });
});

// ── Card 6: GET /api/admin/portal/clients/:id/billing/metered-items ──────────

test.describe('Admin Billing — Metered Items List @billing @admin', () => {
  let clientId: number;
  let cleanup: () => Promise<void>;

  test.beforeAll(async ({ adminApi }) => {
    const result = await createTestClient(adminApi);
    clientId = result.clientId;
    cleanup = result.cleanup;
  });

  test.afterAll(async () => {
    await cleanup?.();
  });

  test('GET /billing/metered-items returns an array @critical', async ({ adminApi }) => {
    const res = await adminApi.get(
      `/api/admin/portal/clients/${clientId}/billing/metered-items`,
    );
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
    // New client has no metered items — array is empty.
    expect(res.data.data.length).toBe(0);
  });

  test('GET /billing/metered-items rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get(
      `/api/admin/portal/clients/1/billing/metered-items`,
    );
    expect(res.status).toBe(401);
  });

  test('GET /billing/metered-items rejects client-role user', async ({ clientApi }) => {
    const res = await clientApi.get(
      `/api/admin/portal/clients/1/billing/metered-items`,
    );
    expect(res.status).toBe(401);
  });

  test('POST /billing/metered-items returns 400 for missing required fields', async ({
    adminApi,
  }) => {
    // No resource or unitPriceCents — should fail validation before hitting Stripe.
    const res = await adminApi.post(
      `/api/admin/portal/clients/${clientId}/billing/metered-items`,
      {},
    );
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('POST /billing/metered-items returns 400 when Stripe IDs are missing', async ({
    adminApi,
  }) => {
    // resource + unitPriceCents present but no Stripe IDs at all.
    const res = await adminApi.post(
      `/api/admin/portal/clients/${clientId}/billing/metered-items`,
      {
        resource: 'ai_tokens',
        unitPriceCents: 1,
      },
    );
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });
});

// ── Card 7: PATCH /api/admin/portal/clients/:id/billing/metered-items/:itemId ─

test.describe('Admin Billing — Metered Item PATCH @billing @admin', () => {
  let clientId: number;
  let itemId: number;
  let cleanup: () => Promise<void>;

  test.beforeAll(async ({ adminApi }) => {
    const result = await createTestClient(adminApi);
    clientId = result.clientId;
    cleanup = result.cleanup;

    // Create a metered item via the escape-hatch path (stripeSubscriptionItemId provided
    // directly so no Stripe API call is needed).
    const ts = Date.now();
    const createRes = await adminApi.post(
      `/api/admin/portal/clients/${clientId}/billing/metered-items`,
      {
        resource: `ai_tokens_${ts}`,
        unitPriceCents: 10,
        includedQuantity: 100,
        stripeSubscriptionId: `sub_test_${ts}`,
        stripeSubscriptionItemId: `si_test_${ts}`,
      },
    );
    if (createRes.status === 201 && createRes.data?.success) {
      itemId = createRes.data.data.id as number;
    }
  });

  test.afterAll(async () => {
    await cleanup?.();
  });

  test('PATCH /metered-items/:itemId updates unitPriceCents @critical', async ({ adminApi }) => {
    if (!itemId) {
      test.skip();
      return;
    }
    const res = await adminApi.patch(
      `/api/admin/portal/clients/${clientId}/billing/metered-items/${itemId}`,
      { unitPriceCents: 20 },
    );
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.unitPriceCents).toBe(20);
  });

  test('PATCH /metered-items/:itemId updates includedQuantity', async ({ adminApi }) => {
    if (!itemId) {
      test.skip();
      return;
    }
    const res = await adminApi.patch(
      `/api/admin/portal/clients/${clientId}/billing/metered-items/${itemId}`,
      { includedQuantity: 500 },
    );
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    // DB numeric column may return as string ("500.0000") or number — coerce to compare
    expect(Number(res.data.data.includedQuantity)).toBe(500);
  });

  test('PATCH /metered-items/:itemId rejects invalid status value', async ({ adminApi }) => {
    if (!itemId) {
      test.skip();
      return;
    }
    const res = await adminApi.patch(
      `/api/admin/portal/clients/${clientId}/billing/metered-items/${itemId}`,
      { status: 'bogus' },
    );
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('PATCH /metered-items/:itemId accepts valid status transition to paused', async ({
    adminApi,
  }) => {
    if (!itemId) {
      test.skip();
      return;
    }
    const res = await adminApi.patch(
      `/api/admin/portal/clients/${clientId}/billing/metered-items/${itemId}`,
      { status: 'paused' },
    );
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.status).toBe('paused');
  });

  test('PATCH /metered-items/:itemId returns 404 for wrong clientId', async ({ adminApi }) => {
    if (!itemId) {
      test.skip();
      return;
    }
    // itemId belongs to clientId, not client 999999
    const res = await adminApi.patch(
      `/api/admin/portal/clients/999999/billing/metered-items/${itemId}`,
      { unitPriceCents: 99 },
    );
    expect(res.status).toBe(404);
  });

  test('PATCH /metered-items/:itemId rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.patch(
      `/api/admin/portal/clients/1/billing/metered-items/1`,
      { unitPriceCents: 5 },
    );
    expect(res.status).toBe(401);
  });
});
