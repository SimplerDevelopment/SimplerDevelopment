/**
 * Portal Settings Extras API E2E Tests
 *
 * Covers /api/portal/settings/billing — the only settings sub-route not
 * already exercised by portal-settings (profile, team) suites. Read-only
 * (GET): returns recent invoices, active services, and stripeCustomerId.
 */
import { test, expect } from './setup/fixtures';

test.describe('Portal Settings — Billing @settings @billing', () => {
  test('GET /settings/billing returns invoices, services, and stripe id', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/settings/billing');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toHaveProperty('invoices');
    expect(res.data.data).toHaveProperty('services');
    expect(res.data.data).toHaveProperty('stripeCustomerId');
    expect(Array.isArray(res.data.data.invoices)).toBe(true);
    expect(Array.isArray(res.data.data.services)).toBe(true);
    // Recent invoices are limited to 10 by the handler
    expect(res.data.data.invoices.length).toBeLessThanOrEqual(10);
  });

  test('GET /settings/billing rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/settings/billing');
    expect(res.status).toBe(401);
  });
});
