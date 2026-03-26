/**
 * Portal Hosting API E2E Tests
 *
 * Tests for /api/portal/hosting
 */
import { test, expect } from './setup/fixtures';

test.describe('Portal Hosting @hosting', () => {
  test('GET /hosting lists hosted sites for client', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/hosting');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('GET /hosting rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/hosting');
    expect(res.status).toBe(401);
  });

  test('GET /hosting/:id returns 404 for non-existent site', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/hosting/999999');
    expect(res.status).toBe(404);
  });
});
