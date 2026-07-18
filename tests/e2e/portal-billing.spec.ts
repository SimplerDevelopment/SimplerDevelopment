/**
 * Portal Billing / Payment Methods API E2E Tests
 *
 * Tests for /api/portal/billing/payment-methods
 */
import { test, expect } from './setup/fixtures';

test.describe('Portal Billing — Payment Methods @billing @critical', () => {
  test('GET /billing/payment-methods lists saved methods', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/billing/payment-methods');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('DELETE /billing/payment-methods rejects missing id', async ({ clientApi }) => {
    const res = await clientApi.delete('/api/portal/billing/payment-methods');
    // DELETE without an id should fail
    expect([400, 405]).toContain(res.status);
  });

  test('DELETE /billing/payment-methods rejects non-existent method', async ({ clientApi }) => {
    // Send id in body — the API reads id from request body
    const res = await clientApi.post('/api/portal/billing/payment-methods', {
      _method: 'DELETE',
      id: 'pm_nonexistent_999999',
    });
    // Should return 404 or 400
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test('GET /billing/payment-methods rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/billing/payment-methods');
    expect(res.status).toBe(401);
  });
});
