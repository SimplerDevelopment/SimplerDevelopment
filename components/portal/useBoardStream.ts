'use client';

/**
 * Subscribes to a project's board SSE channel and calls `onWake` whenever the
 * board may have changed.
 *
 * The stream carries no payload (see app/api/portal/projects/[id]/board-stream),
 * so this hook is purely a wakeup: the caller decides what refetching means.
 *
 * Two events wake the caller, for different reasons:
 *   - `message` — a Postgres NOTIFY arrived; something changed.
 *   - `ready`   — the stream (re)connected. Vercel caps function duration, so a
 *                 board left open WILL be cut off and reconnected by
 *                 EventSource, and Postgres NOTIFY has no replay. Refetching on
 *                 reconnect is what closes that gap.
 *
 * The very first `ready` is deliberately skipped: the page was just
 * server-rendered, so its data is already fresh and an immediate refetch would
 * be pure waste on every board load.
 *
 * EventSource reconnects on its own with its own backoff, so `onerror` is not
 * handled — closing and reopening here would fight it.
 */

import { useEffect, useRef } from 'react';

export function useBoardStream(
  projectId: number | null | undefined,
  onWake: () => void,
  enabled = true,
) {
  // Keep the latest callback without re-opening the stream when it changes
  // identity — a new EventSource per render would reconnect in a loop.
  const onWakeRef = useRef(onWake);
  // Assigned in an effect rather than during render: mutating a ref while
  // rendering is what react-hooks/refs warns about, and this runs after every
  // render, which is soon enough for a callback only ever fired from a listener.
  useEffect(() => {
    onWakeRef.current = onWake;
  });

  useEffect(() => {
    // `EventSource` is absent in jsdom and in any non-browser render path, so
    // probe for it rather than assuming a `window` implies one.
    if (!enabled || !projectId) return;
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;

    let sawFirstReady = false;
    const es = new EventSource(`/api/portal/projects/${projectId}/board-stream`);

    const onMessage = () => onWakeRef.current();
    const onReady = () => {
      if (!sawFirstReady) {
        sawFirstReady = true;
        return;
      }
      onWakeRef.current();
    };

    es.addEventListener('message', onMessage);
    es.addEventListener('ready', onReady);

    return () => {
      es.removeEventListener('message', onMessage);
      es.removeEventListener('ready', onReady);
      es.close();
    };
  }, [projectId, enabled]);
}
