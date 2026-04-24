/**
 * PM My Tasks — Phase 3
 *
 * Covers: /api/portal/my-tasks lists cards assigned to the current user,
 * grouped by project, with the openOnly filter respected.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestKanbanProject, createTestKanbanCard } from './setup/helpers';

test.describe('PM My Tasks @pm @my-tasks', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.afterEach(async () => { await runCleanups(cleanups); cleanups = []; });

  test('returns empty list when nothing is assigned', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/my-tasks');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.data.projects)).toBe(true);
  });

  test('returns cards assigned to me', async ({ clientApi }) => {
    const { columns, cleanup: projCleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(projCleanup);
    const { card, cleanup: cardCleanup } = await createTestKanbanCard(clientApi, columns[0].id, { title: 'Assigned to me' });
    cleanups.push(cardCleanup);

    // Assign to myself (the fixture's "me")
    const session = await clientApi.get('/api/auth/session');
    const meId = parseInt(session.data?.user?.id ?? '0', 10);
    if (!meId) { test.skip(); return; }

    await clientApi.post(`/api/portal/cards/${card.id}/assignees`, { userId: meId });

    const res = await clientApi.get('/api/portal/my-tasks?openOnly=0');
    expect(res.status).toBe(200);
    const allCardIds = (res.data.data.projects as Array<{ cards: Array<{ id: number }> }>)
      .flatMap(p => p.cards.map(c => c.id));
    expect(allCardIds).toContain(card.id);
  });

  test('openOnly=1 excludes cards in Done columns', async ({ clientApi }) => {
    const { project, columns, cleanup: projCleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(projCleanup);

    // Flag column[3] as the Done column
    await clientApi.patch(`/api/portal/projects/${project.id}/columns/${columns[3].id}`, { isDone: true });

    const { card, cleanup: cardCleanup } = await createTestKanbanCard(clientApi, columns[3].id, { title: 'Done-state' });
    cleanups.push(cardCleanup);

    const session = await clientApi.get('/api/auth/session');
    const meId = parseInt(session.data?.user?.id ?? '0', 10);
    if (!meId) { test.skip(); return; }

    await clientApi.post(`/api/portal/cards/${card.id}/assignees`, { userId: meId });

    const open = await clientApi.get('/api/portal/my-tasks?openOnly=1');
    const openIds = (open.data.data.projects as Array<{ cards: Array<{ id: number }> }>)
      .flatMap(p => p.cards.map(c => c.id));
    expect(openIds).not.toContain(card.id);

    const all = await clientApi.get('/api/portal/my-tasks?openOnly=0');
    const allIds = (all.data.data.projects as Array<{ cards: Array<{ id: number }> }>)
      .flatMap(p => p.cards.map(c => c.id));
    expect(allIds).toContain(card.id);
  });
});
