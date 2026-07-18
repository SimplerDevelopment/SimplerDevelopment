/**
 * Admin AI Credits API E2E Tests
 *
 * Tests for /api/admin/portal/ai-credits
 * Returns summary stats, per-client balances, recent ledger, and packages.
 */
import { test, expect } from './setup/fixtures';

test.describe('Admin AI Credits @admin @ai-credits', () => {
  test('GET /ai-credits returns 200 with summary, balances, ledger, packages', async ({ adminApi }) => {
    const res = await adminApi.get('/api/admin/portal/ai-credits');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);

    const d = res.data.data;
    expect(d).toHaveProperty('summary');
    expect(d).toHaveProperty('balances');
    expect(d).toHaveProperty('ledger');
    expect(d).toHaveProperty('packages');
  });

  test('summary has totalBalance, totalMonthlyGrants, payAsYouGoClients', async ({ adminApi }) => {
    const res = await adminApi.get('/api/admin/portal/ai-credits');
    const { summary } = res.data.data;
    expect(summary).toHaveProperty('totalBalance');
    expect(summary).toHaveProperty('totalMonthlyGrants');
    expect(summary).toHaveProperty('payAsYouGoClients');
    expect(Number.isFinite(Number(summary.totalBalance))).toBe(true);
    expect(Number.isFinite(Number(summary.totalMonthlyGrants))).toBe(true);
  });

  test('balances is an array with expected fields', async ({ adminApi }) => {
    const res = await adminApi.get('/api/admin/portal/ai-credits');
    const { balances } = res.data.data;
    expect(Array.isArray(balances)).toBe(true);

    if (balances.length > 0) {
      const item = balances[0];
      expect(item).toHaveProperty('clientId');
      expect(item).toHaveProperty('balance');
      expect(item).toHaveProperty('monthlyGrant');
      expect(item).toHaveProperty('payAsYouGo');
      expect(item).toHaveProperty('clientName');
      expect(item).toHaveProperty('company');
    }
  });

  test('ledger is an array', async ({ adminApi }) => {
    const res = await adminApi.get('/api/admin/portal/ai-credits');
    expect(Array.isArray(res.data.data.ledger)).toBe(true);
  });

  test('packages is an array', async ({ adminApi }) => {
    const res = await adminApi.get('/api/admin/portal/ai-credits');
    expect(Array.isArray(res.data.data.packages)).toBe(true);
  });

  test('rejects client role (401)', async ({ clientApi }) => {
    const res = await clientApi.get('/api/admin/portal/ai-credits');
    expect(res.status).toBe(401);
  });

  test('rejects unauthenticated (401)', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/admin/portal/ai-credits');
    expect(res.status).toBe(401);
  });
});
