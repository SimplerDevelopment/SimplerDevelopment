/**
 * Admin Subscriptions API E2E Tests
 *
 * Tests for /api/admin/portal/subscriptions
 * Returns all client service subscriptions with joined data.
 */
import { test, expect } from './setup/fixtures';

test.describe('Admin Subscriptions @admin @subscriptions', () => {
  test('GET /subscriptions returns 200 with array', async ({ adminApi }) => {
    const res = await adminApi.get('/api/admin/portal/subscriptions');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('each subscription item has expected fields', async ({ adminApi }) => {
    const res = await adminApi.get('/api/admin/portal/subscriptions');
    expect(res.status).toBe(200);

    if (res.data.data.length > 0) {
      const item = res.data.data[0];
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('serviceName');
      expect(item).toHaveProperty('clientName');
      expect(item).toHaveProperty('status');
      expect(item).toHaveProperty('price');
      expect(item).toHaveProperty('billingCycle');
      expect(item).toHaveProperty('company');
      expect(item).toHaveProperty('serviceCategory');
      expect(item).toHaveProperty('renewalDate');
      expect(item).toHaveProperty('createdAt');
    }
  });

  test('rejects client role (401)', async ({ clientApi }) => {
    const res = await clientApi.get('/api/admin/portal/subscriptions');
    expect(res.status).toBe(401);
  });

  test('rejects unauthenticated (401)', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/admin/portal/subscriptions');
    expect(res.status).toBe(401);
  });
});
