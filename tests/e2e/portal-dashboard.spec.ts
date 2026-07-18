/**
 * Portal Dashboard API E2E Tests
 *
 * Tests for /api/portal/dashboard
 */
import { test, expect } from './setup/fixtures';

test.describe('Portal Dashboard @dashboard @critical', () => {
  test('GET /dashboard returns aggregated stats', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/dashboard');
    expect(res.status).toBe(200);
    expect(res.data).toHaveProperty('company');
    expect(res.data).toHaveProperty('core');
    expect(res.data.core).toHaveProperty('projects');
    expect(res.data.core).toHaveProperty('tickets');
    expect(res.data.core).toHaveProperty('invoices');
    expect(res.data.core).toHaveProperty('amountDue');
    expect(typeof res.data.core.projects).toBe('number');
    expect(typeof res.data.core.tickets).toBe('number');
    expect(typeof res.data.core.invoices).toBe('number');
    expect(typeof res.data.core.amountDue).toBe('number');
  });

  test('GET /dashboard returns services list', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/dashboard');
    expect(res.status).toBe(200);
    expect(res.data).toHaveProperty('services');
    expect(Array.isArray(res.data.services)).toBe(true);

    // Each service should have expected shape
    for (const svc of res.data.services) {
      expect(svc).toHaveProperty('id');
      expect(svc).toHaveProperty('name');
      expect(svc).toHaveProperty('category');
      expect(svc).toHaveProperty('subscribed');
      expect(typeof svc.subscribed).toBe('boolean');
    }
  });

  test('GET /dashboard rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/dashboard');
    expect(res.status).toBe(401);
  });
});
