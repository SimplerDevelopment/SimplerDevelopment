/**
 * Portal Website Infrastructure API E2E Tests
 *
 * Tests for /api/portal/websites/[siteId] sub-routes:
 * deployments, logs, domain, collaborators
 * Also tests /api/portal/mentionable-users
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestWebsite } from './setup/helpers';

// Serial: tests share a website created in setup
test.describe.configure({ mode: 'serial' });

test.describe('Portal Website Infrastructure @websites @infra', () => {
  let siteId: number;

  test('setup: create test website', async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    siteId = website.id;
  });

  // --- Deployments ---

  test('GET /websites/:id/deployments returns deployments list', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/websites/${siteId}/deployments`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    // Returns empty array if no Vercel project ID
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('GET /websites/:id/deployments rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get(`/api/portal/websites/${siteId}/deployments`);
    expect(res.status).toBe(401);
  });

  // --- Logs ---

  test('GET /websites/:id/logs returns request logs', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/websites/${siteId}/logs`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('GET /websites/:id/logs respects limit parameter', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/websites/${siteId}/logs?limit=5`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.length).toBeLessThanOrEqual(5);
  });

  test('GET /websites/:id/logs rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get(`/api/portal/websites/${siteId}/logs`);
    expect(res.status).toBe(401);
  });

  // --- Domain ---

  test('POST /websites/:id/domain rejects missing customDomain', async ({ clientApi }) => {
    const res = await clientApi.post(`/api/portal/websites/${siteId}/domain`, {});
    expect(res.status).toBe(400);
  });

  test('POST /websites/:id/domain rejects un-provisioned site', async ({ clientApi }) => {
    // New test site has no Vercel project — should fail with 400
    const res = await clientApi.post(`/api/portal/websites/${siteId}/domain`, {
      customDomain: 'test.example.com',
    });
    expect(res.status).toBe(400);
  });

  test('POST /websites/:id/domain rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post(`/api/portal/websites/${siteId}/domain`, {
      customDomain: 'test.example.com',
    });
    expect(res.status).toBe(401);
  });

  // --- Collaborators ---

  test('POST /websites/:id/collaborators rejects un-provisioned repo', async ({ clientApi }) => {
    // New test site has no GitHub repo — should fail with 400
    const res = await clientApi.post(`/api/portal/websites/${siteId}/collaborators`, {
      permission: 'push',
    });
    expect(res.status).toBe(400);
  });

  test('POST /websites/:id/collaborators rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post(`/api/portal/websites/${siteId}/collaborators`, {
      permission: 'push',
    });
    expect(res.status).toBe(401);
  });

  // --- Non-existent site ---

  test('GET /websites/999999/deployments returns 404', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/websites/999999/deployments');
    expect(res.status).toBe(404);
  });

  test('GET /websites/999999/logs returns 404', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/websites/999999/logs');
    expect(res.status).toBe(404);
  });
});

test.describe('Portal Mentionable Users @portal @mentions', () => {
  test('GET /mentionable-users returns user list', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/mentionable-users');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
    if (res.data.data.length > 0) {
      expect(res.data.data[0]).toHaveProperty('id');
      expect(res.data.data[0]).toHaveProperty('name');
    }
  });

  test('GET /mentionable-users rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/mentionable-users');
    expect(res.status).toBe(401);
  });
});
