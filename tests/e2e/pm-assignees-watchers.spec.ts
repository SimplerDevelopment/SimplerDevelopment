/**
 * PM Assignees + Watchers — Phase 2
 *
 * Covers: multi-assignee endpoints, watcher toggle, auto-watch on assign,
 * activity log entries, unsubscribe token endpoint.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestKanbanProject, createTestKanbanCard } from './setup/helpers';

test.describe('PM Assignees + Watchers @pm @assignees @watchers', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.afterEach(async () => { await runCleanups(cleanups); cleanups = []; });

  test('assigning a user auto-adds them as watcher', async ({ clientApi }) => {
    const { columns, cleanup: projCleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(projCleanup);
    const { card, cleanup: cardCleanup } = await createTestKanbanCard(clientApi, columns[0].id);
    cleanups.push(cardCleanup);

    const mentionable = await clientApi.get('/api/portal/mentionable-users');
    if (!mentionable.data?.data?.length) {
      test.skip();
      return;
    }
    const userId = mentionable.data.data[0].id;

    const assign = await clientApi.post(`/api/portal/cards/${card.id}/assignees`, { userId });
    expect(assign.status).toBe(200);

    const get = await clientApi.get(`/api/portal/cards/${card.id}`);
    expect((get.data.data.assignees as Array<{ id: number }>).some(a => a.id === userId)).toBe(true);
    expect((get.data.data.watcherIds as number[]).includes(userId)).toBe(true);
  });

  test('unassigning logs activity and removes from list', async ({ clientApi }) => {
    const { columns, cleanup: projCleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(projCleanup);
    const { card, cleanup: cardCleanup } = await createTestKanbanCard(clientApi, columns[0].id);
    cleanups.push(cardCleanup);

    const mentionable = await clientApi.get('/api/portal/mentionable-users');
    if (!mentionable.data?.data?.length) { test.skip(); return; }
    const userId = mentionable.data.data[0].id;

    await clientApi.post(`/api/portal/cards/${card.id}/assignees`, { userId });
    const unassign = await clientApi.delete(`/api/portal/cards/${card.id}/assignees?userId=${userId}`);
    expect(unassign.status).toBe(200);

    const get = await clientApi.get(`/api/portal/cards/${card.id}`);
    expect((get.data.data.assignees as Array<{ id: number }>).some(a => a.id === userId)).toBe(false);
    const types = (get.data.data.activities as Array<{ type: string }>).map(a => a.type);
    expect(types).toContain('card.assignee_added');
    expect(types).toContain('card.assignee_removed');
  });

  test('self watch toggle adds and removes from watcherIds', async ({ clientApi }) => {
    const { columns, cleanup: projCleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(projCleanup);
    const { card, cleanup: cardCleanup } = await createTestKanbanCard(clientApi, columns[0].id);
    cleanups.push(cardCleanup);

    // Creator auto-watches: remove self first to have a clean baseline
    await clientApi.delete(`/api/portal/cards/${card.id}/watch`);
    let get = await clientApi.get(`/api/portal/cards/${card.id}`);
    expect(get.data.data.watching).toBe(false);

    const subscribe = await clientApi.post(`/api/portal/cards/${card.id}/watch`);
    expect(subscribe.status).toBe(200);
    expect(subscribe.data.watching).toBe(true);

    get = await clientApi.get(`/api/portal/cards/${card.id}`);
    expect(get.data.data.watching).toBe(true);

    const unsubscribe = await clientApi.delete(`/api/portal/cards/${card.id}/watch`);
    expect(unsubscribe.data.watching).toBe(false);
  });

  test('unsubscribe endpoint rejects invalid token', async ({ clientApi }) => {
    const { columns, cleanup: projCleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(projCleanup);
    const { card, cleanup: cardCleanup } = await createTestKanbanCard(clientApi, columns[0].id);
    cleanups.push(cardCleanup);

    const res = await clientApi.get(`/api/portal/cards/${card.id}/unsubscribe?u=1&t=notarealhmac`);
    expect(res.status).toBe(403);
  });
});
