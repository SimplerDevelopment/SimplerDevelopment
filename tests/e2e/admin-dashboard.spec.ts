/**
 * Admin Dashboard API E2E Tests
 *
 * Tests for /api/admin/dashboard
 * Returns aggregated stats across all clients.
 */
import { test, expect } from './setup/coverage-fixture';

test.describe('Admin Dashboard @admin @dashboard @critical', () => {
  test('GET /dashboard returns 200 with all expected data fields @smoke', async ({ adminApi }) => {
    const res = await adminApi.get('/api/admin/dashboard');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toBeDefined();

    const d = res.data.data;
    // Top-level keys
    expect(d).toHaveProperty('clients');
    expect(d).toHaveProperty('websites');
    expect(d).toHaveProperty('tickets');
    expect(d).toHaveProperty('projects');
    expect(d).toHaveProperty('invoices');
    expect(d).toHaveProperty('subscriptions');
    expect(d).toHaveProperty('aiCredits');
    expect(d).toHaveProperty('deals');
    expect(d).toHaveProperty('contacts');
    expect(d).toHaveProperty('proposals');
    expect(d).toHaveProperty('campaigns');
    expect(d).toHaveProperty('bookings');
    expect(d).toHaveProperty('automations');
    expect(d).toHaveProperty('hostedSites');
    expect(d).toHaveProperty('recent');
  });

  test('clients field has total and active counts', async ({ adminApi }) => {
    const res = await adminApi.get('/api/admin/dashboard');
    const { clients } = res.data.data;
    expect(clients).toHaveProperty('total');
    expect(clients).toHaveProperty('active');
    expect(typeof clients.total).toBe('number');
    expect(typeof clients.active).toBe('number');
    expect(clients.total).toBeGreaterThanOrEqual(0);
  });

  test('websites field has total and active counts', async ({ adminApi }) => {
    const res = await adminApi.get('/api/admin/dashboard');
    const { websites } = res.data.data;
    expect(websites).toHaveProperty('total');
    expect(websites).toHaveProperty('active');
    expect(typeof websites.total).toBe('number');
  });

  test('tickets field has open count', async ({ adminApi }) => {
    const res = await adminApi.get('/api/admin/dashboard');
    const { tickets } = res.data.data;
    expect(tickets).toHaveProperty('open');
    expect(typeof tickets.open).toBe('number');
  });

  test('projects field has active count', async ({ adminApi }) => {
    const res = await adminApi.get('/api/admin/dashboard');
    const { projects } = res.data.data;
    expect(projects).toHaveProperty('active');
    expect(typeof projects.active).toBe('number');
  });

  test('invoices field has correct structure', async ({ adminApi }) => {
    const res = await adminApi.get('/api/admin/dashboard');
    const { invoices } = res.data.data;
    expect(invoices).toHaveProperty('outstanding');
    expect(invoices).toHaveProperty('collected');
    expect(invoices).toHaveProperty('overdueCount');
    expect(invoices).toHaveProperty('totalCount');
  });

  test('subscriptions field has active and mrr', async ({ adminApi }) => {
    const res = await adminApi.get('/api/admin/dashboard');
    const { subscriptions } = res.data.data;
    expect(subscriptions).toHaveProperty('active');
    expect(subscriptions).toHaveProperty('mrr');
  });

  test('aiCredits field has totalBalance and totalMonthlyGrant', async ({ adminApi }) => {
    const res = await adminApi.get('/api/admin/dashboard');
    const { aiCredits } = res.data.data;
    expect(aiCredits).toHaveProperty('totalBalance');
    expect(aiCredits).toHaveProperty('totalMonthlyGrant');
  });

  test('deals field has open, won, pipelineValue, wonValue', async ({ adminApi }) => {
    const res = await adminApi.get('/api/admin/dashboard');
    const { deals } = res.data.data;
    expect(deals).toHaveProperty('open');
    expect(deals).toHaveProperty('won');
    expect(deals).toHaveProperty('pipelineValue');
    expect(deals).toHaveProperty('wonValue');
  });

  test('contacts is a number', async ({ adminApi }) => {
    const res = await adminApi.get('/api/admin/dashboard');
    expect(typeof res.data.data.contacts).toBe('number');
  });

  test('proposals field has draft, sent, accepted', async ({ adminApi }) => {
    const res = await adminApi.get('/api/admin/dashboard');
    const { proposals } = res.data.data;
    expect(proposals).toHaveProperty('draft');
    expect(proposals).toHaveProperty('sent');
    expect(proposals).toHaveProperty('accepted');
  });

  test('bookings field has pages and upcoming', async ({ adminApi }) => {
    const res = await adminApi.get('/api/admin/dashboard');
    const { bookings } = res.data.data;
    expect(bookings).toHaveProperty('pages');
    expect(bookings).toHaveProperty('upcoming');
  });

  test('recent field has tickets, invoices, orders arrays', async ({ adminApi }) => {
    const res = await adminApi.get('/api/admin/dashboard');
    const { recent } = res.data.data;
    expect(Array.isArray(recent.tickets)).toBe(true);
    expect(Array.isArray(recent.invoices)).toBe(true);
    expect(Array.isArray(recent.orders)).toBe(true);
  });

  test('rejects client role (401)', async ({ clientApi }) => {
    const res = await clientApi.get('/api/admin/dashboard');
    expect(res.status).toBe(401);
  });

  test('rejects unauthenticated (401)', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/admin/dashboard');
    expect(res.status).toBe(401);
  });
});
