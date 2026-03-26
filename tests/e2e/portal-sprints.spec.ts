/**
 * Portal Sprints API E2E Tests
 *
 * Tests for /api/portal/sprints
 * Sprint CRUD requires admin/employee (portal staff) role.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups } from './setup/helpers';

test.describe('Portal Sprints @sprints @kanban', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('PATCH /sprints/:id rejects client role', async ({ clientApi }) => {
    const res = await clientApi.patch('/api/portal/sprints/1', {
      name: 'Should Fail',
    });
    expect(res.status).toBe(403);
  });

  test('PATCH /sprints/:id rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.patch('/api/portal/sprints/1', {
      name: 'Should Fail',
    });
    expect(res.status).toBe(401);
  });

  test('DELETE /sprints/:id rejects client role', async ({ clientApi }) => {
    const res = await clientApi.delete('/api/portal/sprints/1');
    expect(res.status).toBe(403);
  });

  test('DELETE /sprints/:id rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.delete('/api/portal/sprints/1');
    expect(res.status).toBe(401);
  });

  test('PATCH /sprints/:id returns 404 for non-existent sprint', async ({ adminApi }) => {
    const res = await adminApi.patch('/api/portal/sprints/999999', {
      name: 'Non-existent Sprint',
    });
    expect(res.status).toBe(404);
  });

  test('DELETE /sprints/:id returns 404 for non-existent sprint', async ({ adminApi }) => {
    const res = await adminApi.delete('/api/portal/sprints/999999');
    expect(res.status).toBe(404);
  });
});
