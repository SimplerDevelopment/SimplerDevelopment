/**
 * Admin Automations API E2E Tests
 *
 * Tests for /api/admin/portal/automations and /api/admin/portal/automations/logs
 * Returns automation rules, stats, and execution logs across all clients.
 */
import { test, expect } from './setup/fixtures';

test.describe('Admin Automations @admin @automations', () => {
  test('GET /automations returns rules array and stats object', async ({ adminApi }) => {
    const res = await adminApi.get('/api/admin/portal/automations');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
    expect(res.data).toHaveProperty('stats');

    const { stats } = res.data;
    expect(stats).toHaveProperty('totalRules');
    expect(stats).toHaveProperty('enabledRules');
    expect(stats).toHaveProperty('totalExecutions');
    expect(stats).toHaveProperty('failedCount');
    expect(typeof stats.totalRules).toBe('number');
    expect(typeof stats.enabledRules).toBe('number');
    expect(typeof stats.totalExecutions).toBe('number');
    expect(typeof stats.failedCount).toBe('number');
  });

  test('rules items have expected fields', async ({ adminApi }) => {
    const res = await adminApi.get('/api/admin/portal/automations');

    if (res.data.data.length > 0) {
      const rule = res.data.data[0];
      expect(rule).toHaveProperty('id');
      expect(rule).toHaveProperty('name');
      expect(rule).toHaveProperty('enabled');
      expect(rule).toHaveProperty('executionCount');
      expect(rule).toHaveProperty('company');
      expect(rule).toHaveProperty('clientName');
      expect(rule).toHaveProperty('createdAt');
    }
  });

  test('PATCH /automations toggles enabled status', async ({ adminApi }) => {
    // First get existing rules
    const listRes = await adminApi.get('/api/admin/portal/automations');
    if (listRes.data.data.length === 0) {
      test.skip();
      return;
    }

    const rule = listRes.data.data[0];
    const originalEnabled = rule.enabled;

    // Toggle enabled
    const patchRes = await adminApi.patch('/api/admin/portal/automations', {
      id: rule.id,
      enabled: !originalEnabled,
    });
    expect(patchRes.status).toBe(200);
    expect(patchRes.data.success).toBe(true);
    expect(patchRes.data.data.enabled).toBe(!originalEnabled);

    // Restore original state
    await adminApi.patch('/api/admin/portal/automations', {
      id: rule.id,
      enabled: originalEnabled,
    });
  });

  test('PATCH /automations rejects invalid payload', async ({ adminApi }) => {
    const res = await adminApi.patch('/api/admin/portal/automations', {
      id: 'not-a-number',
      enabled: 'not-a-boolean',
    });
    expect(res.status).toBe(400);
  });

  test('rejects client role (401)', async ({ clientApi }) => {
    const res = await clientApi.get('/api/admin/portal/automations');
    expect(res.status).toBe(401);
  });

  test('rejects unauthenticated (401)', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/admin/portal/automations');
    expect(res.status).toBe(401);
  });
});

test.describe('Admin Automation Logs @admin @automations', () => {
  test('GET /automations/logs returns logs array', async ({ adminApi }) => {
    const res = await adminApi.get('/api/admin/portal/automations/logs');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);

    if (res.data.data.length > 0) {
      const log = res.data.data[0];
      expect(log).toHaveProperty('id');
      expect(log).toHaveProperty('triggerEvent');
      expect(log).toHaveProperty('status');
      expect(log).toHaveProperty('ruleName');
      expect(log).toHaveProperty('company');
      expect(log).toHaveProperty('clientName');
      expect(log).toHaveProperty('createdAt');
    }
  });

  test('GET /automations/logs?status=success filters by status', async ({ adminApi }) => {
    const res = await adminApi.get('/api/admin/portal/automations/logs?status=success');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);

    for (const log of res.data.data) {
      expect(log.status).toBe('success');
    }
  });

  test('GET /automations/logs?status=failed filters by status', async ({ adminApi }) => {
    const res = await adminApi.get('/api/admin/portal/automations/logs?status=failed');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);

    for (const log of res.data.data) {
      expect(log.status).toBe('failed');
    }
  });

  test('rejects client role (401)', async ({ clientApi }) => {
    const res = await clientApi.get('/api/admin/portal/automations/logs');
    expect(res.status).toBe(401);
  });

  test('rejects unauthenticated (401)', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/admin/portal/automations/logs');
    expect(res.status).toBe(401);
  });
});
