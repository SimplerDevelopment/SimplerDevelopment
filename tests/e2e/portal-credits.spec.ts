/**
 * Portal AI Credits API E2E Tests
 *
 * Tests for /api/portal/credits
 * All tests are rerunnable.
 */
import { test, expect } from './setup/fixtures';

test.describe('Portal Credits @credits', () => {
  test('GET /credits returns balance and ledger', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/credits');
    expect(res.status).toBe(200);
    expect(res.data).toHaveProperty('balance');
    expect(res.data).toHaveProperty('monthlyGrant');
    expect(res.data).toHaveProperty('payAsYouGo');
    expect(res.data).toHaveProperty('monthlyUsage');
    expect(res.data).toHaveProperty('ledger');
    expect(res.data).toHaveProperty('packages');

    expect(typeof res.data.balance).toBe('number');
    expect(typeof res.data.monthlyGrant).toBe('number');
    expect(typeof res.data.monthlyUsage).toBe('number');
    expect(Array.isArray(res.data.ledger)).toBe(true);
    expect(Array.isArray(res.data.packages)).toBe(true);
  });

  test('GET /credits returns packages with pricing', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/credits');
    expect(res.status).toBe(200);

    // Packages should have expected fields if any exist
    for (const pkg of res.data.packages) {
      expect(pkg).toHaveProperty('id');
      expect(pkg).toHaveProperty('tokens');
      expect(pkg).toHaveProperty('price');
      expect(typeof pkg.tokens).toBe('number');
      expect(typeof pkg.price).toBe('number');
    }
  });

  test('GET /credits supports pagination', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/credits?limit=5&offset=0');
    expect(res.status).toBe(200);
    expect(res.data.ledger.length).toBeLessThanOrEqual(5);
  });

  test('GET /credits rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/credits');
    expect(res.status).toBe(401);
  });
});
