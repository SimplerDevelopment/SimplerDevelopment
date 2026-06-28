/**
 * `useComments` — React hook for the document-comments REST API + realtime
 * broadcast layer.
 *
 * Responsibilities:
 *   - Fetch flat comment rows for an (entityType, entityId).
 *   - Group rows into thread objects (root + replies, sorted asc by createdAt).
 *   - Provide optimistic CRUD that:
 *       1. Mutates local state immediately
 *       2. Calls REST
 *       3. Reconciles with the server response (optimistic id swap for create)
 *       4. Rolls back + raises an error on failure
 *       5. Calls `broadcastEvent` so peers refetch
 *
 * Optimistic "temporary" comment ids are prefixed with `tmp:` so the swap
 * after the server response is unambiguous.
 *
 * Tenancy: all calls pass entityType+entityId; the API enforces clientId.
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import type { Awareness } from 'y-protocols/awareness';
import type {
  CommentAnchor,
  DocumentComment,
} from '@/lib/db/schema/collab';
import { useCommentsRealtime } from './comments-broadcast';

export type EntityType = 'post' | 'deck' | 'email';

export interface CommentThread {
  /** UUID of the thread root (root.id === root.threadId). */
  threadId: string;
  root: DocumentComment;
  replies: DocumentComment[];
  resolved: boolean;
}

export interface UseCommentsOptions {
  entityType: EntityType;
  entityId: string;
  /**
   * Optional awareness for live broadcast. When omitted the hook degrades to
   * pure REST + manual refresh — useful for read-only contexts.
   */
  awareness?: Awareness | null;
}

export interface UseCommentsApi {
  threads: CommentThread[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createThread: (
    body: string,
    anchor?: CommentAnchor,
    mentionedUserIds?: number[]
  ) => Promise<void>;
  reply: (
    threadId: string,
    body: string,
    mentionedUserIds?: number[]
  ) => Promise<void>;
  resolve: (threadId: string) => Promise<void>;
  unresolve: (threadId: string) => Promise<void>;
  deleteComment: (commentId: string) => Promise<void>;
}

const COMMENTS_ENDPOINT = '/api/portal/realtime/comments';

interface ApiOk<T> {
  success: true;
  data: T;
}
interface ApiErr {
  success: false;
  message?: string;
}
type ApiEnvelope<T> = ApiOk<T> | ApiErr;

async function fetchJson<T>(
  url: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(url, init);
  let parsed: ApiEnvelope<T>;
  try {
    parsed = (await res.json()) as ApiEnvelope<T>;
  } catch {
    throw new Error(`Bad response (${res.status})`);
  }
  if (!parsed.success) {
    throw new Error(parsed.message || `Request failed (${res.status})`);
  }
  return parsed.data;
}

/** Sort comments asc by createdAt, falling back to id for stable order. */
function compareByCreatedAt(
  a: DocumentComment,
  b: DocumentComment
): number {
  const at = new Date(a.createdAt).getTime();
  const bt = new Date(b.createdAt).getTime();
  if (at !== bt) return at - bt;
  return a.id.localeCompare(b.id);
}

/** Group flat rows into root+replies threads, sorted by root.createdAt asc. */
function groupIntoThreads(rows: DocumentComment[]): CommentThread[] {
  const roots: DocumentComment[] = [];
  const repliesByThread = new Map<string, DocumentComment[]>();
  for (const row of rows) {
    if (row.parentId === null) {
      roots.push(row);
    } else {
      const arr = repliesByThread.get(row.threadId) ?? [];
      arr.push(row);
      repliesByThread.set(row.threadId, arr);
    }
  }
  roots.sort(compareByCreatedAt);
  const threads: CommentThread[] = roots.map((root) => {
    const replies = (repliesByThread.get(root.threadId) ?? []).sort(
      compareByCreatedAt
    );
    return {
      threadId: root.threadId,
      root,
      replies,
      resolved: root.resolvedAt !== null,
    };
  });
  return threads;
}

/** Stable id for optimistic placeholder rows. */
function tmpId(): string {
  return `tmp:${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
}

/**
 * Build an optimistic placeholder row. Uses `now` for createdAt/updatedAt and
 * `clientId: -1` (the API will return the real value; UI shouldn't read it).
 */
function makeOptimisticRow(opts: {
  id: string;
  entityType: EntityType;
  entityId: string;
  threadId: string;
  parentId: string | null;
  authorId: number;
  body: string;
  anchor: CommentAnchor | null;
  mentionedUserIds: number[];
}): DocumentComment {
  const now = new Date();
  return {
    id: opts.id,
    clientId: -1,
    entityType: opts.entityType,
    entityId: opts.entityId,
    threadId: opts.threadId,
    parentId: opts.parentId,
    authorId: opts.authorId,
    body: opts.body,
    mentionedUserIds: opts.mentionedUserIds,
    anchor: opts.anchor,
    resolvedAt: null,
    resolvedBy: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function useComments(opts: UseCommentsOptions): UseCommentsApi {
  const { entityType, entityId, awareness } = opts;

  const [rows, setRows] = useState<DocumentComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Holds the in-flight request controller so we can cancel on entity change.
  const abortRef = useRef<AbortController | null>(null);
  // Capture rows for use in non-React callbacks (rollback paths).
  const rowsRef = useRef<DocumentComment[]>([]);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  // Track our session userId for optimistic authorId. We pull from the
  // SessionProvider via useSession() so this hook doesn't trigger an extra
  // /api/auth/session network call — the root provider already has it cached.
  const { data: sessionData } = useSession();
  const sessionUserId = (() => {
    const raw = sessionData?.user?.id;
    if (raw == null) return null;
    const parsed = typeof raw === 'string' ? parseInt(raw, 10) : typeof raw === 'number' ? raw : NaN;
    return Number.isFinite(parsed) ? parsed : 0;
  })();
  const ensureUserId = useCallback(async (): Promise<number> => {
    return sessionUserId ?? 0;
  }, [sessionUserId]);

  const refresh = useCallback(async (): Promise<void> => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setError(null);
    try {
      const data = await fetchJson<DocumentComment[]>(
        `${COMMENTS_ENDPOINT}?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`,
        { signal: ctrl.signal, credentials: 'include' }
      );
      // Drop any optimistic rows — the server response is authoritative.
      setRows(data);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setError((e as Error).message || 'Failed to load comments');
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  // Initial fetch + refetch on entity change.
  useEffect(() => {
    // Defer the entire fetch start so setState calls inside refresh don't
    // fire synchronously in the effect body (react-hooks/set-state-in-effect).
    queueMicrotask(() => {
      setLoading(true);
      void refresh();
    });
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [refresh]);

  // Realtime: refetch when peers broadcast a comment event for this entity.
  const { broadcastEvent } = useCommentsRealtime({
    awareness: awareness ?? null,
    entityType,
    entityId,
    onRemoteEvent: () => {
      void refresh();
    },
  });

  // ─── Mutations ─────────────────────────────────────────────────────────────

  const createThread = useCallback(
    async (
      body: string,
      anchor?: CommentAnchor,
      mentionedUserIds?: number[]
    ): Promise<void> => {
      const trimmed = body.trim();
      if (!trimmed) throw new Error('Comment body required');

      const userId = await ensureUserId();
      const tmp = tmpId();
      const optimistic = makeOptimisticRow({
        id: tmp,
        entityType,
        entityId,
        threadId: tmp,
        parentId: null,
        authorId: userId,
        body: trimmed,
        anchor: anchor ?? null,
        mentionedUserIds: mentionedUserIds ?? [],
      });

      setRows((prev) => [...prev, optimistic]);
      try {
        const created = await fetchJson<DocumentComment>(COMMENTS_ENDPOINT, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entityType,
            entityId,
            body: trimmed,
            anchor: anchor ?? null,
            mentionedUserIds: mentionedUserIds ?? [],
          }),
        });
        // Swap the optimistic row out for the server row.
        setRows((prev) => prev.map((r) => (r.id === tmp ? created : r)));
        broadcastEvent({
          kind: 'create',
          threadId: created.threadId,
          commentId: created.id,
        });
      } catch (e) {
        setRows((prev) => prev.filter((r) => r.id !== tmp));
        throw e;
      }
    },
    [entityType, entityId, ensureUserId, broadcastEvent]
  );

  const reply = useCallback(
    async (
      threadId: string,
      body: string,
      mentionedUserIds?: number[]
    ): Promise<void> => {
      const trimmed = body.trim();
      if (!trimmed) throw new Error('Reply body required');

      const userId = await ensureUserId();
      const root = rowsRef.current.find(
        (r) => r.threadId === threadId && r.parentId === null
      );
      if (!root) throw new Error('Thread not found');

      const tmp = tmpId();
      const optimistic = makeOptimisticRow({
        id: tmp,
        entityType,
        entityId,
        threadId,
        parentId: root.id,
        authorId: userId,
        body: trimmed,
        anchor: null,
        mentionedUserIds: mentionedUserIds ?? [],
      });

      setRows((prev) => [...prev, optimistic]);
      try {
        const created = await fetchJson<DocumentComment>(COMMENTS_ENDPOINT, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entityType,
            entityId,
            threadId,
            parentId: root.id,
            body: trimmed,
            mentionedUserIds: mentionedUserIds ?? [],
          }),
        });
        setRows((prev) => prev.map((r) => (r.id === tmp ? created : r)));
        broadcastEvent({
          kind: 'create',
          threadId,
          commentId: created.id,
        });
      } catch (e) {
        setRows((prev) => prev.filter((r) => r.id !== tmp));
        throw e;
      }
    },
    [entityType, entityId, ensureUserId, broadcastEvent]
  );

  const setResolved = useCallback(
    async (threadId: string, resolved: boolean): Promise<void> => {
      const root = rowsRef.current.find(
        (r) => r.threadId === threadId && r.parentId === null
      );
      if (!root) throw new Error('Thread not found');

      const userId = await ensureUserId();
      const prevResolvedAt = root.resolvedAt;
      const prevResolvedBy = root.resolvedBy;

      // Optimistic
      setRows((prev) =>
        prev.map((r) =>
          r.id === root.id
            ? {
                ...r,
                resolvedAt: resolved ? new Date() : null,
                resolvedBy: resolved ? userId : null,
              }
            : r
        )
      );
      try {
        await fetchJson(`${COMMENTS_ENDPOINT}/${root.id}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resolved }),
        });
        broadcastEvent({
          kind: 'resolve',
          threadId,
          commentId: root.id,
        });
      } catch (e) {
        // Rollback
        setRows((prev) =>
          prev.map((r) =>
            r.id === root.id
              ? { ...r, resolvedAt: prevResolvedAt, resolvedBy: prevResolvedBy }
              : r
          )
        );
        throw e;
      }
    },
    [ensureUserId, broadcastEvent]
  );

  const resolve = useCallback(
    (threadId: string) => setResolved(threadId, true),
    [setResolved]
  );
  const unresolve = useCallback(
    (threadId: string) => setResolved(threadId, false),
    [setResolved]
  );

  const deleteComment = useCallback(
    async (commentId: string): Promise<void> => {
      const target = rowsRef.current.find((r) => r.id === commentId);
      if (!target) return;

      // If it's a thread root, the API cascades — mirror that locally.
      const removeIds = new Set<string>();
      if (target.parentId === null) {
        for (const r of rowsRef.current) {
          if (r.threadId === target.threadId) removeIds.add(r.id);
        }
      } else {
        removeIds.add(target.id);
      }

      const snapshot = rowsRef.current;
      setRows((prev) => prev.filter((r) => !removeIds.has(r.id)));

      try {
        const res = await fetch(`${COMMENTS_ENDPOINT}/${commentId}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        const json = (await res.json()) as ApiEnvelope<unknown>;
        if (!json.success) {
          throw new Error(json.message || `Delete failed (${res.status})`);
        }
        broadcastEvent({
          kind: 'delete',
          threadId: target.threadId,
          commentId,
        });
      } catch (e) {
        // Rollback — restore the snapshot.
        setRows(snapshot);
        throw e;
      }
    },
    [broadcastEvent]
  );

  const threads = useMemo(() => groupIntoThreads(rows), [rows]);

  return {
    threads,
    loading,
    error,
    refresh,
    createThread,
    reply,
    resolve,
    unresolve,
    deleteComment,
  };
}
