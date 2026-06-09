// @vitest-environment jsdom
/**
 * Unit tests for useComments hook.
 *
 * Transport: useCommentsRealtime (Yjs awareness-based) is mocked entirely.
 * fetch is mocked globally. useSession is stubbed with a fixed user id.
 *
 * Coverage targets:
 *   - initial fetch (success + error)
 *   - refresh clears error + re-fetches
 *   - createThread (optimistic add + server swap + rollback on error)
 *   - createThread validation (empty body)
 *   - reply (optimistic add + server swap + rollback on error)
 *   - reply validation (empty body + thread not found)
 *   - resolve / unresolve (optimistic patch + rollback on error)
 *   - deleteComment root (cascade removal + rollback)
 *   - deleteComment reply-only removal + rollback
 *   - deleteComment noop for unknown id
 *   - inbound realtime event triggers refresh
 *   - cleanup aborts in-flight request on unmount
 *   - groupIntoThreads sorting (roots + replies ordered asc)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { DocumentComment } from '@/lib/db/schema/collab';
import type { UseCommentsOptions } from '@/lib/realtime/use-comments';
import type { UseCommentsRealtimeApi } from '@/lib/realtime/comments-broadcast';

// ── Mocks ────────────────────────────────────────────────────────────────────

let capturedOnRemoteEvent: (() => void) | undefined;
// Broadcast spy — reassigned in beforeEach to survive restoreAllMocks.
const broadcastSpy = vi.fn();

vi.mock('@/lib/realtime/comments-broadcast', () => ({
  useCommentsRealtime: vi.fn(
    (opts: { onRemoteEvent: () => void }): UseCommentsRealtimeApi => {
      capturedOnRemoteEvent = opts.onRemoteEvent;
      // Return the module-level spy so tests can assert on it.
      return { broadcastEvent: broadcastSpy };
    }
  ),
}));

vi.mock('next-auth/react', () => ({
  useSession: vi.fn(() => ({
    data: { user: { id: '42' } },
    status: 'authenticated',
  })),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const BASE = '/api/portal/realtime/comments';

function makeComment(overrides: Partial<DocumentComment> = {}): DocumentComment {
  const now = new Date('2025-01-01T00:00:00Z');
  return {
    id: 'comment-1',
    clientId: 1,
    entityType: 'post',
    entityId: 'entity-a',
    threadId: 'comment-1',
    parentId: null,
    authorId: 42,
    body: 'Hello',
    mentionedUserIds: [],
    anchor: null,
    resolvedAt: null,
    resolvedBy: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function okResponse<T>(data: T): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errResponse(message: string, status = 400): Response {
  return new Response(JSON.stringify({ success: false, message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function defaultOpts(overrides: Partial<UseCommentsOptions> = {}): UseCommentsOptions {
  return { entityType: 'post', entityId: 'entity-a', ...overrides };
}

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  capturedOnRemoteEvent = undefined;
  broadcastSpy.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Import hook (after mocks are declared) ────────────────────────────────────

import { useComments } from '@/lib/realtime/use-comments';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useComments — initial fetch', () => {
  it('fetches comments on mount and groups into threads', async () => {
    const root = makeComment({ id: 'c1', threadId: 'c1', parentId: null });
    const reply = makeComment({
      id: 'c2',
      threadId: 'c1',
      parentId: 'c1',
      body: 'Reply',
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(okResponse([root, reply]));

    const { result } = renderHook(() => useComments(defaultOpts()));

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeNull();
    expect(result.current.threads).toHaveLength(1);
    expect(result.current.threads[0].root.id).toBe('c1');
    expect(result.current.threads[0].replies).toHaveLength(1);
    expect(result.current.threads[0].replies[0].id).toBe('c2');
    expect(result.current.threads[0].resolved).toBe(false);
  });

  it('sets error state when fetch fails with API error envelope', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      errResponse('Not authorised', 403)
    );

    const { result } = renderHook(() => useComments(defaultOpts()));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('Not authorised');
    expect(result.current.threads).toHaveLength(0);
  });

  it('sets error state when network throws', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network down'));

    const { result } = renderHook(() => useComments(defaultOpts()));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('Network down');
  });

  it('sets error when response body is not JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('not-json', { status: 200 })
    );

    const { result } = renderHook(() => useComments(defaultOpts()));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toMatch(/Bad response/);
  });

  it('passes entityType and entityId as query params', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(okResponse([]));

    renderHook(() => useComments({ entityType: 'deck', entityId: 'deck-99' }));

    await waitFor(() => expect(spy).toHaveBeenCalled());
    const url = spy.mock.calls[0][0] as string;
    expect(url).toContain('entityType=deck');
    expect(url).toContain('entityId=deck-99');
  });
});

describe('useComments — refresh', () => {
  it('refresh clears error and re-fetches', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(errResponse('first failure'))
      .mockResolvedValueOnce(okResponse([makeComment()]));

    const { result } = renderHook(() => useComments(defaultOpts()));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('first failure');

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.threads).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe('useComments — createThread', () => {
  it('adds optimistic row then swaps with server row', async () => {
    const serverComment = makeComment({ id: 'server-1', threadId: 'server-1', body: 'Hello' });

    // Use a deferred POST so we can observe the tmp row before resolution.
    let resolvePost!: (r: Response) => void;
    const postDeferred = new Promise<Response>((res) => { resolvePost = res; });

    vi.spyOn(globalThis, 'fetch')
      // initial fetch
      .mockResolvedValueOnce(okResponse([]))
      // createThread POST — held until we call resolvePost
      .mockReturnValueOnce(postDeferred);

    const { result } = renderHook(() => useComments(defaultOpts()));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let createPromise!: Promise<void>;
    act(() => {
      createPromise = result.current.createThread('Hello');
    });

    // Optimistic row should appear immediately (tmp: prefix) while POST is pending
    await waitFor(() => expect(result.current.threads).toHaveLength(1));
    expect(result.current.threads[0].root.id).toMatch(/^tmp:/);

    // Now resolve the POST
    await act(async () => {
      resolvePost(okResponse(serverComment));
      await createPromise;
    });

    // After server response, tmp row is replaced by server row
    expect(result.current.threads[0].root.id).toBe('server-1');
    expect(broadcastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'create', threadId: 'server-1' })
    );
  });

  it('rolls back optimistic row on fetch error', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(okResponse([]))
      .mockResolvedValueOnce(errResponse('Server error'));

    const { result } = renderHook(() => useComments(defaultOpts()));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.createThread('Hello')).rejects.toThrow('Server error');
    });

    expect(result.current.threads).toHaveLength(0);
  });

  it('throws immediately for empty body without calling fetch', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(okResponse([]));

    const { result } = renderHook(() => useComments(defaultOpts()));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const callsBefore = fetchSpy.mock.calls.length;

    await act(async () => {
      await expect(result.current.createThread('   ')).rejects.toThrow(
        'Comment body required'
      );
    });

    expect(fetchSpy.mock.calls.length).toBe(callsBefore);
  });
});

describe('useComments — reply', () => {
  it('adds optimistic reply then swaps with server row', async () => {
    const root = makeComment({ id: 'root-1', threadId: 'root-1' });
    const serverReply = makeComment({
      id: 'reply-server-1',
      threadId: 'root-1',
      parentId: 'root-1',
      body: 'A reply',
    });

    // Deferred POST so we can see the tmp row before resolution.
    let resolvePost!: (r: Response) => void;
    const postDeferred = new Promise<Response>((res) => { resolvePost = res; });

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(okResponse([root]))
      .mockReturnValueOnce(postDeferred);

    const { result } = renderHook(() => useComments(defaultOpts()));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let replyPromise!: Promise<void>;
    act(() => {
      replyPromise = result.current.reply('root-1', 'A reply');
    });

    // Optimistic reply visible while POST is pending
    await waitFor(() =>
      expect(result.current.threads[0].replies).toHaveLength(1)
    );
    expect(result.current.threads[0].replies[0].id).toMatch(/^tmp:/);

    // Resolve the POST
    await act(async () => {
      resolvePost(okResponse(serverReply));
      await replyPromise;
    });

    expect(result.current.threads[0].replies[0].id).toBe('reply-server-1');
    expect(broadcastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'create', threadId: 'root-1' })
    );
  });

  it('rolls back optimistic reply on server error', async () => {
    const root = makeComment({ id: 'root-1', threadId: 'root-1' });

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(okResponse([root]))
      .mockResolvedValueOnce(errResponse('Reply failed'));

    const { result } = renderHook(() => useComments(defaultOpts()));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.reply('root-1', 'A reply')).rejects.toThrow(
        'Reply failed'
      );
    });

    expect(result.current.threads[0].replies).toHaveLength(0);
  });

  it('throws for empty reply body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(okResponse([]));
    const { result } = renderHook(() => useComments(defaultOpts()));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.reply('thread-1', '')).rejects.toThrow(
        'Reply body required'
      );
    });
  });

  it('throws when thread not found', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(okResponse([]));
    const { result } = renderHook(() => useComments(defaultOpts()));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.reply('no-such-thread', 'body')).rejects.toThrow(
        'Thread not found'
      );
    });
  });
});

describe('useComments — resolve / unresolve', () => {
  it('resolve sets resolvedAt optimistically and broadcasts', async () => {
    const root = makeComment({ id: 'root-1', threadId: 'root-1' });

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(okResponse([root]))
      .mockResolvedValueOnce(okResponse({}));

    const { result } = renderHook(() => useComments(defaultOpts()));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.resolve('root-1');
    });

    expect(result.current.threads[0].resolved).toBe(true);
    expect(result.current.threads[0].root.resolvedAt).not.toBeNull();
    expect(broadcastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'resolve', threadId: 'root-1' })
    );
  });

  it('unresolve clears resolvedAt optimistically', async () => {
    const resolvedRoot = makeComment({
      id: 'root-1',
      threadId: 'root-1',
      resolvedAt: new Date(),
      resolvedBy: 42,
    });

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(okResponse([resolvedRoot]))
      .mockResolvedValueOnce(okResponse({}));

    const { result } = renderHook(() => useComments(defaultOpts()));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.unresolve('root-1');
    });

    expect(result.current.threads[0].resolved).toBe(false);
    expect(result.current.threads[0].root.resolvedAt).toBeNull();
  });

  it('rolls back resolve on server error', async () => {
    const root = makeComment({ id: 'root-1', threadId: 'root-1' });

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(okResponse([root]))
      .mockResolvedValueOnce(errResponse('Patch failed'));

    const { result } = renderHook(() => useComments(defaultOpts()));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.resolve('root-1')).rejects.toThrow('Patch failed');
    });

    // Rollback: resolvedAt should be null again
    expect(result.current.threads[0].root.resolvedAt).toBeNull();
  });

  it('throws when thread not found during resolve', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(okResponse([]));
    const { result } = renderHook(() => useComments(defaultOpts()));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.resolve('ghost-thread')).rejects.toThrow(
        'Thread not found'
      );
    });
  });
});

describe('useComments — deleteComment', () => {
  it('deletes a thread root and cascades replies optimistically', async () => {
    const root = makeComment({ id: 'root-1', threadId: 'root-1' });
    const reply = makeComment({
      id: 'reply-1',
      threadId: 'root-1',
      parentId: 'root-1',
      body: 'reply',
    });

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(okResponse([root, reply]))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), { status: 200 })
      );

    const { result } = renderHook(() => useComments(defaultOpts()));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deleteComment('root-1');
    });

    expect(result.current.threads).toHaveLength(0);
    expect(broadcastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'delete', commentId: 'root-1' })
    );
  });

  it('deletes only the targeted reply (not the whole thread)', async () => {
    const root = makeComment({ id: 'root-1', threadId: 'root-1' });
    const reply = makeComment({
      id: 'reply-1',
      threadId: 'root-1',
      parentId: 'root-1',
      body: 'reply',
    });

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(okResponse([root, reply]))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), { status: 200 })
      );

    const { result } = renderHook(() => useComments(defaultOpts()));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deleteComment('reply-1');
    });

    // Root remains, reply is gone
    expect(result.current.threads).toHaveLength(1);
    expect(result.current.threads[0].replies).toHaveLength(0);
  });

  it('rolls back on delete server error', async () => {
    const root = makeComment({ id: 'root-1', threadId: 'root-1' });

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(okResponse([root]))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: false, message: 'Delete denied' }), {
          status: 403,
        })
      );

    const { result } = renderHook(() => useComments(defaultOpts()));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.deleteComment('root-1')).rejects.toThrow(
        'Delete denied'
      );
    });

    // Snapshot restored
    expect(result.current.threads).toHaveLength(1);
  });

  it('is a noop when commentId is unknown', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(okResponse([]));
    const { result } = renderHook(() => useComments(defaultOpts()));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Should resolve without throwing
    await act(async () => {
      await result.current.deleteComment('does-not-exist');
    });

    expect(result.current.threads).toHaveLength(0);
  });
});

describe('useComments — realtime inbound event', () => {
  it('calls refresh when onRemoteEvent fires', async () => {
    const root = makeComment();
    const updatedRoot = makeComment({ body: 'Updated' });

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(okResponse([root]))
      .mockResolvedValueOnce(okResponse([updatedRoot]));

    const { result } = renderHook(() => useComments(defaultOpts()));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(capturedOnRemoteEvent).toBeDefined();

    await act(async () => {
      capturedOnRemoteEvent!();
    });

    await waitFor(() =>
      expect(result.current.threads[0].root.body).toBe('Updated')
    );
  });
});

describe('useComments — cleanup', () => {
  it('aborts in-flight request on unmount', async () => {
    let abortCalled = false;
    const originalAbortController = globalThis.AbortController;

    const MockAbortController = class {
      signal = { aborted: false } as AbortSignal;
      abort() {
        abortCalled = true;
      }
    };
    globalThis.AbortController = MockAbortController as typeof AbortController;

    // Never resolves — simulates a pending fetch
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(
      () => new Promise(() => undefined)
    );

    const { unmount } = renderHook(() => useComments(defaultOpts()));

    unmount();

    expect(abortCalled).toBe(true);

    globalThis.AbortController = originalAbortController;
  });
});

describe('useComments — thread sorting', () => {
  it('orders threads and replies by createdAt ascending', async () => {
    const old = makeComment({
      id: 'c-old',
      threadId: 'c-old',
      createdAt: new Date('2025-01-01T00:00:00Z'),
    });
    const newer = makeComment({
      id: 'c-new',
      threadId: 'c-new',
      createdAt: new Date('2025-06-01T00:00:00Z'),
    });
    const reply1 = makeComment({
      id: 'r1',
      threadId: 'c-old',
      parentId: 'c-old',
      createdAt: new Date('2025-01-02T00:00:00Z'),
      body: 'first reply',
    });
    const reply2 = makeComment({
      id: 'r2',
      threadId: 'c-old',
      parentId: 'c-old',
      createdAt: new Date('2025-01-03T00:00:00Z'),
      body: 'second reply',
    });

    // Feed in out-of-order: newer first, older second
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      okResponse([newer, reply2, old, reply1])
    );

    const { result } = renderHook(() => useComments(defaultOpts()));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.threads[0].root.id).toBe('c-old');
    expect(result.current.threads[1].root.id).toBe('c-new');
    expect(result.current.threads[0].replies[0].id).toBe('r1');
    expect(result.current.threads[0].replies[1].id).toBe('r2');
  });
});

describe('useComments — resolved thread state', () => {
  it('marks thread as resolved when root.resolvedAt is non-null', async () => {
    const resolved = makeComment({
      id: 'r-1',
      threadId: 'r-1',
      resolvedAt: new Date('2025-03-01T00:00:00Z'),
      resolvedBy: 42,
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(okResponse([resolved]));
    const { result } = renderHook(() => useComments(defaultOpts()));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.threads[0].resolved).toBe(true);
  });
});
