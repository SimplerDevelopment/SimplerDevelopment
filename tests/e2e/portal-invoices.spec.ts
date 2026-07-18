/**
 * Portal Invoices API E2E Tests
 *
 * Tests for /api/portal/invoices
 * Note: Stripe checkout tests are limited since they require a real Stripe key.
 * We validate the authorization and status-gating logic.
 */
import { test, expect } from './setup/fixtures';

test.describe('Portal Invoices @invoices @critical', () => {
  test('POST /invoices/:id/checkout rejects non-existent invoice', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/invoices/999999/checkout');
    expect(res.status).toBe(404);
  });

  test('POST /invoices/:id/checkout rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/invoices/1/checkout');
    expect(res.status).toBe(401);
  });
});
