'use client';

/**
 * Keeps a Kanban board in step with writers it cannot see — another user, or an
 * MCP agent calling kanban_move_card.
 *
 * Owns the whole live-refresh policy so KanbanBoard (already a god file) gains
 * only a call:
 *
 *   1. subscribe to the project's SSE wakeup channel;
 *   2. debounce, so a burst — a column reorder, a bulk agent write, one NOTIFY
 *      per row — collapses into a single refresh;
 *   3. never refresh mid-drag; park it and drain when the drag settles;
 *   4. re-run the SERVER component via router.refresh() rather than refetching
 *      into a second projection, then copy the fresh props into board state.
 *
 * On (4): the board's shape is built by a server component with a dozen joins.
 * Refetching it through a bespoke endpoint would mean a second definition of
 * "what a board looks like" to keep in sync — the same trap the flow-runs stream
 * route avoids by shipping a bare ping and letting the client refetch.
 *
 * THE RACE, and why it self-heals: if another writer's ping lands while one of
 * our own optimistic mutations is still in flight, the refresh returns
 * pre-mutation state and the board briefly snaps back. Our own write publishes
 * too, so its NOTIFY arrives moments later and the next refresh includes it.
 * Threading in-flight tracking through every mutation call site in KanbanBoard
 * would cost more than the flicker it prevents.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useBoardStream } from './useBoardStream';

/** Coalesce a burst of NOTIFYs into one refresh. */
const DEBOUNCE_MS = 400;

export function useBoardLiveRefresh<T>({
  projectId,
  initialColumns,
  setColumns,
  isDragging,
}: {
  projectId: number;
  initialColumns: T;
  setColumns: (next: T) => void;
  isDragging: boolean;
}) {
  const router = useRouter();
  const draggingRef = useRef(isDragging);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queued = useRef(false);

  const scheduleRefresh = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (draggingRef.current) {
        queued.current = true;
        return;
      }
      router.refresh();
    }, DEBOUNCE_MS);
  }, [router]);

  useBoardStream(projectId, scheduleRefresh);

  // Track drag state, and drain a ping that arrived mid-drag once it settles.
  useEffect(() => {
    draggingRef.current = isDragging;
    if (!isDragging && queued.current) {
      queued.current = false;
      scheduleRefresh();
    }
  }, [isDragging, scheduleRefresh]);

  // `initialColumns` is a fresh value on every server render, so this runs once
  // router.refresh() has produced new props. Skipped mid-drag for the same
  // reason the refresh itself is.
  useEffect(() => {
    if (draggingRef.current) return;
    setColumns(initialColumns);
    // `setColumns` is a setState identity and stable; depending on it would
    // re-run this on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialColumns]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
}
