/**
 * Portal Email Segments & Tags API E2E Tests
 *
 * Tests for /api/portal/email/segments and /api/portal/email/tags.
 * These features are service-gated (require 'email' subscription).
 * Tests pass in both subscribed and unsubscribed scenarios.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups } from './setup/helpers';

let emailAccess = false;

// ── Email Segments ──

test.describe('Portal Email — Segments Service Gate @email @segments', () => {
  test('returns 403 with upsell info when no email subscription', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/email/segments');
    emailAccess = res.status === 200;
    if (res.status === 403) {
      expect(res.data.success).toBe(false);
      expect(res.data.message).toContain('subscription');
      expect(res.data).toHaveProperty('requiresService', 'email');
      expect(res.data).toHaveProperty('upsellUrl');
    } else {
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
    }
  });

  test('rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/email/segments');
    expect(res.status).toBe(401);
  });
});

test.describe('Portal Email — Segments CRUD @email @segments', () => {
  let cleanups: Array<() => Promise<void>> = [];
  let hasAccess = false;

  test.beforeAll(async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/email/segments');
    hasAccess = res.status === 200;
  });

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('POST creates a segment', async ({ clientApi }) => {
    test.skip(!hasAccess, 'No email subscription');
    const ts = Date.now();
    const res = await clientApi.post('/api/portal/email/segments', {
      name: `Test Segment ${ts}`,
      rules: [{ field: 'email', operator: 'contains', value: '@example.com' }],
      matchType: 'all',
    });
    expect(res.status).toBe(201);
    expect(res.data.data.name).toContain('Test Segment');
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/email/segments/${res.data.data.id}`).catch(() => {});
    });
  });

  test('GET /segments lists segments', async ({ clientApi }) => {
    test.skip(!hasAccess, 'No email subscription');
    const res = await clientApi.get('/api/portal/email/segments');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('PATCH /segments/[id] updates a segment', async ({ clientApi }) => {
    test.skip(!hasAccess, 'No email subscription');
    const create = await clientApi.post('/api/portal/email/segments', {
      name: `Updatable ${Date.now()}`,
      rules: [],
      matchType: 'all',
    });
    const segId = create.data.data.id;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/email/segments/${segId}`).catch(() => {});
    });

    const res = await clientApi.patch(`/api/portal/email/segments/${segId}`, {
      name: 'Updated Segment',
      matchType: 'any',
    });
    expect(res.status).toBe(200);
    expect(res.data.data.name).toBe('Updated Segment');
  });

  test('DELETE /segments/[id] removes a segment', async ({ clientApi }) => {
    test.skip(!hasAccess, 'No email subscription');
    const create = await clientApi.post('/api/portal/email/segments', {
      name: `Deletable ${Date.now()}`,
      rules: [],
    });
    const res = await clientApi.delete(`/api/portal/email/segments/${create.data.data.id}`);
    expect(res.status).toBe(200);
  });
});

// ── Email Tags ──

test.describe('Portal Email — Tags Service Gate @email @email-tags', () => {
  test('returns 403 with upsell when no email subscription', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/email/tags');
    if (res.status === 403) {
      expect(res.data.success).toBe(false);
      expect(res.data).toHaveProperty('requiresService', 'email');
    } else {
      expect(res.status).toBe(200);
    }
  });
});

test.describe('Portal Email — Tags CRUD @email @email-tags', () => {
  let cleanups: Array<() => Promise<void>> = [];
  let hasAccess = false;

  test.beforeAll(async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/email/tags');
    hasAccess = res.status === 200;
  });

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('POST creates an email tag', async ({ clientApi }) => {
    test.skip(!hasAccess, 'No email subscription');
    const ts = Date.now();
    const res = await clientApi.post('/api/portal/email/tags', {
      name: `Test Email Tag ${ts}`,
      color: '#10b981',
    });
    expect(res.status).toBe(201);
    expect(res.data.data.name).toContain('Test Email Tag');
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/email/tags/${res.data.data.id}`).catch(() => {});
    });
  });

  test('GET /tags lists email tags', async ({ clientApi }) => {
    test.skip(!hasAccess, 'No email subscription');
    const res = await clientApi.get('/api/portal/email/tags');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('PATCH /tags/[id] updates an email tag', async ({ clientApi }) => {
    test.skip(!hasAccess, 'No email subscription');
    const create = await clientApi.post('/api/portal/email/tags', {
      name: `Updatable Tag ${Date.now()}`,
      color: '#6366f1',
    });
    const tagId = create.data.data.id;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/email/tags/${tagId}`).catch(() => {});
    });

    const res = await clientApi.patch(`/api/portal/email/tags/${tagId}`, {
      name: 'Renamed Tag',
      color: '#f59e0b',
    });
    expect(res.status).toBe(200);
    expect(res.data.data.name).toBe('Renamed Tag');
  });

  test('DELETE /tags/[id] removes an email tag', async ({ clientApi }) => {
    test.skip(!hasAccess, 'No email subscription');
    const create = await clientApi.post('/api/portal/email/tags', {
      name: `Deletable Tag ${Date.now()}`,
    });
    const res = await clientApi.delete(`/api/portal/email/tags/${create.data.data.id}`);
    expect(res.status).toBe(200);
  });
});
