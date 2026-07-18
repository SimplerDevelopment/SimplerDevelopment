/**
 * PM Move Card — card.column_changed + all-users-can-move rule
 *
 * Covers: any authenticated user with project visibility can move a card
 * between columns; cross-project moves are rejected; activity log records
 * column change.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestKanbanProject, createTestKanbanCard } from './setup/helpers';

test.describe('PM Move Card @pm @cards @drag', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.afterEach(async () => { await runCleanups(cleanups); cleanups = []; });

  test('move card to another column in the same project', async ({ clientApi }) => {
    const { columns, cleanup: projCleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(projCleanup);
    const { card, cleanup: cardCleanup } = await createTestKanbanCard(clientApi, columns[0].id);
    cleanups.push(cardCleanup);

    const move = await clientApi.patch(`/api/portal/cards/${card.id}/move`, {
      columnId: columns[2].id, order: 0,
    });
    expect(move.status).toBe(200);
    expect(move.data.data.columnId).toBe(columns[2].id);

    const get = await clientApi.get(`/api/portal/cards/${card.id}`);
    const types = (get.data.data.activities as Array<{ type: string }>).map(a => a.type);
    expect(types).toContain('card.column_changed');
  });

  test('cross-project moves are rejected', async ({ clientApi }) => {
    const { columns: cols1, cleanup: p1c } = await createTestKanbanProject(clientApi);
    cleanups.push(p1c);
    const { columns: cols2, cleanup: p2c } = await createTestKanbanProject(clientApi);
    cleanups.push(p2c);
    const { card, cleanup: cardCleanup } = await createTestKanbanCard(clientApi, cols1[0].id);
    cleanups.push(cardCleanup);

    const res = await clientApi.patch(`/api/portal/cards/${card.id}/move`, {
      columnId: cols2[0].id, order: 0,
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('unauthenticated move is rejected', async ({ clientApi, unauthApi }) => {
    const { columns, cleanup: projCleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(projCleanup);
    const { card, cleanup: cardCleanup } = await createTestKanbanCard(clientApi, columns[0].id);
    cleanups.push(cardCleanup);

    const res = await unauthApi.patch(`/api/portal/cards/${card.id}/move`, {
      columnId: columns[1].id, order: 0,
    });
    expect(res.status).toBe(401);
  });
});
