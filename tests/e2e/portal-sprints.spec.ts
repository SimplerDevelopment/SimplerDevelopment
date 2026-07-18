/**
 * Portal Sprints API E2E Tests
 *
 * Tests for /api/portal/sprints
 * Sprint CRUD requires admin/employee (portal staff) role, OR a client-tenant
 * caller with editor+ role on the sprint's project (see authorizeSprint in
 * app/api/portal/sprints/[id]/route.ts).
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestKanbanProject } from './setup/helpers';

// Builds a sprint that a client-role caller can be legitimately forbidden
// from editing: the project is created by clientApi (so it's the same
// tenant — passing authorizeSprint's tenant-match check and avoiding a
// 404-instead-of-403), then the creator is downgraded off editor so the
// route's role check is the thing that actually fires 403.
//
// Cleanup runs as adminApi (staff bypasses tenant/role checks) since
// clientApi is intentionally left without edit rights on its own project
// after the downgrade and can no longer delete/archive it itself.
async function createForbiddenSprint(
  clientApi: import('./setup/api-client').ApiClient,
  adminApi: import('./setup/api-client').ApiClient,
) {
  const { project, columns } = await createTestKanbanProject(clientApi);
  const clientUserId = (project as unknown as { createdBy: number }).createdBy;

  const sprintRes = await clientApi.post(`/api/portal/projects/${project.id}/sprints`, {
    name: `Forbidden Sprint ${Date.now()}`,
  });
  if (!sprintRes.data?.success) {
    throw new Error(`Failed to create sprint: ${sprintRes.status} ${JSON.stringify(sprintRes.data)}`);
  }
  const sprintId = sprintRes.data.data.id as number;

  const downgrade = await adminApi.patch(`/api/portal/projects/${project.id}/members`, {
    userId: clientUserId,
    role: 'viewer',
  });
  if (downgrade.status !== 200) {
    throw new Error(`Failed to downgrade member role: ${downgrade.status} ${JSON.stringify(downgrade.data)}`);
  }

  const cleanup = async () => {
    await adminApi.delete(`/api/portal/sprints/${sprintId}`).catch(() => {});
    for (const col of columns) {
      await adminApi.delete(`/api/portal/projects/${project.id}/columns/${col.id}`).catch(() => {});
    }
    await adminApi
      .patch(`/api/portal/projects/${project.id}`, { status: 'archived', name: `[archived-e2e] ${project.name}` })
      .catch(() => {});
  };

  return { sprintId, cleanup };
}

test.describe('Portal Sprints @sprints @kanban', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('PATCH /sprints/:id rejects client role', async ({ clientApi, adminApi }) => {
    const { sprintId, cleanup } = await createForbiddenSprint(clientApi, adminApi);
    cleanups.push(cleanup);

    const res = await clientApi.patch(`/api/portal/sprints/${sprintId}`, {
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

  test('DELETE /sprints/:id rejects client role', async ({ clientApi, adminApi }) => {
    const { sprintId, cleanup } = await createForbiddenSprint(clientApi, adminApi);
    cleanups.push(cleanup);

    const res = await clientApi.delete(`/api/portal/sprints/${sprintId}`);
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
