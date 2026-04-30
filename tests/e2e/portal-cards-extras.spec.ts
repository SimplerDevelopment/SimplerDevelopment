/**
 * Portal Cards — Extras
 *
 * Fills gaps not covered by pm-checklist / pm-dependencies / pm-webhooks /
 * portal-kanban-cards specs:
 *   - cards/[id]/time-logs (POST)        — auth/role/note-optional + surfacing in card GET
 *   - cards/[id]/dependencies (POST/DEL) — auth + bad input on DELETE
 *   - cards/[id]/watch (POST/DELETE)     — start/stop watching, idempotency, auth
 *   - cards/[id]/unsubscribe (GET)       — public token-based; verifies bad-token paths
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestKanbanProject, createTestKanbanCard } from './setup/helpers';

test.describe('Portal Cards Time Logs — extras @cards @time-logs', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.afterEach(async () => { await runCleanups(cleanups); cleanups = []; });

  test('POST /cards/:id/time-logs rejects unauthenticated', async ({ unauthApi, clientApi }) => {
    const { columns, cleanup: pc } = await createTestKanbanProject(clientApi);
    cleanups.push(pc);
    const { card, cleanup: cc } = await createTestKanbanCard(clientApi, columns[0].id);
    cleanups.push(cc);

    const res = await unauthApi.post(`/api/portal/cards/${card.id}/time-logs`, { minutes: 5 });
    expect(res.status).toBe(401);
  });

  test('POST /cards/:id/time-logs allows missing note (note is optional)', async ({ adminApi, clientApi }) => {
    const { columns, cleanup: pc } = await createTestKanbanProject(clientApi);
    cleanups.push(pc);
    const { card, cleanup: cc } = await createTestKanbanCard(clientApi, columns[0].id);
    cleanups.push(cc);

    const res = await adminApi.post(`/api/portal/cards/${card.id}/time-logs`, { minutes: 12 });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.minutes).toBe(12);
    expect(res.data.data.note).toBeNull();
  });

  test('time logs surface in card GET payload (staff sees them)', async ({ adminApi, clientApi }) => {
    const { columns, cleanup: pc } = await createTestKanbanProject(clientApi);
    cleanups.push(pc);
    const { card, cleanup: cc } = await createTestKanbanCard(clientApi, columns[0].id);
    cleanups.push(cc);

    await adminApi.post(`/api/portal/cards/${card.id}/time-logs`, { minutes: 7, note: 'extras-spec' });
    await adminApi.post(`/api/portal/cards/${card.id}/time-logs`, { minutes: 11, note: 'extras-spec-2' });

    const get = await adminApi.get(`/api/portal/cards/${card.id}`);
    expect(get.status).toBe(200);
    const logs = get.data.data.timeLogs as Array<{ minutes: number; note: string | null }>;
    expect(Array.isArray(logs)).toBe(true);
    expect(logs.length).toBeGreaterThanOrEqual(2);
    const minutes = logs.map(l => l.minutes);
    expect(minutes).toEqual(expect.arrayContaining([7, 11]));
  });
});

test.describe('Portal Cards Dependencies — extras @cards @dependencies', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.afterEach(async () => { await runCleanups(cleanups); cleanups = []; });

  test('POST /cards/:id/dependencies rejects unauthenticated', async ({ unauthApi, clientApi }) => {
    const { columns, cleanup: pc } = await createTestKanbanProject(clientApi);
    cleanups.push(pc);
    const { card, cleanup: cc } = await createTestKanbanCard(clientApi, columns[0].id);
    cleanups.push(cc);

    const res = await unauthApi.post(`/api/portal/cards/${card.id}/dependencies`, { blockerCardId: 1 });
    expect(res.status).toBe(401);
  });

  test('DELETE /cards/:id/dependencies rejects missing blockerCardId query param', async ({ clientApi }) => {
    const { columns, cleanup: pc } = await createTestKanbanProject(clientApi);
    cleanups.push(pc);
    const { card, cleanup: cc } = await createTestKanbanCard(clientApi, columns[0].id);
    cleanups.push(cc);

    const res = await clientApi.delete(`/api/portal/cards/${card.id}/dependencies`);
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('POST /cards/:id/dependencies returns 404 for non-existent card', async ({ clientApi }) => {
    const res = await clientApi.post(`/api/portal/cards/999999999/dependencies`, { blockerCardId: 1 });
    expect(res.status).toBe(404);
  });

  test('POST /cards/:id/dependencies rejects non-numeric blockerCardId', async ({ clientApi }) => {
    const { columns, cleanup: pc } = await createTestKanbanProject(clientApi);
    cleanups.push(pc);
    const { card, cleanup: cc } = await createTestKanbanCard(clientApi, columns[0].id);
    cleanups.push(cc);

    const res = await clientApi.post(`/api/portal/cards/${card.id}/dependencies`, { blockerCardId: 'not-a-number' as unknown as number });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });
});

test.describe('Portal Cards Watch @cards @watch', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.afterEach(async () => { await runCleanups(cleanups); cleanups = []; });

  test('POST /cards/:id/watch starts watching and is idempotent', async ({ clientApi }) => {
    const { columns, cleanup: pc } = await createTestKanbanProject(clientApi);
    cleanups.push(pc);
    const { card, cleanup: cc } = await createTestKanbanCard(clientApi, columns[0].id);
    cleanups.push(cc);

    const first = await clientApi.post(`/api/portal/cards/${card.id}/watch`);
    expect(first.status).toBe(200);
    expect(first.data.success).toBe(true);
    expect(first.data.watching).toBe(true);

    // Re-posting must not error (onConflictDoNothing in handler)
    const second = await clientApi.post(`/api/portal/cards/${card.id}/watch`);
    expect(second.status).toBe(200);
    expect(second.data.watching).toBe(true);

    const get = await clientApi.get(`/api/portal/cards/${card.id}`);
    expect(get.data.data.watching).toBe(true);
  });

  test('DELETE /cards/:id/watch stops watching', async ({ clientApi }) => {
    const { columns, cleanup: pc } = await createTestKanbanProject(clientApi);
    cleanups.push(pc);
    const { card, cleanup: cc } = await createTestKanbanCard(clientApi, columns[0].id);
    cleanups.push(cc);

    await clientApi.post(`/api/portal/cards/${card.id}/watch`);
    const off = await clientApi.delete(`/api/portal/cards/${card.id}/watch`);
    expect(off.status).toBe(200);
    expect(off.data.watching).toBe(false);

    const get = await clientApi.get(`/api/portal/cards/${card.id}`);
    expect(get.data.data.watching).toBe(false);
  });

  test('POST /cards/:id/watch rejects unauthenticated', async ({ unauthApi, clientApi }) => {
    const { columns, cleanup: pc } = await createTestKanbanProject(clientApi);
    cleanups.push(pc);
    const { card, cleanup: cc } = await createTestKanbanCard(clientApi, columns[0].id);
    cleanups.push(cc);

    const res = await unauthApi.post(`/api/portal/cards/${card.id}/watch`);
    expect(res.status).toBe(401);
  });

  test('POST /cards/:id/watch returns 404 for non-existent card', async ({ clientApi }) => {
    const res = await clientApi.post(`/api/portal/cards/999999999/watch`);
    expect(res.status).toBe(404);
  });
});

test.describe('Portal Cards Unsubscribe (public token) @cards @unsubscribe', () => {
  // The unsubscribe endpoint is GET-only, public, and HMAC-token-authenticated.
  // It returns text/html — not the JSON envelope — so we assert on status codes only.
  let cleanups: Array<() => Promise<void>> = [];
  test.afterEach(async () => { await runCleanups(cleanups); cleanups = []; });

  test('GET /cards/:id/unsubscribe rejects missing token / userId with 400', async ({ unauthApi, clientApi }) => {
    const { columns, cleanup: pc } = await createTestKanbanProject(clientApi);
    cleanups.push(pc);
    const { card, cleanup: cc } = await createTestKanbanCard(clientApi, columns[0].id);
    cleanups.push(cc);

    const res = await unauthApi.get(`/api/portal/cards/${card.id}/unsubscribe`);
    expect(res.status).toBe(400);
  });

  test('GET /cards/:id/unsubscribe rejects bogus token with 403', async ({ unauthApi, clientApi }) => {
    const { columns, cleanup: pc } = await createTestKanbanProject(clientApi);
    cleanups.push(pc);
    const { card, cleanup: cc } = await createTestKanbanCard(clientApi, columns[0].id);
    cleanups.push(cc);

    // Token must be valid hex of the right length (32 chars) to even reach the
    // verify step — anything shorter still hits the verify path and returns 403.
    const res = await unauthApi.get(`/api/portal/cards/${card.id}/unsubscribe?u=1&t=${'0'.repeat(32)}`);
    expect(res.status).toBe(403);
  });

  test('GET /cards/:id/unsubscribe rejects non-numeric userId with 400', async ({ unauthApi, clientApi }) => {
    const { columns, cleanup: pc } = await createTestKanbanProject(clientApi);
    cleanups.push(pc);
    const { card, cleanup: cc } = await createTestKanbanCard(clientApi, columns[0].id);
    cleanups.push(cc);

    const res = await unauthApi.get(`/api/portal/cards/${card.id}/unsubscribe?u=abc&t=deadbeef`);
    expect(res.status).toBe(400);
  });
});
