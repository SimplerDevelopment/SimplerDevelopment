/**
 * Billing Stripe E2E Coverage — unit 20, cards 8-11
 *
 * Cards (0-based indices 8-11 from the Billing Stripe "To Test" backlog):
 *   8. GET  /api/admin/portal/subscriptions — admin can list all client subscriptions
 *   9. POST /api/admin/portal/subscriptions — admin can create a client subscription
 *  10. POST /api/admin/portal/subscriptions/[id]/cancel — returns 409 when no Stripe subscription linked
 *  11. GET  /api/admin/portal/subscriptions/[id]/invoices — admin can list invoices for a subscription
 *
 * Routes examined:
 *   app/api/admin/portal/subscriptions/route.ts
 *   app/api/admin/portal/subscriptions/[id]/cancel/route.ts
 *   app/api/admin/portal/subscriptions/[id]/invoices/route.ts
 */
import { test, expect } from './setup/fixtures';

// ── Card 8: GET /api/admin/portal/subscriptions ──────────────────────────────

test.describe('Admin Subscriptions — list @billing @admin-subscriptions', () => {
  test('GET /subscriptions returns array with subscription fields @critical', async ({ adminApi }) => {
    const res = await adminApi.get('/api/admin/portal/subscriptions');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
    // At least the seeded subscription should exist
    const first = res.data.data[0] as {
      id: number;
      clientName: string | null;
      company: string | null;
      serviceName: string;
      status: string;
    };
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('serviceName');
    expect(first).toHaveProperty('status');
  });

  test('GET /subscriptions rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/admin/portal/subscriptions');
    expect(res.status).toBe(401);
  });

  test('GET /subscriptions rejects client user', async ({ clientApi }) => {
    const res = await clientApi.get('/api/admin/portal/subscriptions');
    expect(res.status).toBe(401);
  });
});

// ── Card 9: POST /api/admin/portal/subscriptions ─────────────────────────────

test.describe('Admin Subscriptions — create @billing @admin-subscriptions', () => {
  // Seeded: clientId=1 (client@example.com), serviceId=1 (Monthly Maintenance)
  const CLIENT_ID = 1;
  const SERVICE_ID = 1;

  let createdSubId: number | null = null;

  test.afterAll(async ({ adminApi }) => {
    // Clean up: cancel (soft-delete) the created subscription row directly.
    // The cancel endpoint requires a Stripe subscription, so we just verify
    // the row exists and is no longer needed — we can't hard-delete it via
    // the API, so leave it (it's a test DB row).
    void adminApi; // satisfy linter — cleanup is best-effort
    createdSubId = null;
  });

  test('POST /subscriptions creates a new subscription row @critical', async ({ adminApi }) => {
    const res = await adminApi.post('/api/admin/portal/subscriptions', {
      clientId: CLIENT_ID,
      serviceId: SERVICE_ID,
    });
    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toHaveProperty('id');
    expect(res.data.data.clientId).toBe(CLIENT_ID);
    expect(res.data.data.serviceId).toBe(SERVICE_ID);
    expect(res.data.data.status).toBe('active');
    createdSubId = res.data.data.id as number;
  });

  test('POST /subscriptions rejects missing clientId', async ({ adminApi }) => {
    const res = await adminApi.post('/api/admin/portal/subscriptions', {
      serviceId: SERVICE_ID,
    });
    expect(res.status).toBe(400);
  });

  test('POST /subscriptions rejects missing serviceId', async ({ adminApi }) => {
    const res = await adminApi.post('/api/admin/portal/subscriptions', {
      clientId: CLIENT_ID,
    });
    expect(res.status).toBe(400);
  });

  test('POST /subscriptions rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/admin/portal/subscriptions', {
      clientId: CLIENT_ID,
      serviceId: SERVICE_ID,
    });
    expect(res.status).toBe(401);
  });

  test('POST /subscriptions rejects client user', async ({ clientApi }) => {
    const res = await clientApi.post('/api/admin/portal/subscriptions', {
      clientId: CLIENT_ID,
      serviceId: SERVICE_ID,
    });
    expect(res.status).toBe(401);
  });
});

// ── Card 10: POST /api/admin/portal/subscriptions/[id]/cancel ────────────────

test.describe('Admin Subscriptions — cancel @billing @admin-subscriptions', () => {
  // Use an existing seeded subscription (id=1, no Stripe subscription linked)
  // Expect 409 because no stripeSubscriptionId is stored on this row.
  const SEEDED_SUB_ID = 1;

  test('POST /subscriptions/[id]/cancel returns 409 when no Stripe subscription is linked', async ({ adminApi }) => {
    const res = await adminApi.post(`/api/admin/portal/subscriptions/${SEEDED_SUB_ID}/cancel`, {});
    // The seeded row has no stripeSubscriptionId → 409 Conflict
    expect(res.status).toBe(409);
    expect(res.data.success).toBe(false);
  });

  test('POST /subscriptions/[id]/cancel returns 404 for non-existent subscription', async ({ adminApi }) => {
    const res = await adminApi.post('/api/admin/portal/subscriptions/999999/cancel', {});
    expect(res.status).toBe(404);
  });

  test('POST /subscriptions/[id]/cancel rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post(`/api/admin/portal/subscriptions/${SEEDED_SUB_ID}/cancel`, {});
    expect(res.status).toBe(401);
  });

  test('POST /subscriptions/[id]/cancel rejects client user', async ({ clientApi }) => {
    const res = await clientApi.post(`/api/admin/portal/subscriptions/${SEEDED_SUB_ID}/cancel`, {});
    expect(res.status).toBe(401);
  });
});

// ── Card 11: GET /api/admin/portal/subscriptions/[id]/invoices ───────────────

test.describe('Admin Subscriptions — invoices list @billing @admin-subscriptions', () => {
  // Use an existing seeded subscription (id=1, clientId=1 which has invoices seeded)
  const SEEDED_SUB_ID = 1;

  test('GET /subscriptions/[id]/invoices returns array @critical', async ({ adminApi }) => {
    const res = await adminApi.get(`/api/admin/portal/subscriptions/${SEEDED_SUB_ID}/invoices`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
    // Each row has invoice fields
    for (const inv of res.data.data as Array<{
      id: number;
      number: string;
      status: string;
      total: number;
    }>) {
      expect(inv).toHaveProperty('id');
      expect(inv).toHaveProperty('number');
      expect(inv).toHaveProperty('status');
      expect(inv).toHaveProperty('total');
    }
  });

  test('GET /subscriptions/[id]/invoices returns 404 for non-existent subscription', async ({ adminApi }) => {
    const res = await adminApi.get('/api/admin/portal/subscriptions/999999/invoices');
    expect(res.status).toBe(404);
  });

  test('GET /subscriptions/[id]/invoices rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get(`/api/admin/portal/subscriptions/${SEEDED_SUB_ID}/invoices`);
    expect(res.status).toBe(401);
  });

  test('GET /subscriptions/[id]/invoices rejects client user', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/admin/portal/subscriptions/${SEEDED_SUB_ID}/invoices`);
    expect(res.status).toBe(401);
  });
});
