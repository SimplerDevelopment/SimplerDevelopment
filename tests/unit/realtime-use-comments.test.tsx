/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for `lib/realtime/use-comments.ts`
 *
 * External deps are fully mocked:
 *   - `fetch` via vi.stubGlobal
 *   - `next-auth/react` → useSession returns a canned user
 *   - `./comments-broadcast` → useCommentsRealtime returns a spy broadcastEvent;
 *     exposes `triggerRemoteEvent()` to simulate peer notifications
 *   - `@/lib/db/schema/collab` is types-only — no runtime import needed
 *   - Yjs / Awareness is never constructed; awareness option is omitted (null path)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ─── Mock next-auth/react ────────────────────────────────────────────────────

vi.mock('next-auth/react', () => ({
  useSession: vi.fn(() => ({
    data: { user: { id: '42' } },
    status: 'authenticated',
  })),
}));

// ─── Mock comments-broadcast ─────────────────────────────────────────────────
// We expose `__broadcastEvent` and `__triggerRemoteEvent` so tests can assert
// on calls and drive the onRemoteEvent callback.

let capturedOnRemoteEvent: (() => void) | null = null;
const mockBroadcastEvent = vi.fn();

vi.mock('@/lib/realtime/comments-broadcast', () => ({
  useCommentsRealtime: vi.fn((opts: { onRemoteEvent: () => void }) => {
    capturedOnRemoteEvent = opts.onRemoteEvent;
    return { broadcastEvent: mockBroadcastEvent };
  }),
}));

// ─── Import hook AFTER mocks ──────────────────────────────────────────────────

import { useComments } from '@/lib/realtime/use-comments';
import type { DocumentComment } from '@/lib/db/schema/collab';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ENTITY_TYPE = 'post' as const;
const ENTITY_ID = 'post-abc-123';
const ENDPOINT = '/api/portal/realtime/comments';

/** Build a deterministic DocumentComment row */
function makeRow(overrides: Partial<DocumentComment> = {}): DocumentComment {
  const id = overrides.id ?? 'row-id-1';
  const threadId = overrides.threadId ?? id;
  return {
    id,
    clientId: 1,
    entityType: ENTITY_TYPE,
    entityId: ENTITY_ID,
    threadId,
    parentId: null,
    authorId: 42,
    body: 'Hello world',
    mentionedUserIds: [],
    anchor: null,
    resolvedAt: null,
    resolvedBy: null,
    createdAt: new Date('2024-01-01T10:00:00.000Z'),
    updatedAt: new Date('2024-01-01T10:00:00.000Z'),
    ...overrides,
  };
}

/** Build a successful API envelope wrapping data */
function apiOk<T>(data: T) {
  return { success: true, data };
}

/** Build a failed API envelope */
function apiFail(message = 'something went wrong') {
  return { success: false, message };
}

/** Helper: build a mock fetch returning a JSON body */
function mockFetch(body: unknown, status = 200) {
  return vi.fn(() =>
    Promise.resolve({
      status,
      json: () => Promise.resolve(body),
    } as Response)
  );
}

/** Default hook options */
function defaultOpts() {
  return { entityType: ENTITY_TYPE, entityId: ENTITY_ID };
}

/** Render the hook and wait until loading=false */
async function renderLoaded(opts = defaultOpts()) {
  const r = renderHook(() => useComments(opts));
  await waitFor(() => expect(r.result.current.loading).toBe(false));
  return r;
}

// ─── Setup / teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  capturedOnRemoteEvent = null;
  // Default fetch: empty comments list
  vi.stubGlobal(
    'fetch',
    mockFetch(apiOk<DocumentComment[]>([]))
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useComments — initial load', () => {
  it('starts with loading=true and empty threads', () => {
    const { result } = renderHook(() => useComments(defaultOpts()));
    expect(result.current.loading).toBe(true);
    expect(result.current.threads).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('sets loading=false and threads=[] when API returns empty list', async () => {
    const { result } = await renderLoaded();
    expect(result.current.loading).toBe(false);
    expect(result.current.threads).toHaveLength(0);
    expect(result.current.error).toBeNull();
  });

  it('calls the correct endpoint on mount', async () => {
    await renderLoaded();
    expect(fetch as any).toHaveBeenCalledWith(
      expect.stringContaining(ENDPOINT),
      expect.objectContaining({ credentials: 'include' })
    );
  });

  it('populates threads from fetched rows', async () => {
    const row = makeRow({ id: 'r1', threadId: 'r1' });
    vi.stubGlobal('fetch', mockFetch(apiOk([row])));
    const { result } = await renderLoaded();
    expect(result.current.threads).toHaveLength(1);
    expect(result.current.threads[0].threadId).toBe('r1');
    expect(result.current.threads[0].root.body).toBe('Hello world');
    expect(result.current.threads[0].replies).toHaveLength(0);
    expect(result.current.threads[0].resolved).toBe(false);
  });

  it('groups replies under their thread root', async () => {
    const root = makeRow({ id: 'root1', threadId: 'root1', parentId: null });
    const reply = makeRow({
      id: 'rep1',
      threadId: 'root1',
      parentId: 'root1',
      body: 'a reply',
      createdAt: new Date('2024-01-01T11:00:00.000Z'),
    });
    vi.stubGlobal('fetch', mockFetch(apiOk([root, reply])));
    const { result } = await renderLoaded();
    expect(result.current.threads).toHaveLength(1);
    expect(result.current.threads[0].replies).toHaveLength(1);
    expect(result.current.threads[0].replies[0].body).toBe('a reply');
  });

  it('marks thread resolved when root.resolvedAt is non-null', async () => {
    const row = makeRow({
      id: 'r1',
      threadId: 'r1',
      resolvedAt: new Date('2024-01-02T00:00:00.000Z'),
      resolvedBy: 42,
    });
    vi.stubGlobal('fetch', mockFetch(apiOk([row])));
    const { result } = await renderLoaded();
    expect(result.current.threads[0].resolved).toBe(true);
  });
});

describe('useComments — fetch error handling', () => {
  it('sets error when API returns success=false', async () => {
    vi.stubGlobal('fetch', mockFetch(apiFail('Not authorized')));
    const { result } = await renderLoaded();
    expect(result.current.error).toBe('Not authorized');
    expect(result.current.threads).toHaveLength(0);
    expect(result.current.loading).toBe(false);
  });

  it('sets fallback error message when json parse fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          status: 500,
          json: () => Promise.reject(new Error('bad json')),
        } as unknown as Response)
      )
    );
    const { result } = await renderLoaded();
    expect(result.current.error).toMatch(/Bad response|500/);
  });

  it('sets error when fetch rejects entirely', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('Network error')))
    );
    const { result } = await renderLoaded();
    expect(result.current.error).toBe('Network error');
  });
});

describe('useComments — refresh', () => {
  it('refresh re-fetches and updates threads', async () => {
    const { result } = await renderLoaded();
    expect(result.current.threads).toHaveLength(0);

    const row = makeRow({ id: 'new1', threadId: 'new1' });
    vi.stubGlobal('fetch', mockFetch(apiOk([row])));

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.threads).toHaveLength(1);
    expect(result.current.threads[0].threadId).toBe('new1');
  });

  it('refresh clears a previous error', async () => {
    vi.stubGlobal('fetch', mockFetch(apiFail('old error')));
    const { result } = await renderLoaded();
    expect(result.current.error).toBe('old error');

    vi.stubGlobal('fetch', mockFetch(apiOk([])));
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.error).toBeNull();
  });

  it('triggers refresh when onRemoteEvent is called', async () => {
    const row = makeRow({ id: 'peer1', threadId: 'peer1', body: 'from peer' });
    const { result } = await renderLoaded();
    expect(result.current.threads).toHaveLength(0);

    vi.stubGlobal('fetch', mockFetch(apiOk([row])));

    // Simulate a peer broadcasting a comment event
    await act(async () => {
      capturedOnRemoteEvent?.();
      await new Promise((r) => setTimeout(r, 0));
    });

    await waitFor(() => expect(result.current.threads).toHaveLength(1));
    expect(result.current.threads[0].threadId).toBe('peer1');
  });
});

describe('useComments — createThread', () => {
  it('throws when body is empty', async () => {
    const { result } = await renderLoaded();
    await expect(
      act(async () => {
        await result.current.createThread('   ');
      })
    ).rejects.toThrow('Comment body required');
  });

  it('optimistically adds the new comment, then swaps in server row', async () => {
    const { result } = await renderLoaded();
    expect(result.current.threads).toHaveLength(0);

    const serverRow = makeRow({
      id: 'server-id-1',
      threadId: 'server-id-1',
      body: 'New comment',
      authorId: 42,
    });

    // First fetch call is the initial load (already resolved); second is POST.
    // We need fetch to respond differently per call: use mockImplementationOnce.
    (fetch as any)
      .mockResolvedValueOnce({
        status: 200,
        json: () => Promise.resolve(apiOk(serverRow)),
      } as any);

    await act(async () => {
      await result.current.createThread('New comment');
    });

    expect(result.current.threads).toHaveLength(1);
    expect(result.current.threads[0].root.id).toBe('server-id-1');
    expect(result.current.threads[0].root.body).toBe('New comment');
  });

  it('rolls back optimistic row on server failure', async () => {
    const { result } = await renderLoaded();

    (fetch as any).mockResolvedValueOnce({
      status: 400,
      json: () => Promise.resolve(apiFail('bad request')),
    } as any);

    await expect(
      act(async () => {
        await result.current.createThread('Will fail');
      })
    ).rejects.toThrow('bad request');

    expect(result.current.threads).toHaveLength(0);
  });

  it('calls broadcastEvent after successful create', async () => {
    const serverRow = makeRow({
      id: 'srv1',
      threadId: 'srv1',
      body: 'broadcast test',
    });
    // Sequence: first call = initial GET (empty list), second = POST
    const sequencedFetch = vi.fn()
      .mockResolvedValueOnce({ status: 200, json: () => Promise.resolve(apiOk([] as DocumentComment[])) } as any)
      .mockResolvedValueOnce({ status: 200, json: () => Promise.resolve(apiOk(serverRow)) } as any);
    vi.stubGlobal('fetch', sequencedFetch);

    const { result } = await renderLoaded();
    await act(async () => {
      await result.current.createThread('broadcast test');
    });

    expect(mockBroadcastEvent).toHaveBeenCalledWith({
      kind: 'create',
      threadId: 'srv1',
      commentId: 'srv1',
    });
  });

  it('passes anchor to the POST body', async () => {
    const serverRow = makeRow({ id: 'anch1', threadId: 'anch1', body: 'anchored' });
    // Sequence: first call = initial GET (empty list), second = POST
    const sequencedFetch = vi.fn()
      .mockResolvedValueOnce({ status: 200, json: () => Promise.resolve(apiOk([] as DocumentComment[])) } as any)
      .mockResolvedValueOnce({ status: 200, json: () => Promise.resolve(apiOk(serverRow)) } as any);
    vi.stubGlobal('fetch', sequencedFetch);

    const { result } = await renderLoaded();
    await act(async () => {
      await result.current.createThread('anchored', { blockId: 'blk-42' });
    });

    const [, init] = sequencedFetch.mock.calls.at(-1);
    const sentBody = JSON.parse(init.body as string);
    expect(sentBody.anchor).toEqual({ blockId: 'blk-42' });
  });
});

describe('useComments — reply', () => {
  it('throws when body is empty', async () => {
    const root = makeRow({ id: 'r1', threadId: 'r1' });
    vi.stubGlobal('fetch', mockFetch(apiOk([root])));
    const { result } = await renderLoaded();

    await expect(
      act(async () => {
        await result.current.reply('r1', '   ');
      })
    ).rejects.toThrow('Reply body required');
  });

  it('throws when thread not found', async () => {
    const { result } = await renderLoaded();

    await expect(
      act(async () => {
        await result.current.reply('nonexistent', 'hello');
      })
    ).rejects.toThrow('Thread not found');
  });

  it('adds a reply and swaps in server row', async () => {
    const root = makeRow({ id: 'r1', threadId: 'r1' });
    vi.stubGlobal('fetch', mockFetch(apiOk([root])));
    const { result } = await renderLoaded();

    const serverReply = makeRow({
      id: 'rep-server',
      threadId: 'r1',
      parentId: 'r1',
      body: 'a reply',
    });
    (fetch as any).mockResolvedValueOnce({
      status: 200,
      json: () => Promise.resolve(apiOk(serverReply)),
    } as any);

    await act(async () => {
      await result.current.reply('r1', 'a reply');
    });

    expect(result.current.threads[0].replies).toHaveLength(1);
    expect(result.current.threads[0].replies[0].id).toBe('rep-server');
  });

  it('rolls back reply on server failure', async () => {
    const root = makeRow({ id: 'r1', threadId: 'r1' });
    vi.stubGlobal('fetch', mockFetch(apiOk([root])));
    const { result } = await renderLoaded();

    (fetch as any).mockResolvedValueOnce({
      status: 500,
      json: () => Promise.resolve(apiFail('server error')),
    } as any);

    await expect(
      act(async () => {
        await result.current.reply('r1', 'failing reply');
      })
    ).rejects.toThrow('server error');

    expect(result.current.threads[0].replies).toHaveLength(0);
  });
});

describe('useComments — resolve / unresolve', () => {
  it('resolve optimistically sets resolvedAt and calls PATCH', async () => {
    const root = makeRow({ id: 'r1', threadId: 'r1' });
    vi.stubGlobal('fetch', mockFetch(apiOk([root])));
    const { result } = await renderLoaded();

    // Mock the PATCH call
    (fetch as any).mockResolvedValueOnce({
      status: 200,
      json: () => Promise.resolve(apiOk({})),
    } as any);

    await act(async () => {
      await result.current.resolve('r1');
    });

    expect(result.current.threads[0].resolved).toBe(true);
    expect(mockBroadcastEvent).toHaveBeenCalledWith({
      kind: 'resolve',
      threadId: 'r1',
      commentId: 'r1',
    });
  });

  it('unresolve clears resolvedAt', async () => {
    const root = makeRow({
      id: 'r1',
      threadId: 'r1',
      resolvedAt: new Date('2024-01-02T00:00:00.000Z'),
      resolvedBy: 42,
    });
    vi.stubGlobal('fetch', mockFetch(apiOk([root])));
    const { result } = await renderLoaded();

    (fetch as any).mockResolvedValueOnce({
      status: 200,
      json: () => Promise.resolve(apiOk({})),
    } as any);

    await act(async () => {
      await result.current.unresolve('r1');
    });

    expect(result.current.threads[0].resolved).toBe(false);
  });

  it('rolls back resolve on server failure', async () => {
    const root = makeRow({ id: 'r1', threadId: 'r1' });
    vi.stubGlobal('fetch', mockFetch(apiOk([root])));
    const { result } = await renderLoaded();

    (fetch as any).mockResolvedValueOnce({
      status: 500,
      json: () => Promise.resolve(apiFail('patch failed')),
    } as any);

    await expect(
      act(async () => {
        await result.current.resolve('r1');
      })
    ).rejects.toThrow('patch failed');

    // Rolled back — was null before, still null
    expect(result.current.threads[0].resolved).toBe(false);
  });

  it('throws when thread not found for resolve', async () => {
    const { result } = await renderLoaded();
    await expect(
      act(async () => {
        await result.current.resolve('nonexistent');
      })
    ).rejects.toThrow('Thread not found');
  });
});

describe('useComments — deleteComment', () => {
  it('deletes a root comment and its replies (cascade)', async () => {
    const root = makeRow({ id: 'r1', threadId: 'r1' });
    const reply = makeRow({
      id: 'rep1',
      threadId: 'r1',
      parentId: 'r1',
      body: 'reply',
    });
    vi.stubGlobal('fetch', mockFetch(apiOk([root, reply])));
    const { result } = await renderLoaded();
    expect(result.current.threads).toHaveLength(1);
    expect(result.current.threads[0].replies).toHaveLength(1);

    (fetch as any).mockResolvedValueOnce({
      status: 200,
      json: () => Promise.resolve({ success: true }),
    } as any);

    await act(async () => {
      await result.current.deleteComment('r1');
    });

    expect(result.current.threads).toHaveLength(0);
    expect(mockBroadcastEvent).toHaveBeenCalledWith({
      kind: 'delete',
      threadId: 'r1',
      commentId: 'r1',
    });
  });

  it('deletes a single reply without touching the root', async () => {
    const root = makeRow({ id: 'r1', threadId: 'r1' });
    const reply = makeRow({
      id: 'rep1',
      threadId: 'r1',
      parentId: 'r1',
      body: 'a reply',
    });
    vi.stubGlobal('fetch', mockFetch(apiOk([root, reply])));
    const { result } = await renderLoaded();

    (fetch as any).mockResolvedValueOnce({
      status: 200,
      json: () => Promise.resolve({ success: true }),
    } as any);

    await act(async () => {
      await result.current.deleteComment('rep1');
    });

    expect(result.current.threads).toHaveLength(1);
    expect(result.current.threads[0].replies).toHaveLength(0);
  });

  it('rolls back on server failure', async () => {
    const root = makeRow({ id: 'r1', threadId: 'r1' });
    vi.stubGlobal('fetch', mockFetch(apiOk([root])));
    const { result } = await renderLoaded();

    (fetch as any).mockResolvedValueOnce({
      status: 500,
      json: () => Promise.resolve({ success: false, message: 'delete failed' }),
    } as any);

    await expect(
      act(async () => {
        await result.current.deleteComment('r1');
      })
    ).rejects.toThrow('delete failed');

    // Row is restored
    expect(result.current.threads).toHaveLength(1);
  });

  it('does nothing when commentId does not exist', async () => {
    const { result } = await renderLoaded();
    // Should not throw and fetch should not be called for DELETE
    const fetchMock = fetch as any;
    const callsBefore = fetchMock.mock.calls.length;

    await act(async () => {
      await result.current.deleteComment('ghost-id');
    });

    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });
});

describe('useComments — thread sorting', () => {
  it('sorts threads by root.createdAt ascending', async () => {
    const earlier = makeRow({
      id: 'a1',
      threadId: 'a1',
      body: 'first',
      createdAt: new Date('2024-01-01T08:00:00.000Z'),
    });
    const later = makeRow({
      id: 'b2',
      threadId: 'b2',
      body: 'second',
      createdAt: new Date('2024-01-01T09:00:00.000Z'),
    });
    // Serve in reverse order to prove sorting works
    vi.stubGlobal('fetch', mockFetch(apiOk([later, earlier])));
    const { result } = await renderLoaded();
    expect(result.current.threads[0].root.body).toBe('first');
    expect(result.current.threads[1].root.body).toBe('second');
  });

  it('sorts replies within a thread by createdAt ascending', async () => {
    const root = makeRow({ id: 'r1', threadId: 'r1' });
    const rep1 = makeRow({
      id: 'rep-late',
      threadId: 'r1',
      parentId: 'r1',
      body: 'late reply',
      createdAt: new Date('2024-01-02T12:00:00.000Z'),
    });
    const rep2 = makeRow({
      id: 'rep-early',
      threadId: 'r1',
      parentId: 'r1',
      body: 'early reply',
      createdAt: new Date('2024-01-02T11:00:00.000Z'),
    });
    vi.stubGlobal('fetch', mockFetch(apiOk([root, rep1, rep2])));
    const { result } = await renderLoaded();
    const replies = result.current.threads[0].replies;
    expect(replies[0].body).toBe('early reply');
    expect(replies[1].body).toBe('late reply');
  });
});
