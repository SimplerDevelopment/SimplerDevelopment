/**
 * Realtime collaboration API E2E.
 *
 * Covers the HTTP surface of the realtime layer end-to-end (auth-token
 * issuance + the document-comments CRUD). The websocket-level CRDT sync is
 * exercised by unit tests in `tests/unit/realtime-doc-model.test.ts` and
 * `tests/unit/realtime-internal-publisher.test.ts`; running a full
 * two-tab joint-edit test requires booting `packages/realtime-server`
 * alongside the Next.js dev server, which the e2e harness does not do.
 */
import { test, expect } from './setup/fixtures';
import {
  runCleanups,
  createTestWebsite,
  createTestPost,
} from './setup/helpers';

test.describe.configure({ mode: 'serial' });

test.describe('Realtime collaboration @collab @realtime @critical', () => {
  let cleanups: Array<() => Promise<void>> = [];
  let siteId: number;
  let postId: number;

  test('setup: create website + post', async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    siteId = website.id;
    const { post, cleanup } = await createTestPost(clientApi, siteId);
    postId = post.id;
    cleanups.push(cleanup);
  });

  test.afterAll(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('POST /api/realtime/token issues a JWT for an accessible post', async ({
    clientApi,
  }) => {
    const res = await clientApi.post('/api/realtime/token', {
      entityType: 'post',
      entityId: postId,
    });
    expect(res.data?.success).toBe(true);
    const data = res.data!.data as {
      token: string;
      wsUrl: string;
      expiresAt: number;
    };
    expect(typeof data.token).toBe('string');
    expect(data.token.split('.').length).toBe(3); // JWT = three dot-separated parts
    expect(typeof data.wsUrl).toBe('string');
    expect(data.wsUrl.startsWith('ws')).toBe(true);
    expect(data.expiresAt).toBeGreaterThan(Date.now());
  });

  test('POST /api/realtime/token rejects unknown entity', async ({
    clientApi,
  }) => {
    const res = await clientApi.post('/api/realtime/token', {
      entityType: 'post',
      entityId: 999999999,
    });
    expect(res.status).toBe(404);
    expect(res.data?.success).toBe(false);
  });

  test('POST /api/realtime/token rejects invalid entityType', async ({
    clientApi,
  }) => {
    const res = await clientApi.post('/api/realtime/token', {
      entityType: 'banana',
      entityId: postId,
    });
    expect(res.status).toBe(400);
    expect(res.data?.success).toBe(false);
  });

  test('comments: list is initially empty', async ({ clientApi }) => {
    const res = await clientApi.get(
      `/api/portal/realtime/comments?entityType=post&entityId=${postId}`,
    );
    expect(res.data?.success).toBe(true);
    expect(Array.isArray(res.data!.data)).toBe(true);
    expect((res.data!.data as unknown[]).length).toBe(0);
  });

  let threadId: string;

  test('comments: POST creates a thread root', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/realtime/comments', {
      entityType: 'post',
      entityId: String(postId),
      body: 'First thought on the headline',
      anchor: { blockId: 'hero-1' },
    });
    expect(res.data?.success).toBe(true);
    const row = res.data!.data as {
      id: string;
      threadId: string;
      parentId: string | null;
      body: string;
      anchor: { blockId?: string } | null;
    };
    expect(row.id).toBe(row.threadId); // root comment: id === threadId
    expect(row.parentId).toBe(null);
    expect(row.body).toBe('First thought on the headline');
    expect(row.anchor?.blockId).toBe('hero-1');
    threadId = row.threadId;
  });

  test('comments: POST a reply with threadId', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/realtime/comments', {
      entityType: 'post',
      entityId: String(postId),
      body: 'Agreed — let me try a variation',
      threadId,
    });
    expect(res.data?.success).toBe(true);
    const reply = res.data!.data as {
      id: string;
      threadId: string;
      parentId: string | null;
    };
    expect(reply.threadId).toBe(threadId);
    expect(reply.id).not.toBe(threadId);
  });

  test('comments: GET lists thread + reply', async ({ clientApi }) => {
    const res = await clientApi.get(
      `/api/portal/realtime/comments?entityType=post&entityId=${postId}`,
    );
    expect(res.data?.success).toBe(true);
    const rows = res.data!.data as Array<{ threadId: string; body: string }>;
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.threadId === threadId)).toBe(true);
  });

  test('comments: PATCH resolves the thread', async ({ clientApi }) => {
    // Resolve via the thread root id (parentId === null is the root).
    const res = await clientApi.patch(
      `/api/portal/realtime/comments/${threadId}`,
      { resolved: true },
    );
    // Either success or a 200 OK with the updated row — accept either shape
    // depending on the route's handler signature.
    expect(res.status === 200 || res.status === 204).toBe(true);
  });

  test('comments: rejects POST with missing body', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/realtime/comments', {
      entityType: 'post',
      entityId: String(postId),
      body: '',
    });
    expect(res.status).toBe(400);
    expect(res.data?.success).toBe(false);
  });

  test('comments: rejects bogus entityType', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/realtime/comments', {
      entityType: 'banana',
      entityId: String(postId),
      body: 'nope',
    });
    expect(res.status).toBe(400);
    expect(res.data?.success).toBe(false);
  });
});
