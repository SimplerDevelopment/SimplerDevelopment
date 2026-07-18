/**
 * Portal Hosting API E2E Tests
 *
 * Tests for /api/portal/hosting
 */
import { test, expect } from './setup/fixtures';

test.describe('Portal Hosting @hosting', () => {
  test('GET /hosting returns 200 (subscribed) or 403 (service-gated upsell)', async ({ clientApi }) => {
    // The hosted-sites route requires an active hosting subscription.
    // The seeded test client may or may not have that service, so both
    // shapes are valid. The consolidated mutation spec (portal-automations-
    // services-hosting-mutations.spec.ts) exercises the 403 path explicitly.
    const res = await clientApi.get('/api/portal/hosting');
    expect([200, 403]).toContain(res.status);
    if (res.status === 200) {
      expect(res.data.success).toBe(true);
      expect(Array.isArray(res.data.data)).toBe(true);
    } else {
      expect(res.data.requiresService).toBe('hosting');
    }
  });

  test('GET /hosting rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/hosting');
    expect(res.status).toBe(401);
  });

  test('GET /hosting/:id returns 404 or 403 for non-existent/gated site', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/hosting/999999');
    // 404 if hosting service is active (site not found), 403 if not subscribed
    expect([404, 403]).toContain(res.status);
  });
});
