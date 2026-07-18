/**
 * Portal Gift Certificates API E2E Tests
 *
 * Tests for /api/portal/tools/gift-certificates (list/create) and
 * /api/portal/tools/gift-certificates/[id] (read/update — there is no DELETE).
 *
 * The endpoints are service-gated via authorizePortal({ requireService: 'booking' }),
 * so the suite mirrors portal-email-segments.spec.ts: a service-gate describe
 * that handles both subscribed and unsubscribed clients, and a CRUD describe
 * that test.skip's when access is unavailable.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups } from './setup/helpers';

test.describe('Portal Gift Certificates — Service Gate @gift-certificates @tools', () => {
  test('GET /tools/gift-certificates returns 200 or 403 with upsell info', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/tools/gift-certificates');
    if (res.status === 403) {
      expect(res.data.success).toBe(false);
      expect(res.data).toHaveProperty('requiresService', 'booking');
      expect(res.data).toHaveProperty('upsellUrl');
    } else {
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(Array.isArray(res.data.data)).toBe(true);
    }
  });

  test('GET /tools/gift-certificates rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/tools/gift-certificates');
    expect(res.status).toBe(401);
  });

  test('POST /tools/gift-certificates rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/tools/gift-certificates', { amount: 5000 });
    expect(res.status).toBe(401);
  });

  test('GET /tools/gift-certificates/:id rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/tools/gift-certificates/999999');
    expect(res.status).toBe(401);
  });

  test('PUT /tools/gift-certificates/:id rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.put('/api/portal/tools/gift-certificates/999999', {
      status: 'void',
    });
    expect(res.status).toBe(401);
  });
});

test.describe('Portal Gift Certificates — CRUD @gift-certificates @tools', () => {
  let cleanups: Array<() => Promise<void>> = [];
  let hasAccess = false;

  test.beforeAll(async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/tools/gift-certificates');
    hasAccess = res.status === 200;
  });

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('POST creates a gift certificate', async ({ clientApi }) => {
    test.skip(!hasAccess, 'No booking subscription');
    const ts = Date.now();
    const res = await clientApi.post('/api/portal/tools/gift-certificates', {
      amount: 5000,
      purchaserName: `Test Purchaser ${ts}`,
      purchaserEmail: `purchaser-${ts}@example.com`,
      recipientName: 'Recipient',
      recipientEmail: `recipient-${ts}@example.com`,
      personalMessage: 'Happy birthday!',
      redeemableAt: 'both',
    });
    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data.id).toBeTruthy();
    expect(res.data.data.initialAmount).toBe(5000);
    expect(res.data.data.remainingAmount).toBe(5000);
    expect(res.data.data.status).toBe('active');
    expect(res.data.data.code).toMatch(/^CERT-/);
  });

  test('POST rejects missing amount', async ({ clientApi }) => {
    test.skip(!hasAccess, 'No booking subscription');
    const res = await clientApi.post('/api/portal/tools/gift-certificates', {
      purchaserEmail: 'p@example.com',
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('POST rejects amount below minimum (100 cents)', async ({ clientApi }) => {
    test.skip(!hasAccess, 'No booking subscription');
    const res = await clientApi.post('/api/portal/tools/gift-certificates', {
      amount: 50,
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
    expect(res.data.message).toContain('Minimum');
  });

  test('GET lists gift certificates', async ({ clientApi }) => {
    test.skip(!hasAccess, 'No booking subscription');
    // Seed one so the list isn't necessarily empty
    const create = await clientApi.post('/api/portal/tools/gift-certificates', {
      amount: 2500,
      purchaserEmail: `seed-${Date.now()}@example.com`,
    });
    expect(create.status).toBe(201);

    const res = await clientApi.get('/api/portal/tools/gift-certificates');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
    expect(res.data.data.some((c: { id: number }) => c.id === create.data.data.id)).toBe(true);
  });

  test('GET /:id returns certificate with redemption history', async ({ clientApi }) => {
    test.skip(!hasAccess, 'No booking subscription');
    const create = await clientApi.post('/api/portal/tools/gift-certificates', {
      amount: 7500,
      purchaserEmail: `g-${Date.now()}@example.com`,
    });
    expect(create.status).toBe(201);
    const id = create.data.data.id;

    const res = await clientApi.get(`/api/portal/tools/gift-certificates/${id}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.id).toBe(id);
    expect(res.data.data.initialAmount).toBe(7500);
    expect(Array.isArray(res.data.data.redemptions)).toBe(true);
  });

  test('GET /:id returns 404 for unknown id', async ({ clientApi }) => {
    test.skip(!hasAccess, 'No booking subscription');
    const res = await clientApi.get('/api/portal/tools/gift-certificates/999999');
    expect(res.status).toBe(404);
  });

  test('PUT /:id updates editable fields', async ({ clientApi }) => {
    test.skip(!hasAccess, 'No booking subscription');
    const create = await clientApi.post('/api/portal/tools/gift-certificates', {
      amount: 3000,
      purchaserEmail: `u-${Date.now()}@example.com`,
    });
    expect(create.status).toBe(201);
    const id = create.data.data.id;

    const res = await clientApi.put(`/api/portal/tools/gift-certificates/${id}`, {
      status: 'void',
      recipientName: 'Updated Recipient',
      personalMessage: 'Updated message',
      redeemableAt: 'online',
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.id).toBe(id);
    expect(res.data.data.status).toBe('void');
    expect(res.data.data.recipientName).toBe('Updated Recipient');
    expect(res.data.data.personalMessage).toBe('Updated message');
    expect(res.data.data.redeemableAt).toBe('online');
  });

  test('PUT /:id returns 404 for unknown id', async ({ clientApi }) => {
    test.skip(!hasAccess, 'No booking subscription');
    const res = await clientApi.put('/api/portal/tools/gift-certificates/999999', {
      status: 'void',
    });
    expect(res.status).toBe(404);
  });
});
