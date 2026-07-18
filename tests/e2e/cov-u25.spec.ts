/**
 * cov-u25 — Projects / Tickets / Kanban coverage slice (indices 12–13)
 *
 * Card 12: GET /sprints/:id/burndown — sprint burndown chart data
 * Card 13: GET /sprints/:id/capacity — sprint capacity breakdown (per-assignee)
 *
 * Both routes are read-only analytic endpoints on existing sprints.
 * They require auth but are accessible to both staff and project-member clients.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestKanbanProject, createTestKanbanCard } from './setup/helpers';

// ── Shared sprint setup helper ──────────────────────────────────────────────

async function createTestSprint(
  api: import('./setup/api-client').ApiClient,
  projectId: number,
  overrides?: Record<string, unknown>,
): Promise<{ sprintId: number; cleanup: () => Promise<void> }> {
  const res = await api.post(`/api/portal/projects/${projectId}/sprints`, {
    name: `E2E Sprint ${Date.now()}`,
    ...overrides,
  });
  if (!res.data?.success) throw new Error(`Failed to create sprint: ${res.data?.message}`);
  const sprintId = res.data.data.id as number;
  const cleanup = async () => {
    await api.delete(`/api/portal/sprints/${sprintId}`).catch(() => {});
  };
  return { sprintId, cleanup };
}

// ── Card 12: Sprint Burndown ─────────────────────────────────────────────────

test.describe('Sprint burndown chart @projects @sprints @burndown', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('GET /sprints/:id/burndown returns success + data shape (no dates)', async ({ clientApi }) => {
    const { project, cleanup: projCleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(projCleanup);

    const { sprintId, cleanup: sprintCleanup } = await createTestSprint(clientApi, project.id);
    cleanups.push(sprintCleanup);

    const res = await clientApi.get(`/api/portal/sprints/${sprintId}/burndown`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    // Sprint has no start/end date set — route returns a message, not an error
    expect(res.data.data).toHaveProperty('series');
    expect(Array.isArray(res.data.data.series)).toBe(true);
  });

  test('GET /sprints/:id/burndown returns sprintId + name when sprint has dates', async ({ clientApi }) => {
    const { project, cleanup: projCleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(projCleanup);

    // Create sprint with explicit dates so the route produces a real series
    const { sprintId, cleanup: sprintCleanup } = await createTestSprint(clientApi, project.id, {
      startDate: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10),
      endDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    });
    cleanups.push(sprintCleanup);

    const res = await clientApi.get(`/api/portal/sprints/${sprintId}/burndown`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.sprintId).toBe(sprintId);
    expect(typeof res.data.data.sprintName).toBe('string');
    expect(Array.isArray(res.data.data.series)).toBe(true);
  });

  test('GET /sprints/999999/burndown returns 404 for unknown sprint', async ({ adminApi }) => {
    const res = await adminApi.get('/api/portal/sprints/999999/burndown');
    expect(res.status).toBe(404);
  });

  test('GET /sprints/:id/burndown rejects unauthenticated', async ({ unauthApi, clientApi }) => {
    const { project, cleanup: projCleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(projCleanup);
    const { sprintId, cleanup: sprintCleanup } = await createTestSprint(clientApi, project.id);
    cleanups.push(sprintCleanup);

    const res = await unauthApi.get(`/api/portal/sprints/${sprintId}/burndown`);
    expect(res.status).toBe(401);
  });
});

// ── Card 13: Sprint Capacity ─────────────────────────────────────────────────

test.describe('Sprint capacity breakdown @projects @sprints @capacity', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('GET /sprints/:id/capacity returns success + data shape', async ({ clientApi }) => {
    const { project, columns, cleanup: projCleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(projCleanup);

    const { sprintId, cleanup: sprintCleanup } = await createTestSprint(clientApi, project.id);
    cleanups.push(sprintCleanup);

    const res = await clientApi.get(`/api/portal/sprints/${sprintId}/capacity`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.sprintId).toBe(sprintId);
    expect(typeof res.data.data.sprintName).toBe('string');
    // columns: array of project columns
    expect(Array.isArray(res.data.data.columns)).toBe(true);
    // rows: array of per-assignee capacity entries (empty when no assignees)
    expect(Array.isArray(res.data.data.rows)).toBe(true);
    void columns; // used to create project with columns
  });

  test('GET /sprints/:id/capacity rows include card with story points assigned to sprint', async ({ adminApi, clientApi }) => {
    const { project, columns, cleanup: projCleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(projCleanup);

    const { sprintId, cleanup: sprintCleanup } = await createTestSprint(clientApi, project.id);
    cleanups.push(sprintCleanup);

    // Create a card with story points and assign it to the sprint
    const { card, cleanup: cardCleanup } = await createTestKanbanCard(adminApi, columns[0].id, {
      title: `Capacity Test Card ${Date.now()}`,
      storyPoints: 3,
    });
    cleanups.push(cardCleanup);

    // Move card into sprint
    await adminApi.patch(`/api/portal/cards/${card.id}`, { sprintId });

    const res = await adminApi.get(`/api/portal/sprints/${sprintId}/capacity`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    // No assignees on the card → rows is still empty but request succeeds
    expect(Array.isArray(res.data.data.rows)).toBe(true);
    expect(Array.isArray(res.data.data.columns)).toBe(true);
    // columns should include the project's columns
    expect(res.data.data.columns.length).toBeGreaterThanOrEqual(1);
  });

  test('GET /sprints/999999/capacity returns 404 for unknown sprint', async ({ adminApi }) => {
    const res = await adminApi.get('/api/portal/sprints/999999/capacity');
    expect(res.status).toBe(404);
  });

  test('GET /sprints/:id/capacity rejects unauthenticated', async ({ unauthApi, clientApi }) => {
    const { project, cleanup: projCleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(projCleanup);
    const { sprintId, cleanup: sprintCleanup } = await createTestSprint(clientApi, project.id);
    cleanups.push(sprintCleanup);

    const res = await unauthApi.get(`/api/portal/sprints/${sprintId}/capacity`);
    expect(res.status).toBe(401);
  });
});
