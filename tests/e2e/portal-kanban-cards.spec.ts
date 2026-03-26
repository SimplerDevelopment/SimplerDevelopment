/**
 * Portal Kanban Cards API E2E Tests
 *
 * Tests for /api/portal/cards CRUD, comments, time logs, move
 * Card creation requires admin/employee role — uses adminApi.
 * Client read/comment tests use clientApi.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups } from './setup/helpers';

test.describe('Portal Kanban Cards @kanban @cards @critical', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('POST /cards creates a card (admin)', async ({ adminApi }) => {
    const columnId = await getFirstColumnId(adminApi);
    if (!columnId) { test.skip(); return; }

    const title = `Test Card ${Date.now()}`;
    const res = await adminApi.post('/api/portal/cards', {
      columnId,
      title,
      description: 'E2E test card',
      priority: 'high',
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.title).toBe(title);
    expect(res.data.data.priority).toBe('high');

    cleanups.push(async () => {
      await adminApi.delete(`/api/portal/cards/${res.data.data.id}`).catch(() => {});
    });
  });

  test('POST /cards rejects client role', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/cards', {
      columnId: 1,
      title: 'Should Fail',
    });
    expect(res.status).toBe(403);
  });

  test('POST /cards rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/cards', {
      columnId: 1,
      title: 'Should Fail',
    });
    expect(res.status).toBe(401);
  });

  test('POST /cards rejects missing title', async ({ adminApi }) => {
    const res = await adminApi.post('/api/portal/cards', {
      columnId: 1,
      title: '',
    });
    expect(res.status).toBe(400);
  });

  test('POST /cards rejects invalid column', async ({ adminApi }) => {
    const res = await adminApi.post('/api/portal/cards', {
      columnId: 999999,
      title: 'Invalid Column',
    });
    expect(res.status).toBe(404);
  });

  test('GET /cards/:id returns card details', async ({ adminApi }) => {
    const { cardId, cleanup } = await createTestCard(adminApi);
    cleanups.push(cleanup);

    const res = await adminApi.get(`/api/portal/cards/${cardId}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toHaveProperty('card');
    expect(res.data.data).toHaveProperty('comments');
    expect(res.data.data).toHaveProperty('files');
    expect(res.data.data.card.id).toBe(cardId);
  });

  test('PATCH /cards/:id updates a card', async ({ adminApi }) => {
    const { cardId, cleanup } = await createTestCard(adminApi);
    cleanups.push(cleanup);

    const res = await adminApi.patch(`/api/portal/cards/${cardId}`, {
      title: 'Updated Card Title',
      priority: 'urgent',
      description: 'Updated description',
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.title).toBe('Updated Card Title');
    expect(res.data.data.priority).toBe('urgent');
  });

  test('PATCH /cards/:id rejects client role', async ({ clientApi, adminApi }) => {
    const { cardId, cleanup } = await createTestCard(adminApi);
    cleanups.push(cleanup);

    const res = await clientApi.patch(`/api/portal/cards/${cardId}`, {
      title: 'Should Fail',
    });
    expect(res.status).toBe(403);
  });

  test('DELETE /cards/:id removes a card', async ({ adminApi }) => {
    const columnId = await getFirstColumnId(adminApi);
    if (!columnId) { test.skip(); return; }

    const create = await adminApi.post('/api/portal/cards', {
      columnId,
      title: `Delete Me ${Date.now()}`,
    });
    const cardId = create.data.data.id;

    const res = await adminApi.delete(`/api/portal/cards/${cardId}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });

  test('DELETE /cards/:id rejects client role', async ({ clientApi, adminApi }) => {
    const { cardId, cleanup } = await createTestCard(adminApi);
    cleanups.push(cleanup);

    const res = await clientApi.delete(`/api/portal/cards/${cardId}`);
    expect(res.status).toBe(403);
  });
});

test.describe('Portal Kanban Cards — Move @kanban @cards @move', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('PATCH /cards/:id/move moves card to new position', async ({ adminApi }) => {
    const { cardId, columnId, cleanup } = await createTestCard(adminApi);
    cleanups.push(cleanup);

    const res = await adminApi.patch(`/api/portal/cards/${cardId}/move`, {
      columnId,
      order: 0,
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });
});

test.describe('Portal Kanban Cards — Comments @kanban @cards @comments', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('POST /cards/:id/comments adds a comment', async ({ adminApi }) => {
    const { cardId, cleanup } = await createTestCard(adminApi);
    cleanups.push(cleanup);

    const res = await adminApi.post(`/api/portal/cards/${cardId}/comments`, {
      body: 'E2E test comment',
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.body).toBe('E2E test comment');
    expect(res.data.data).toHaveProperty('userName');
  });

  test('POST /cards/:id/comments rejects empty body without files', async ({ adminApi }) => {
    const { cardId, cleanup } = await createTestCard(adminApi);
    cleanups.push(cleanup);

    const res = await adminApi.post(`/api/portal/cards/${cardId}/comments`, {
      body: '',
    });
    expect(res.status).toBe(400);
  });

  test('DELETE /cards/:id/comments/:commentId removes a comment', async ({ adminApi }) => {
    const { cardId, cleanup } = await createTestCard(adminApi);
    cleanups.push(cleanup);

    const comment = await adminApi.post(`/api/portal/cards/${cardId}/comments`, {
      body: 'Delete this comment',
    });
    const commentId = comment.data.data.id;

    const res = await adminApi.delete(`/api/portal/cards/${cardId}/comments/${commentId}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });
});

test.describe('Portal Kanban Cards — Time Logs @kanban @cards @time-logs', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('POST /cards/:id/time-logs adds a time log', async ({ adminApi }) => {
    const { cardId, cleanup } = await createTestCard(adminApi);
    cleanups.push(cleanup);

    const res = await adminApi.post(`/api/portal/cards/${cardId}/time-logs`, {
      minutes: 90,
      note: 'Worked on feature implementation',
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.minutes).toBe(90);
    expect(res.data.data).toHaveProperty('userName');
  });

  test('POST /cards/:id/time-logs rejects invalid minutes', async ({ adminApi }) => {
    const { cardId, cleanup } = await createTestCard(adminApi);
    cleanups.push(cleanup);

    const res = await adminApi.post(`/api/portal/cards/${cardId}/time-logs`, {
      minutes: 0,
    });
    expect(res.status).toBe(400);
  });

  test('POST /cards/:id/time-logs rejects client role', async ({ clientApi, adminApi }) => {
    const { cardId, cleanup } = await createTestCard(adminApi);
    cleanups.push(cleanup);

    const res = await clientApi.post(`/api/portal/cards/${cardId}/time-logs`, {
      minutes: 30,
    });
    expect(res.status).toBe(403);
  });

  test('DELETE /cards/:id/time-logs/:logId removes a time log', async ({ adminApi }) => {
    const { cardId, cleanup } = await createTestCard(adminApi);
    cleanups.push(cleanup);

    const log = await adminApi.post(`/api/portal/cards/${cardId}/time-logs`, {
      minutes: 15,
      note: 'Delete this log',
    });
    const logId = log.data.data.id;

    const res = await adminApi.delete(`/api/portal/cards/${cardId}/time-logs/${logId}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });
});

// --- Helpers ---

async function getFirstColumnId(api: import('./setup/api-client').ApiClient): Promise<number | null> {
  const projects = await api.get('/api/portal/projects');
  if (!projects.data?.data?.length) return null;
  const projectId = projects.data.data[0].id;

  const columns = await api.get(`/api/portal/projects/${projectId}/columns`);
  if (!columns.data?.data?.length) return null;
  return columns.data.data[0].id;
}

async function createTestCard(api: import('./setup/api-client').ApiClient) {
  const columnId = await getFirstColumnId(api);
  if (!columnId) throw new Error('No project columns available for test');

  const title = `Test Card ${Date.now()}`;
  const res = await api.post('/api/portal/cards', {
    columnId,
    title,
    description: 'E2E test card',
  });
  if (!res.data?.success) throw new Error(`Failed to create test card: ${res.data?.message}`);
  const cardId = res.data.data.id;
  const cleanup = async () => {
    await api.delete(`/api/portal/cards/${cardId}`).catch(() => {});
  };
  return { cardId, columnId, cleanup };
}
