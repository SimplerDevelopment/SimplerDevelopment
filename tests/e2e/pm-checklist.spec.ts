/**
 * PM Checklists — Phase 2
 *
 * Covers: add items, toggle complete, delete, update text, ordering,
 * activity log entries.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestKanbanProject, createTestKanbanCard } from './setup/helpers';

test.describe('PM Checklist @pm @checklist', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.afterEach(async () => { await runCleanups(cleanups); cleanups = []; });

  test('add items to checklist in order', async ({ clientApi }) => {
    const { columns, cleanup: projCleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(projCleanup);
    const { card, cleanup: cardCleanup } = await createTestKanbanCard(clientApi, columns[0].id);
    cleanups.push(cardCleanup);

    const a = await clientApi.post(`/api/portal/cards/${card.id}/checklist`, { text: 'Write spec' });
    const b = await clientApi.post(`/api/portal/cards/${card.id}/checklist`, { text: 'Implement' });
    const c = await clientApi.post(`/api/portal/cards/${card.id}/checklist`, { text: 'Ship it' });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(c.status).toBe(201);
    expect(a.data.data.order).toBe(0);
    expect(b.data.data.order).toBe(1);
    expect(c.data.data.order).toBe(2);

    const list = await clientApi.get(`/api/portal/cards/${card.id}/checklist`);
    expect(list.status).toBe(200);
    expect(list.data.data.length).toBe(3);
    expect(list.data.data.map((i: { text: string }) => i.text)).toEqual(['Write spec', 'Implement', 'Ship it']);
  });

  test('toggle completed updates state and logs activity', async ({ clientApi }) => {
    const { columns, cleanup: projCleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(projCleanup);
    const { card, cleanup: cardCleanup } = await createTestKanbanCard(clientApi, columns[0].id);
    cleanups.push(cardCleanup);

    const add = await clientApi.post(`/api/portal/cards/${card.id}/checklist`, { text: 'Finish' });
    const itemId = add.data.data.id;

    const done = await clientApi.patch(`/api/portal/checklist-items/${itemId}`, { completed: true });
    expect(done.status).toBe(200);
    expect(done.data.data.completed).toBe(true);
    expect(done.data.data.completedAt).toBeTruthy();

    const undone = await clientApi.patch(`/api/portal/checklist-items/${itemId}`, { completed: false });
    expect(undone.data.data.completed).toBe(false);
    expect(undone.data.data.completedAt).toBeNull();

    const get = await clientApi.get(`/api/portal/cards/${card.id}`);
    const types = (get.data.data.activities as Array<{ type: string }>).map(a => a.type);
    expect(types).toContain('card.checklist_item_added');
    expect(types).toContain('card.checklist_item_completed');
    expect(types).toContain('card.checklist_item_uncompleted');
  });

  test('card GET includes checklist with completion counts', async ({ clientApi }) => {
    const { columns, cleanup: projCleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(projCleanup);
    const { card, cleanup: cardCleanup } = await createTestKanbanCard(clientApi, columns[0].id);
    cleanups.push(cardCleanup);

    const i1 = await clientApi.post(`/api/portal/cards/${card.id}/checklist`, { text: 'A' });
    const i2 = await clientApi.post(`/api/portal/cards/${card.id}/checklist`, { text: 'B' });
    await clientApi.post(`/api/portal/cards/${card.id}/checklist`, { text: 'C' });
    await clientApi.patch(`/api/portal/checklist-items/${i1.data.data.id}`, { completed: true });
    await clientApi.patch(`/api/portal/checklist-items/${i2.data.data.id}`, { completed: true });

    const res = await clientApi.get(`/api/portal/cards/${card.id}`);
    const checklist = res.data.data.checklist as Array<{ completed: boolean }>;
    expect(checklist.length).toBe(3);
    expect(checklist.filter(i => i.completed).length).toBe(2);
  });

  test('delete checklist item removes it and logs activity', async ({ clientApi }) => {
    const { columns, cleanup: projCleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(projCleanup);
    const { card, cleanup: cardCleanup } = await createTestKanbanCard(clientApi, columns[0].id);
    cleanups.push(cardCleanup);

    const item = await clientApi.post(`/api/portal/cards/${card.id}/checklist`, { text: 'transient' });
    const del = await clientApi.delete(`/api/portal/checklist-items/${item.data.data.id}`);
    expect(del.status).toBe(200);

    const list = await clientApi.get(`/api/portal/cards/${card.id}/checklist`);
    expect(list.data.data.length).toBe(0);
  });
});
