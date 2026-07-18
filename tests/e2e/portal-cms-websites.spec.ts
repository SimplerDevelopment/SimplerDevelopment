/**
 * Portal CMS Websites API E2E Tests
 *
 * Tests for /api/portal/cms/websites — top-level website CRUD
 */
import { test, expect } from './setup/fixtures';
import { runCleanups } from './setup/helpers';

test.describe('Portal CMS Websites @cms @websites @critical', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('GET /cms/websites lists client websites', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/cms/websites');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('POST /cms/websites creates a new website', async ({ clientApi }) => {
    const name = `Test Site ${Date.now()}`;
    const res = await clientApi.post('/api/portal/cms/websites', {
      name,
      domain: `test-${Date.now()}.example.com`,
      description: 'E2E test website',
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.name).toBe(name);
    expect(res.data.data.subdomain).toBeTruthy();
    expect(res.data.data.deploymentStatus).toBe('pending');
    expect(res.data.data.active).toBe(true);

    // No delete endpoint — track as acceptable leak
  });

  test('POST /cms/websites auto-generates subdomain', async ({ clientApi }) => {
    const name = `Auto Sub ${Date.now()}`;
    const res = await clientApi.post('/api/portal/cms/websites', { name });
    expect(res.status).toBe(200);
    expect(res.data.data.subdomain).toBeTruthy();
    expect(typeof res.data.data.subdomain).toBe('string');
  });

  test('POST /cms/websites rejects missing name', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/cms/websites', {
      description: 'No name',
    });
    expect(res.status).toBe(400);
  });

  test('POST /cms/websites rejects duplicate subdomain', async ({ clientApi }) => {
    const subdomain = `test-sub-${Date.now()}`;

    // First create
    const first = await clientApi.post('/api/portal/cms/websites', {
      name: 'First Site',
      subdomain,
    });
    expect(first.status).toBe(200);

    // Second with same subdomain
    const second = await clientApi.post('/api/portal/cms/websites', {
      name: 'Second Site',
      subdomain,
    });
    expect(second.status).toBe(409);
  });

  test('GET /cms/websites rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/cms/websites');
    expect(res.status).toBe(401);
  });
});
