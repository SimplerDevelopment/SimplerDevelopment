/**
 * PM Cards Core — Phase 1 baseline
 *
 * Covers: project creation with project_key, card auto-numbering, card key
 * format (KEY-N), activity log entries, project status control, project
 * description CRUD.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestKanbanProject, createTestKanbanCard } from './setup/helpers';

test.describe('PM Cards Core @pm @cards @critical', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.afterEach(async () => { await runCleanups(cleanups); cleanups = []; });

  test('new project gets a project_key assigned', async ({ clientApi }) => {
    const { project, cleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(cleanup);
    expect(project.projectKey).toBeTruthy();
    expect(project.projectKey?.length ?? 0).toBeGreaterThan(0);
  });

  test('cards auto-number starting at 1 per project', async ({ clientApi }) => {
    const { columns, cleanup: projCleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(projCleanup);
    const { card: c1, cleanup: c1Cleanup } = await createTestKanbanCard(clientApi, columns[0].id, { title: 'First' });
    cleanups.push(c1Cleanup);
    const { card: c2, cleanup: c2Cleanup } = await createTestKanbanCard(clientApi, columns[0].id, { title: 'Second' });
    cleanups.push(c2Cleanup);
    const { card: c3, cleanup: c3Cleanup } = await createTestKanbanCard(clientApi, columns[0].id, { title: 'Third' });
    cleanups.push(c3Cleanup);
    expect(c1.number).toBe(1);
    expect(c2.number).toBe(2);
    expect(c3.number).toBe(3);
  });

  test('GET /cards/[id] returns a composite key "PROJECTKEY-N"', async ({ clientApi }) => {
    const { project, columns, cleanup: projCleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(projCleanup);
    const { card, cleanup: cardCleanup } = await createTestKanbanCard(clientApi, columns[0].id);
    cleanups.push(cardCleanup);

    const res = await clientApi.get(`/api/portal/cards/${card.id}`);
    expect(res.status).toBe(200);
    expect(res.data.data.card.key).toBe(`${project.projectKey}-${card.number}`);
    expect(res.data.data.card.projectKey).toBe(project.projectKey);
  });

  test('creating a card logs card.created activity', async ({ clientApi }) => {
    const { columns, cleanup: projCleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(projCleanup);
    const { card, cleanup: cardCleanup } = await createTestKanbanCard(clientApi, columns[0].id, { title: 'Activity Test' });
    cleanups.push(cardCleanup);

    const res = await clientApi.get(`/api/portal/cards/${card.id}`);
    const activities = res.data.data.activities as Array<{ type: string; payload: { title?: string } }>;
    expect(activities.some(a => a.type === 'card.created')).toBe(true);
  });

  test('changing priority logs card.priority_changed with before/after', async ({ clientApi }) => {
    const { columns, cleanup: projCleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(projCleanup);
    const { card, cleanup: cardCleanup } = await createTestKanbanCard(clientApi, columns[0].id, { priority: 'medium' });
    cleanups.push(cardCleanup);

    const patchRes = await clientApi.patch(`/api/portal/cards/${card.id}`, { priority: 'urgent' });
    expect(patchRes.status).toBe(200);

    const res = await clientApi.get(`/api/portal/cards/${card.id}`);
    const activities = res.data.data.activities as Array<{ type: string; payload: Record<string, unknown> }>;
    const change = activities.find(a => a.type === 'card.priority_changed');
    expect(change).toBeDefined();
    expect(change!.payload.from).toBe('medium');
    expect(change!.payload.to).toBe('urgent');
  });

  test('project status can be changed via PATCH /projects/[id]', async ({ clientApi }) => {
    const { project, cleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(cleanup);
    expect(project.status).toBe('active');

    const paused = await clientApi.patch(`/api/portal/projects/${project.id}`, { status: 'paused' });
    expect(paused.status).toBe(200);
    expect(paused.data.data.status).toBe('paused');

    const resumed = await clientApi.patch(`/api/portal/projects/${project.id}`, { status: 'active' });
    expect(resumed.status).toBe(200);
    expect(resumed.data.data.status).toBe('active');
  });

  test('project description can be edited', async ({ clientApi }) => {
    const { project, cleanup } = await createTestKanbanProject(clientApi, { description: 'initial' });
    cleanups.push(cleanup);

    const res = await clientApi.patch(`/api/portal/projects/${project.id}`, {
      description: '# Heading\n\n- bullet one\n- bullet two',
    });
    expect(res.status).toBe(200);
    expect(res.data.data.description).toContain('# Heading');
  });
});
