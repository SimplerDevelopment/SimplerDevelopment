/**
 * Portal Cards — Mutations Golden Path
 *
 * One consolidated end-to-end golden flow that exercises the full lifecycle of
 * mutations on a kanban card: comments, watchers, time-logs, checklist, labels,
 * move-between-columns. Each block creates the resource, mutates it, and tears
 * it down via the runCleanups stack — no shared state across blocks.
 *
 * Tagged @critical so it runs in the QA gate (`bun test:critical`).
 *
 * Companion to the integration-API tests in tests/integration/api/cards/.
 * Those pin per-route auth + cross-tenant; this spec proves the full HTTP stack
 * + auth cookies work together against the running dev server.
 */
import { test, expect } from './setup/fixtures';
import {
  runCleanups,
  createTestKanbanProject,
  createTestKanbanCard,
} from './setup/helpers';

test.describe('Portal Cards Mutations — golden path @cards @mutations @critical', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.afterEach(async () => { await runCleanups(cleanups); cleanups = []; });

  test('CARDS-full-lifecycle: comment → watcher → time-log → checklist → label → move', async ({ adminApi, clientApi }) => {
    // ── Setup: a project with 4 columns + a single card ──────────────────
    const { project, columns, cleanup: pc } = await createTestKanbanProject(clientApi);
    cleanups.push(pc);
    const { card, cleanup: cc } = await createTestKanbanCard(clientApi, columns[0].id, {
      title: `CARDS-mutation-card-${Date.now()}`,
    });
    cleanups.push(cc);

    // ── 1. Comments: add → delete ────────────────────────────────────────
    const addComment = await clientApi.post(`/api/portal/cards/${card.id}/comments`, {
      body: 'CARDS-comment-body',
    });
    expect(addComment.status).toBe(200);
    expect(addComment.data.success).toBe(true);
    const commentId = addComment.data.data.id;
    expect(typeof commentId).toBe('number');

    // (No PATCH route on comments today — this spec asserts current shape.)
    const delComment = await clientApi.delete(`/api/portal/cards/${card.id}/comments/${commentId}`);
    expect(delComment.status).toBe(200);

    // ── 2. Watcher: add → confirm via card GET → remove ──────────────────
    const watch = await clientApi.post(`/api/portal/cards/${card.id}/watch`);
    expect(watch.status).toBe(200);
    expect(watch.data.watching).toBe(true);

    const cardWithWatch = await clientApi.get(`/api/portal/cards/${card.id}`);
    expect(cardWithWatch.status).toBe(200);
    expect(cardWithWatch.data.data.watching).toBe(true);

    const unwatch = await clientApi.delete(`/api/portal/cards/${card.id}/watch`);
    expect(unwatch.status).toBe(200);
    expect(unwatch.data.watching).toBe(false);

    // ── 3. Time logs: staff-only — add 2 → verify in card GET → delete one ──
    const log1 = await adminApi.post(`/api/portal/cards/${card.id}/time-logs`, {
      minutes: 17,
      note: 'CARDS-time-log-1',
    });
    expect(log1.status).toBe(200);
    expect(log1.data.data.minutes).toBe(17);
    const log1Id = log1.data.data.id;

    const log2 = await adminApi.post(`/api/portal/cards/${card.id}/time-logs`, {
      minutes: 23,
      note: 'CARDS-time-log-2',
    });
    expect(log2.status).toBe(200);

    const cardWithLogs = await adminApi.get(`/api/portal/cards/${card.id}`);
    expect(cardWithLogs.status).toBe(200);
    const minutes = (cardWithLogs.data.data.timeLogs as Array<{ minutes: number }>).map(l => l.minutes);
    expect(minutes).toEqual(expect.arrayContaining([17, 23]));

    const delLog = await adminApi.delete(`/api/portal/cards/${card.id}/time-logs/${log1Id}`);
    expect(delLog.status).toBe(200);

    // Client must NOT be able to log time
    const clientLog = await clientApi.post(`/api/portal/cards/${card.id}/time-logs`, { minutes: 1 });
    expect(clientLog.status).toBe(403);

    // ── 4. Checklist: add 2 items → verify GET orders them → second add ─
    const item1 = await clientApi.post(`/api/portal/cards/${card.id}/checklist`, {
      text: 'CARDS-check-1',
    });
    expect(item1.status).toBe(201);
    expect(item1.data.data.order).toBe(0);

    const item2 = await clientApi.post(`/api/portal/cards/${card.id}/checklist`, {
      text: 'CARDS-check-2',
    });
    expect(item2.status).toBe(201);
    expect(item2.data.data.order).toBe(1);

    const checkList = await clientApi.get(`/api/portal/cards/${card.id}/checklist`);
    expect(checkList.status).toBe(200);
    const items = checkList.data.data as Array<{ text: string; order: number }>;
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items.map(i => i.text)).toEqual(expect.arrayContaining(['CARDS-check-1', 'CARDS-check-2']));

    // ── 5. Labels: create label on the project → attach → detach ─────────
    const label = await clientApi.post(`/api/portal/projects/${project.id}/labels`, {
      name: `CARDS-label-${Date.now()}`,
      color: '#ff5722',
    });
    if (label.status === 200 || label.status === 201) {
      const labelId = label.data.data.id;
      cleanups.push(async () => {
        await clientApi.delete(`/api/portal/projects/${project.id}/labels/${labelId}`).catch(() => {});
      });

      const attach = await clientApi.post(`/api/portal/cards/${card.id}/labels`, { labelId });
      expect(attach.status).toBe(200);
      expect(attach.data.success).toBe(true);

      const cardWithLabel = await clientApi.get(`/api/portal/cards/${card.id}`);
      const labelIds = (cardWithLabel.data.data.labels as Array<{ id: number }>).map(l => l.id);
      expect(labelIds).toContain(labelId);

      const detach = await clientApi.delete(`/api/portal/cards/${card.id}/labels?labelId=${labelId}`);
      expect(detach.status).toBe(200);
    }

    // ── 6. Move card from column[0] (Backlog) to column[2] (Review) ──────
    const move = await clientApi.patch(`/api/portal/cards/${card.id}/move`, {
      columnId: columns[2].id,
      order: 0,
    });
    expect(move.status).toBe(200);
    expect(move.data.success).toBe(true);
    expect(move.data.data.columnId).toBe(columns[2].id);

    // Confirm move via card GET
    const cardAfterMove = await clientApi.get(`/api/portal/cards/${card.id}`);
    expect(cardAfterMove.status).toBe(200);
    expect(cardAfterMove.data.data.card.columnId).toBe(columns[2].id);

    // ── Cleanup happens via the cleanups stack registered above ──────────
  });
});
