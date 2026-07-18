/**
 * Admin Portal Clients API E2E Tests
 *
 * Tests for /api/admin/portal/clients CRUD + members
 * All endpoints require admin/employee role.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups } from './setup/helpers';

test.describe('Admin Portal Clients @admin @clients @critical', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('GET /clients lists all clients', async ({ adminApi }) => {
    const res = await adminApi.get('/api/admin/portal/clients');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
    // Each item should have joined user fields
    if (res.data.data.length > 0) {
      expect(res.data.data[0]).toHaveProperty('userName');
      expect(res.data.data[0]).toHaveProperty('userEmail');
    }
  });

  test('POST /clients creates a new client with user', async ({ adminApi }) => {
    const email = `e2e-client-${Date.now()}@example.com`;
    const res = await adminApi.post('/api/admin/portal/clients', {
      name: 'E2E Test Client',
      email,
      password: 'testpass123',
      company: 'E2E Corp',
      phone: '(555) 000-0000',
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.user.email).toBe(email);
    expect(res.data.data.user.role).toBe('client');
    expect(res.data.data.client.company).toBe('E2E Corp');

    const userId = res.data.data.user.id;
    cleanups.push(async () => {
      await adminApi.delete(`/api/users/${userId}`).catch(() => {});
    });
  });

  test('POST /clients rejects missing required fields', async ({ adminApi }) => {
    const res = await adminApi.post('/api/admin/portal/clients', {
      name: 'No Email',
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('POST /clients rejects duplicate email', async ({ adminApi }) => {
    const email = `e2e-client-dup-${Date.now()}@example.com`;
    const first = await adminApi.post('/api/admin/portal/clients', {
      name: 'First', email, password: 'pass123',
    });
    expect(first.status).toBe(200);
    cleanups.push(async () => {
      await adminApi.delete(`/api/users/${first.data.data.user.id}`).catch(() => {});
    });

    const second = await adminApi.post('/api/admin/portal/clients', {
      name: 'Second', email, password: 'pass123',
    });
    expect(second.status).toBe(400);
    expect(second.data.message).toContain('already exists');
  });

  test('GET /clients/:id returns a single client', async ({ adminApi }) => {
    const { clientId, cleanup } = await createTestClient(adminApi);
    cleanups.push(cleanup);

    const res = await adminApi.get(`/api/admin/portal/clients/${clientId}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toHaveProperty('client');
    expect(res.data.data).toHaveProperty('user');
  });

  test('GET /clients/:id returns 404 for non-existent', async ({ adminApi }) => {
    const res = await adminApi.get('/api/admin/portal/clients/999999');
    expect(res.status).toBe(404);
  });

  test('PATCH /clients/:id updates client fields', async ({ adminApi }) => {
    const { clientId, cleanup } = await createTestClient(adminApi);
    cleanups.push(cleanup);

    const res = await adminApi.patch(`/api/admin/portal/clients/${clientId}`, {
      company: 'Updated Corp',
      phone: '(555) 111-1111',
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.company).toBe('Updated Corp');
  });

  test('GET /clients rejects non-admin (client role)', async ({ clientApi }) => {
    const res = await clientApi.get('/api/admin/portal/clients');
    expect(res.status).toBe(401);
  });

  test('GET /clients rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/admin/portal/clients');
    expect(res.status).toBe(401);
  });
});

test.describe('Admin Portal Client Members @admin @clients @members', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('GET /clients/:id/members lists members', async ({ adminApi }) => {
    const { clientId, cleanup } = await createTestClient(adminApi);
    cleanups.push(cleanup);

    const res = await adminApi.get(`/api/admin/portal/clients/${clientId}/members`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
    // Owner should be the first member
    expect(res.data.data.length).toBeGreaterThanOrEqual(1);
    expect(res.data.data[0].role).toBe('owner');
  });

  test('POST /clients/:id/members adds a new member', async ({ adminApi }) => {
    const { clientId, cleanup } = await createTestClient(adminApi);
    cleanups.push(cleanup);

    const email = `e2e-member-${Date.now()}@example.com`;
    const res = await adminApi.post(`/api/admin/portal/clients/${clientId}/members`, {
      name: 'New Member',
      email,
      password: 'memberpass123',
    });
    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data.email).toBe(email);
    expect(res.data.data.role).toBe('member');

    // Clean up the created user
    cleanups.push(async () => {
      await adminApi.delete(`/api/users/${res.data.data.userId}`).catch(() => {});
    });
  });

  test('POST /clients/:id/members rejects duplicate member', async ({ adminApi }) => {
    const { clientId, cleanup } = await createTestClient(adminApi);
    cleanups.push(cleanup);

    const email = `e2e-dup-member-${Date.now()}@example.com`;
    const first = await adminApi.post(`/api/admin/portal/clients/${clientId}/members`, {
      name: 'Dup', email, password: 'pass123',
    });
    expect(first.status).toBe(201);
    cleanups.push(async () => {
      await adminApi.delete(`/api/users/${first.data.data.userId}`).catch(() => {});
    });

    const second = await adminApi.post(`/api/admin/portal/clients/${clientId}/members`, {
      name: 'Dup', email, password: 'pass123',
    });
    expect(second.status).toBe(400);
    expect(second.data.message).toContain('already a member');
  });

  test('DELETE /clients/:id/members/:memberId removes a member', async ({ adminApi }) => {
    const { clientId, cleanup } = await createTestClient(adminApi);
    cleanups.push(cleanup);

    // Add a member first
    const email = `e2e-remove-${Date.now()}@example.com`;
    const add = await adminApi.post(`/api/admin/portal/clients/${clientId}/members`, {
      name: 'Remove Me', email, password: 'pass123',
    });
    expect(add.status).toBe(201);
    const memberId = add.data.data.id;
    cleanups.push(async () => {
      await adminApi.delete(`/api/users/${add.data.data.userId}`).catch(() => {});
    });

    const res = await adminApi.delete(`/api/admin/portal/clients/${clientId}/members/${memberId}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });

  test('DELETE /clients/:id/members rejects removing owner', async ({ adminApi }) => {
    const { clientId, cleanup } = await createTestClient(adminApi);
    cleanups.push(cleanup);

    // Get the owner member ID
    const members = await adminApi.get(`/api/admin/portal/clients/${clientId}/members`);
    const owner = members.data.data.find((m: { role: string }) => m.role === 'owner');

    const res = await adminApi.delete(`/api/admin/portal/clients/${clientId}/members/${owner.memberId}`);
    expect(res.status).toBe(400);
    expect(res.data.message).toContain('owner');
  });
});

// --- Helper ---

async function createTestClient(api: import('./setup/api-client').ApiClient) {
  const email = `e2e-client-${Date.now()}@example.com`;
  const res = await api.post('/api/admin/portal/clients', {
    name: 'E2E Client',
    email,
    password: 'testpass123',
    company: `E2E Corp ${Date.now()}`,
  });
  if (!res.data?.success) throw new Error(`Failed to create test client: ${res.data?.message}`);
  const clientId = res.data.data.client.id;
  const userId = res.data.data.user.id;
  const cleanup = async () => {
    await api.delete(`/api/users/${userId}`).catch(() => {});
  };
  return { clientId, userId, cleanup };
}
