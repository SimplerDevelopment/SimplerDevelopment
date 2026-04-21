/**
 * PM Sprints — Phases 2 & 3
 *
 * Covers: sprint CRUD by private-project client, assign card to sprint,
 * sprint card ordering, status transitions, delete sends cards back to dock.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestKanbanProject, createTestKanbanCard } from './setup/helpers';

test.describe('PM Sprints @pm @sprints', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.afterEach(async () => { await runCleanups(cleanups); cleanups = []; });

  test('private-project client can create a sprint', async ({ clientApi }) => {
    const { project, cleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(cleanup);

    const res = await clientApi.post(`/api/portal/projects/${project.id}/sprints`, {
      name: 'Sprint 1', goal: 'Ship MVP',
    });
    expect(res.status).toBe(200);
    expect(res.data.data.name).toBe('Sprint 1');
    expect(res.data.data.status).toBe('planning');
  });

  test('assigning a card to a sprint removes it from the backlog list', async ({ clientApi }) => {
    const { project, columns, cleanup: projCleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(projCleanup);
    const { card, cleanup: cardCleanup } = await createTestKanbanCard(clientApi, columns[0].id);
    cleanups.push(cardCleanup);

    const sprint = await clientApi.post(`/api/portal/projects/${project.id}/sprints`, { name: 'Sprint A' });
    const sprintId = sprint.data.data.id;

    // Assign card to sprint
    const assign = await clientApi.patch(`/api/portal/cards/${card.id}`, { sprintId });
    expect(assign.status).toBe(200);

    const view = await clientApi.get(`/api/portal/projects/${project.id}/sprints`);
    const backlog = view.data.data.backlog as Array<{ id: number }>;
    expect(backlog.some(c => c.id === card.id)).toBe(false);
    const sprintRow = (view.data.data.sprints as Array<{ id: number; cards: Array<{ id: number }> }>).find(s => s.id === sprintId);
    expect(sprintRow?.cards.some(c => c.id === card.id)).toBe(true);
  });

  test('sprint card-order endpoint persists order', async ({ clientApi }) => {
    const { project, columns, cleanup: projCleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(projCleanup);
    const { card: c1, cleanup: c1c } = await createTestKanbanCard(clientApi, columns[0].id, { title: 'First' });
    cleanups.push(c1c);
    const { card: c2, cleanup: c2c } = await createTestKanbanCard(clientApi, columns[0].id, { title: 'Second' });
    cleanups.push(c2c);

    const sprint = await clientApi.post(`/api/portal/projects/${project.id}/sprints`, { name: 'Sprint' });
    const sprintId = sprint.data.data.id;
    await clientApi.patch(`/api/portal/cards/${c1.id}`, { sprintId });
    await clientApi.patch(`/api/portal/cards/${c2.id}`, { sprintId });

    // Reverse order
    const reorder = await clientApi.post(`/api/portal/sprints/${sprintId}/card-order`, {
      cardIds: [c2.id, c1.id],
    });
    expect(reorder.status).toBe(200);

    const view = await clientApi.get(`/api/portal/projects/${project.id}/sprints`);
    const sprintRow = (view.data.data.sprints as Array<{ id: number; cards: Array<{ id: number }> }>).find(s => s.id === sprintId);
    expect(sprintRow?.cards.map(c => c.id)).toEqual([c2.id, c1.id]);
  });

  test('deleting a sprint sends assigned cards back to dock (sprintId null)', async ({ clientApi }) => {
    const { project, columns, cleanup: projCleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(projCleanup);
    const { card, cleanup: cardCleanup } = await createTestKanbanCard(clientApi, columns[0].id);
    cleanups.push(cardCleanup);

    const sprint = await clientApi.post(`/api/portal/projects/${project.id}/sprints`, { name: 'Doomed' });
    const sprintId = sprint.data.data.id;
    await clientApi.patch(`/api/portal/cards/${card.id}`, { sprintId });

    const del = await clientApi.delete(`/api/portal/sprints/${sprintId}`);
    expect(del.status).toBe(200);

    const cardRes = await clientApi.get(`/api/portal/cards/${card.id}`);
    expect(cardRes.data.data.card.sprintId).toBeNull();
  });

  test('status transitions: planning → active → completed', async ({ clientApi }) => {
    const { project, cleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(cleanup);
    const sprint = await clientApi.post(`/api/portal/projects/${project.id}/sprints`, { name: 'Lifecycle' });
    const id = sprint.data.data.id;

    const toActive = await clientApi.patch(`/api/portal/sprints/${id}`, { status: 'active' });
    expect(toActive.data.data.status).toBe('active');

    const toCompleted = await clientApi.patch(`/api/portal/sprints/${id}`, { status: 'completed' });
    expect(toCompleted.data.data.status).toBe('completed');
  });
});
