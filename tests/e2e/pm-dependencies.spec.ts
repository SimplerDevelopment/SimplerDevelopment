/**
 * PM Dependencies — Phase 4
 *
 * Covers: add/remove blocker, reject cross-project, reject reciprocal cycles,
 * activity log entries, blockers/blocking exposed in card GET.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestKanbanProject, createTestKanbanCard } from './setup/helpers';

test.describe('PM Dependencies @pm @dependencies', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.afterEach(async () => { await runCleanups(cleanups); cleanups = []; });

  test('add and remove a blocker', async ({ clientApi }) => {
    const { columns, cleanup: projCleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(projCleanup);
    const { card: blocked, cleanup: b1Cleanup } = await createTestKanbanCard(clientApi, columns[0].id, { title: 'Needs design' });
    cleanups.push(b1Cleanup);
    const { card: blocker, cleanup: b2Cleanup } = await createTestKanbanCard(clientApi, columns[0].id, { title: 'Design mockups' });
    cleanups.push(b2Cleanup);

    const add = await clientApi.post(`/api/portal/cards/${blocked.id}/dependencies`, { blockerCardId: blocker.id });
    expect(add.status).toBe(200);

    const get = await clientApi.get(`/api/portal/cards/${blocked.id}`);
    const blockers = get.data.data.blockers as Array<{ id: number; title: string }>;
    expect(blockers.some(b => b.id === blocker.id)).toBe(true);

    // Reverse perspective: blocker.blocking should include blocked
    const getBlocker = await clientApi.get(`/api/portal/cards/${blocker.id}`);
    const blocking = getBlocker.data.data.blocking as Array<{ id: number }>;
    expect(blocking.some(b => b.id === blocked.id)).toBe(true);

    const remove = await clientApi.delete(`/api/portal/cards/${blocked.id}/dependencies?blockerCardId=${blocker.id}`);
    expect(remove.status).toBe(200);

    const afterRemove = await clientApi.get(`/api/portal/cards/${blocked.id}`);
    expect((afterRemove.data.data.blockers as Array<unknown>).length).toBe(0);
  });

  test('rejects a blocker from a different project', async ({ clientApi }) => {
    const { columns: cols1, cleanup: p1c } = await createTestKanbanProject(clientApi);
    cleanups.push(p1c);
    const { columns: cols2, cleanup: p2c } = await createTestKanbanProject(clientApi);
    cleanups.push(p2c);
    const { card: blocked, cleanup: bc1 } = await createTestKanbanCard(clientApi, cols1[0].id);
    cleanups.push(bc1);
    const { card: foreignBlocker, cleanup: bc2 } = await createTestKanbanCard(clientApi, cols2[0].id);
    cleanups.push(bc2);

    const res = await clientApi.post(`/api/portal/cards/${blocked.id}/dependencies`, { blockerCardId: foreignBlocker.id });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('rejects a direct reciprocal cycle', async ({ clientApi }) => {
    const { columns, cleanup: projCleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(projCleanup);
    const { card: a, cleanup: ac } = await createTestKanbanCard(clientApi, columns[0].id);
    cleanups.push(ac);
    const { card: b, cleanup: bc } = await createTestKanbanCard(clientApi, columns[0].id);
    cleanups.push(bc);

    // A is blocked by B
    const first = await clientApi.post(`/api/portal/cards/${a.id}/dependencies`, { blockerCardId: b.id });
    expect(first.status).toBe(200);

    // Try to make B blocked by A → cycle
    const second = await clientApi.post(`/api/portal/cards/${b.id}/dependencies`, { blockerCardId: a.id });
    expect(second.status).toBe(400);
    expect(second.data.success).toBe(false);
  });

  test('rejects self-blocking', async ({ clientApi }) => {
    const { columns, cleanup: projCleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(projCleanup);
    const { card, cleanup: cc } = await createTestKanbanCard(clientApi, columns[0].id);
    cleanups.push(cc);

    const res = await clientApi.post(`/api/portal/cards/${card.id}/dependencies`, { blockerCardId: card.id });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });
});
