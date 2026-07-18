/**
 * Admin Portal Projects API E2E Tests
 *
 * Tests for /api/admin/portal/projects CRUD
 * All endpoints require admin/employee role.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups } from './setup/helpers';

test.describe('Admin Portal Projects @admin @projects @critical', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('GET /projects lists all projects with client info', async ({ adminApi }) => {
    const res = await adminApi.get('/api/admin/portal/projects');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
    if (res.data.data.length > 0) {
      expect(res.data.data[0]).toHaveProperty('company');
      expect(res.data.data[0]).toHaveProperty('clientName');
    }
  });

  test('POST /projects creates a project with default kanban columns', async ({ adminApi }) => {
    // Need a client to assign the project to
    const clients = await adminApi.get('/api/admin/portal/clients');
    expect(clients.status).toBe(200);
    if (!clients.data.data?.length) {
      test.skip(); // no clients seeded
      return;
    }
    const clientId = clients.data.data[0].id;

    const name = `E2E Project ${Date.now()}`;
    const res = await adminApi.post('/api/admin/portal/projects', {
      name,
      description: 'E2E test project',
      clientId,
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.name).toBe(name);
    expect(res.data.data.status).toBe('active');

    const projectId = res.data.data.id;

    // Verify default kanban columns were created
    const cols = await adminApi.get(`/api/portal/projects/${projectId}/columns`);
    expect(cols.status).toBe(200);
    expect(cols.data.data.length).toBe(4);
    const colNames = cols.data.data.map((c: { name: string }) => c.name);
    expect(colNames).toEqual(['To Do', 'In Progress', 'Review', 'Done']);

    // No direct delete endpoint for projects — they accumulate
  });

  test('POST /projects rejects missing name', async ({ adminApi }) => {
    const res = await adminApi.post('/api/admin/portal/projects', {
      clientId: 1,
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('POST /projects rejects missing clientId', async ({ adminApi }) => {
    const res = await adminApi.post('/api/admin/portal/projects', {
      name: 'No Client',
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('GET /projects rejects non-admin (client role)', async ({ clientApi }) => {
    const res = await clientApi.get('/api/admin/portal/projects');
    expect(res.status).toBe(401);
  });

  test('GET /projects rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/admin/portal/projects');
    expect(res.status).toBe(401);
  });
});
