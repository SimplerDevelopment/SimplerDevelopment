/**
 * Portal Services & Service Requests API E2E Tests
 *
 * Tests for /api/portal/services and /api/portal/service-requests
 */
import { test, expect } from './setup/fixtures';
import { runCleanups } from './setup/helpers';

test.describe('Portal Services @services', () => {
  test('GET /services lists available services', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/services');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('GET /services rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/services');
    expect(res.status).toBe(401);
  });
});

test.describe('Portal Service Requests @services @requests', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('GET /service-requests lists client requests', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/service-requests');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('POST /service-requests submits a request', async ({ clientApi }) => {
    // First get available services
    const services = await clientApi.get('/api/portal/services');
    if (!services.data.data?.length) {
      test.skip(); // no services seeded
      return;
    }
    const serviceId = services.data.data[0].id;

    const res = await clientApi.post('/api/portal/service-requests', {
      serviceId,
      message: `E2E service request ${Date.now()}`,
      answers: { domain: 'test.example.com' },
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.serviceId).toBe(serviceId);
  });

  test('POST /service-requests rejects missing serviceId', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/service-requests', {
      message: 'No service ID',
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('POST /service-requests rejects invalid service ID', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/service-requests', {
      serviceId: 999999,
      message: 'Invalid service',
    });
    expect(res.status).toBe(404);
  });

  test('POST /service-requests rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/service-requests', {
      serviceId: 1,
    });
    expect(res.status).toBe(401);
  });
});
