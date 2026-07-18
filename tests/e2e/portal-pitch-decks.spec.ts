/**
 * Portal Pitch Decks API E2E Tests
 *
 * Tests for /api/portal/tools/pitch-decks CRUD + versioning
 */
import { test, expect } from './setup/fixtures';
import { runCleanups } from './setup/helpers';

test.describe('Portal Pitch Decks @pitch-decks @critical', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('GET /pitch-decks lists decks for client', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/tools/pitch-decks');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('POST /pitch-decks creates a new deck', async ({ clientApi }) => {
    const title = `Test Deck ${Date.now()}`;
    const res = await clientApi.post('/api/portal/tools/pitch-decks', {
      title,
      description: 'E2E test pitch deck',
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.title).toBe(title);
    expect(res.data.data.id).toBeTruthy();

    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/tools/pitch-decks/${res.data.data.id}`).catch(() => {});
    });
  });

  test('POST /pitch-decks rejects missing title', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/tools/pitch-decks', {
      description: 'No title',
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('GET /pitch-decks/:id returns a single deck', async ({ clientApi }) => {
    const { id: deckId, cleanup } = await createTestDeck(clientApi);
    cleanups.push(cleanup);

    const res = await clientApi.get(`/api/portal/tools/pitch-decks/${deckId}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.id).toBe(deckId);
  });

  test('PATCH /pitch-decks/:id updates a deck', async ({ clientApi }) => {
    const { id: deckId, cleanup } = await createTestDeck(clientApi);
    cleanups.push(cleanup);

    const res = await clientApi.patch(`/api/portal/tools/pitch-decks/${deckId}`, {
      title: 'Updated Title',
      description: 'Updated description',
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.title).toBe('Updated Title');
  });

  test('DELETE /pitch-decks/:id removes a deck', async ({ clientApi }) => {
    const { id: deckId } = await createTestDeck(clientApi);

    const res = await clientApi.delete(`/api/portal/tools/pitch-decks/${deckId}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);

    // Verify it's gone
    const after = await clientApi.get(`/api/portal/tools/pitch-decks/${deckId}`);
    expect(after.status).toBe(404);
  });

  test('rejects unauthenticated access', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/tools/pitch-decks');
    expect(res.status).toBe(401);
  });
});

test.describe('Portal Pitch Deck Versions @pitch-decks @versions', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('POST /versions creates a version checkpoint', async ({ clientApi }) => {
    const { id: deckId, cleanup } = await createTestDeck(clientApi);
    cleanups.push(cleanup);

    const res = await clientApi.post(`/api/portal/tools/pitch-decks/${deckId}/versions`, {
      label: 'v1 checkpoint',
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.label).toBe('v1 checkpoint');
  });

  test('GET /versions lists all versions', async ({ clientApi }) => {
    const { id: deckId, cleanup } = await createTestDeck(clientApi);
    cleanups.push(cleanup);

    // Create a version
    await clientApi.post(`/api/portal/tools/pitch-decks/${deckId}/versions`, {
      label: 'test version',
    });

    const res = await clientApi.get(`/api/portal/tools/pitch-decks/${deckId}/versions`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
    expect(res.data.data.length).toBeGreaterThanOrEqual(1);
  });

  test('POST /versions/:vid/restore restores a version', async ({ clientApi }) => {
    const { id: deckId, cleanup } = await createTestDeck(clientApi);
    cleanups.push(cleanup);

    // Update deck slides
    await clientApi.patch(`/api/portal/tools/pitch-decks/${deckId}`, {
      slides: [{ id: 'slide-1', type: 'cover', headline: 'Original' }],
    });

    // Create version checkpoint
    const vRes = await clientApi.post(`/api/portal/tools/pitch-decks/${deckId}/versions`, {
      label: 'before changes',
    });
    const versionId = vRes.data.data.id;

    // Modify slides
    await clientApi.patch(`/api/portal/tools/pitch-decks/${deckId}`, {
      slides: [{ id: 'slide-1', type: 'cover', headline: 'Changed' }],
    });

    // Restore
    const restoreRes = await clientApi.post(
      `/api/portal/tools/pitch-decks/${deckId}/versions/${versionId}/restore`
    );
    expect(restoreRes.status).toBe(200);
    expect(restoreRes.data.success).toBe(true);
  });
});

// --- Helper ---

async function createTestDeck(api: import('./setup/api-client').ApiClient) {
  const title = `Test Deck ${Date.now()}`;
  const res = await api.post('/api/portal/tools/pitch-decks', {
    title,
    description: 'E2E test deck',
  });
  if (!res.data?.success) throw new Error(`Failed to create test deck: ${res.data?.message}`);
  const id = res.data.data.id;
  const cleanup = async () => {
    await api.delete(`/api/portal/tools/pitch-decks/${id}`).catch(() => {});
  };
  return { id, cleanup };
}
