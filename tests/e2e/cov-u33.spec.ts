/**
 * cov-u33 — Email Campaigns: Subscriber Tag Assignment
 *
 * Card: "Subscriber tag assignment: assign and remove a tag from a subscriber
 *        via POST/DELETE /api/portal/email/tags"
 *
 * Routes exercised:
 *   POST   /api/portal/email/tags          — create a tag (name, color)
 *   DELETE /api/portal/email/tags/[id]     — delete a tag
 *   GET    /api/portal/email/tags          — list tags (verification)
 *
 * All routes require an `email` service subscription. When that subscription
 * is absent the server returns 403 with { success:false, requiresService:'email' }.
 * Tests skip gracefully when the tenant is not subscribed.
 */
import { test, expect } from './setup/fixtures';

// ── Service gate (unauthenticated) ──────────────────────────────────────────

test.describe('Email Tags — auth gates @email @tags', () => {
  test('GET /api/portal/email/tags rejects unauthenticated with 401', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/email/tags');
    expect(res.status).toBe(401);
  });

  test('POST /api/portal/email/tags rejects unauthenticated with 401', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/email/tags', { name: 'ghost-tag' });
    expect(res.status).toBe(401);
  });
});

// ── Tag CRUD (create + delete) ───────────────────────────────────────────────

test.describe('Email Tags — create and delete @email @tags', () => {
  let hasEmailAccess = false;
  let createdTagId: number | null = null;

  test.beforeAll(async ({ clientApi }) => {
    // Probe to see if tenant has email service entitlement
    const probe = await clientApi.get('/api/portal/email/tags');
    hasEmailAccess = probe.status === 200;
  });

  test.afterAll(async ({ clientApi }) => {
    // Clean up any tag that was not deleted by the test itself
    if (createdTagId !== null) {
      await clientApi.delete(`/api/portal/email/tags/${createdTagId}`);
      createdTagId = null;
    }
  });

  test('GET /api/portal/email/tags returns 403 upsell envelope when not subscribed', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/email/tags');
    if (res.status === 403) {
      expect(res.data.success).toBe(false);
      expect(res.data).toHaveProperty('requiresService', 'email');
    } else {
      // Subscribed — skip the negative assertion
      expect(res.status).toBe(200);
    }
  });

  test('POST /api/portal/email/tags creates a tag with name and color', async ({ clientApi }) => {
    test.skip(!hasEmailAccess, 'No email service subscription on test tenant');

    const ts = Date.now();
    const res = await clientApi.post('/api/portal/email/tags', {
      name: `test-tag-${ts}`,
      color: '#ff5500',
    });

    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toHaveProperty('id');
    expect(res.data.data.name).toBe(`test-tag-${ts}`);
    expect(res.data.data.color).toBe('#ff5500');

    createdTagId = res.data.data.id;
  });

  test('POST /api/portal/email/tags returns 400 when name is missing', async ({ clientApi }) => {
    test.skip(!hasEmailAccess, 'No email service subscription on test tenant');

    const res = await clientApi.post('/api/portal/email/tags', { color: '#abcdef' });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('GET /api/portal/email/tags lists all tags including the newly created one', async ({ clientApi }) => {
    test.skip(!hasEmailAccess, 'No email service subscription on test tenant');
    test.skip(createdTagId === null, 'Tag was not created in prior step');

    const res = await clientApi.get('/api/portal/email/tags');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);

    const found = (res.data.data as Array<{ id: number }>).find(t => t.id === createdTagId);
    expect(found).toBeTruthy();
  });

  test('DELETE /api/portal/email/tags/[id] removes the tag', async ({ clientApi }) => {
    test.skip(!hasEmailAccess, 'No email service subscription on test tenant');
    test.skip(createdTagId === null, 'Tag was not created in prior step');

    const res = await clientApi.delete(`/api/portal/email/tags/${createdTagId}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);

    // Verify it's gone
    const listRes = await clientApi.get('/api/portal/email/tags');
    expect(listRes.status).toBe(200);
    const still = (listRes.data.data as Array<{ id: number }>).find(t => t.id === createdTagId);
    expect(still).toBeUndefined();

    createdTagId = null; // Already cleaned up
  });
});
