/**
 * Portal Booking Pages API E2E Tests
 *
 * Tests for /api/portal/tools/booking CRUD + bookings management
 */
import { test, expect } from './setup/fixtures';
import { runCleanups } from './setup/helpers';

test.describe('Portal Booking Pages @booking @critical', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('GET /tools/booking lists booking pages', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/tools/booking');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('POST /tools/booking creates a booking page', async ({ clientApi }) => {
    const title = `Test Booking ${Date.now()}`;
    const res = await clientApi.post('/api/portal/tools/booking', {
      title,
      description: 'E2E test booking page',
      duration: 45,
      timezone: 'America/Chicago',
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.title).toBe(title);
    expect(res.data.data.duration).toBe(45);
    expect(res.data.data.id).toBeTruthy();

    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/tools/booking/${res.data.data.id}`).catch(() => {});
    });
  });

  test('POST /tools/booking creates with defaults', async ({ clientApi }) => {
    const title = `Default Booking ${Date.now()}`;
    const res = await clientApi.post('/api/portal/tools/booking', { title });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.duration).toBe(30);

    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/tools/booking/${res.data.data.id}`).catch(() => {});
    });
  });

  test('POST /tools/booking rejects missing title', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/tools/booking', {
      description: 'No title',
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('GET /tools/booking/:id returns a single booking page', async ({ clientApi }) => {
    const { id, cleanup } = await createTestBookingPage(clientApi);
    cleanups.push(cleanup);

    const res = await clientApi.get(`/api/portal/tools/booking/${id}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.id).toBe(id);
  });

  test('PUT /tools/booking/:id updates a booking page', async ({ clientApi }) => {
    const { id, cleanup } = await createTestBookingPage(clientApi);
    cleanups.push(cleanup);

    const res = await clientApi.put(`/api/portal/tools/booking/${id}`, {
      title: 'Updated Booking Title',
      description: 'Updated description',
      duration: 60,
      bufferBefore: 10,
      bufferAfter: 5,
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.title).toBe('Updated Booking Title');
    expect(res.data.data.duration).toBe(60);
  });

  test('DELETE /tools/booking/:id removes a booking page', async ({ clientApi }) => {
    const { id } = await createTestBookingPage(clientApi);

    const res = await clientApi.delete(`/api/portal/tools/booking/${id}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);

    // Verify it's gone
    const after = await clientApi.get(`/api/portal/tools/booking/${id}`);
    expect(after.status).toBe(404);
  });

  test('GET /tools/booking/:id returns 404 for non-existent page', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/tools/booking/999999');
    expect(res.status).toBe(404);
  });

  test('rejects unauthenticated access', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/tools/booking');
    expect(res.status).toBe(401);
  });
});

test.describe('Portal Booking — Bookings @booking @bookings', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('GET /tools/booking/:id/bookings lists bookings for a page', async ({ clientApi }) => {
    const { id, cleanup } = await createTestBookingPage(clientApi);
    cleanups.push(cleanup);

    const res = await clientApi.get(`/api/portal/tools/booking/${id}/bookings`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('GET /tools/booking/:id/bookings returns 404 for non-existent page', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/tools/booking/999999/bookings');
    expect(res.status).toBe(404);
  });
});

test.describe('Portal Booking — Embed @booking @embed', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('GET /tools/booking/:id/embed returns embed snippets', async ({ clientApi }) => {
    const { id, cleanup } = await createTestBookingPage(clientApi);
    cleanups.push(cleanup);

    const res = await clientApi.get(`/api/portal/tools/booking/${id}/embed`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toHaveProperty('url');
    expect(res.data.data).toHaveProperty('iframe');
    expect(res.data.data).toHaveProperty('script');
    expect(res.data.data.url).toContain('/book/');
  });
});

// --- Helper ---

async function createTestBookingPage(api: import('./setup/api-client').ApiClient) {
  const title = `Test Booking ${Date.now()}`;
  const res = await api.post('/api/portal/tools/booking', {
    title,
    description: 'E2E test booking page',
  });
  if (!res.data?.success) throw new Error(`Failed to create test booking page: ${res.data?.message}`);
  const id = res.data.data.id;
  const cleanup = async () => {
    await api.delete(`/api/portal/tools/booking/${id}`).catch(() => {});
  };
  return { id, cleanup };
}
