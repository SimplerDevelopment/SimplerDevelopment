/**
 * PM Column Controls — Phases 3 & 4
 *
 * Covers: WIP limit set/clear, Done column toggle, single-done-per-project
 * enforcement.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestKanbanProject } from './setup/helpers';

test.describe('PM Column Controls @pm @columns', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.afterEach(async () => { await runCleanups(cleanups); cleanups = []; });

  test('set and clear a WIP limit on a column', async ({ clientApi }) => {
    const { project, columns, cleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(cleanup);
    const col = columns[1]; // In Progress

    const set = await clientApi.patch(`/api/portal/projects/${project.id}/columns/${col.id}`, { wipLimit: 3 });
    expect(set.status).toBe(200);
    expect(set.data.data.wipLimit).toBe(3);

    const clear = await clientApi.patch(`/api/portal/projects/${project.id}/columns/${col.id}`, { wipLimit: 0 });
    expect(clear.status).toBe(200);
    expect(clear.data.data.wipLimit).toBeNull();
  });

  test('marking a column as Done unsets is_done on other columns', async ({ clientApi }) => {
    const { project, columns, cleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(cleanup);

    // First flag column[3] (Done) as the done column
    const r1 = await clientApi.patch(`/api/portal/projects/${project.id}/columns/${columns[3].id}`, { isDone: true });
    expect(r1.status).toBe(200);
    expect(r1.data.data.isDone).toBe(true);

    // Then flip column[2] (Review) — should unset column[3]
    const r2 = await clientApi.patch(`/api/portal/projects/${project.id}/columns/${columns[2].id}`, { isDone: true });
    expect(r2.status).toBe(200);
    expect(r2.data.data.isDone).toBe(true);

    // Verify column[3] no longer marked
    const list = await clientApi.get(`/api/portal/projects/${project.id}/columns`);
    const col3 = (list.data.data as Array<{ id: number; isDone: boolean }>).find(c => c.id === columns[3].id);
    expect(col3?.isDone).toBe(false);
  });

  test('column rename works', async ({ clientApi }) => {
    const { project, columns, cleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(cleanup);

    const renamed = await clientApi.patch(`/api/portal/projects/${project.id}/columns/${columns[0].id}`, {
      name: 'Shortlist',
    });
    expect(renamed.status).toBe(200);
    expect(renamed.data.data.name).toBe('Shortlist');
  });
});
