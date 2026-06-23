/**
 * PM Labels — Phase 1
 *
 * Covers: project label CRUD, attach/detach to cards, same-project validation,
 * activity log entries for label_added / label_removed.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestKanbanProject, createTestKanbanCard } from './setup/helpers';

test.describe('PM Labels @pm @labels', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.afterEach(async () => { await runCleanups(cleanups); cleanups = []; });

  test('create, list, update, delete a project label', async ({ clientApi }) => {
    const { project, cleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(cleanup);

    const create = await clientApi.post(`/api/portal/projects/${project.id}/labels`, {
      name: 'urgent-triage',
      color: '#ef4444',
    });
    expect(create.status).toBe(201);
    expect(create.data.data).toMatchObject({ name: 'urgent-triage', color: '#ef4444', projectId: project.id });
    const labelId = create.data.data.id;

    const list = await clientApi.get(`/api/portal/projects/${project.id}/labels`);
    expect(list.status).toBe(200);
    expect(list.data.data.some((l: { id: number }) => l.id === labelId)).toBe(true);

    const patch = await clientApi.patch(`/api/portal/labels/${labelId}`, { name: 'renamed', color: '#10b981' });
    expect(patch.status).toBe(200);
    expect(patch.data.data.name).toBe('renamed');
    expect(patch.data.data.color).toBe('#10b981');

    const del = await clientApi.delete(`/api/portal/labels/${labelId}`);
    expect(del.status).toBe(200);
  });

  test('attach label to card renders in card GET and logs activity', async ({ clientApi }) => {
    const { project, columns, cleanup: projCleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(projCleanup);
    const { card, cleanup: cardCleanup } = await createTestKanbanCard(clientApi, columns[0].id);
    cleanups.push(cardCleanup);

    const labelRes = await clientApi.post(`/api/portal/projects/${project.id}/labels`, {
      name: 'bug', color: '#ef4444',
    });
    const labelId = labelRes.data.data.id;

    const attach = await clientApi.post(`/api/portal/cards/${card.id}/labels`, { labelId });
    expect(attach.status).toBe(200);

    const get = await clientApi.get(`/api/portal/cards/${card.id}`);
    expect(get.data.data.labels.some((l: { id: number }) => l.id === labelId)).toBe(true);
    const activities = get.data.data.activities as Array<{ type: string; payload: Record<string, unknown> }>;
    expect(activities.some(a => a.type === 'card.label_added' && a.payload.labelId === labelId)).toBe(true);

    const detach = await clientApi.delete(`/api/portal/cards/${card.id}/labels?labelId=${labelId}`);
    expect(detach.status).toBe(200);

    const afterDetach = await clientApi.get(`/api/portal/cards/${card.id}`);
    expect(afterDetach.data.data.labels.length).toBe(0);
    const detachActs = afterDetach.data.data.activities as Array<{ type: string }>;
    expect(detachActs.some(a => a.type === 'card.label_removed')).toBe(true);
  });

  test('attaching a label from a different project is rejected', async ({ clientApi }) => {
    const { project: p1, cleanup: p1c } = await createTestKanbanProject(clientApi);
    cleanups.push(p1c);
    const { project: p2, columns: p2cols, cleanup: p2c } = await createTestKanbanProject(clientApi);
    cleanups.push(p2c);
    const { card, cleanup: cardCleanup } = await createTestKanbanCard(clientApi, p2cols[0].id);
    cleanups.push(cardCleanup);

    const foreignLabel = await clientApi.post(`/api/portal/projects/${p1.id}/labels`, {
      name: 'foreign', color: '#6366f1',
    });

    const attach = await clientApi.post(`/api/portal/cards/${card.id}/labels`, { labelId: foreignLabel.data.data.id });
    expect(attach.status).toBe(400);
    expect(attach.data.success).toBe(false);
  });
});
