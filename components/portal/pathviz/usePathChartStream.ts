'use client';

// Owns the live SSE connection to one chart's event stream
// (app/api/portal/path-charts/[id]/stream/route.ts). Deliberately thin: it
// only opens the connection, parses each `data:` message, and hands the
// parsed PathVizStreamEvent to the caller — every state-machine decision
// (seed vs. fold, mode transitions, animation windows) lives in
// usePathVizLiveReplay.ts, not here, so this hook stays trivially mockable
// in tests (see tests/unit/pathviz-stream-hook.test.tsx).
//
// Native EventSource already does the reconnect dance: it resends whatever
// `id:` line arrived with the last message as a `Last-Event-ID` header, and
// the stream route's `parseSince()` prefers that header over `?since=` — so
// this hook only needs to pass `?since=` once, for the very first connect.

import { useEffect, useRef, useState } from 'react';
import type { PathVizStreamEvent } from './pathviz-reducer';

export type StreamConnectionState = 'connecting' | 'live' | 'reconnecting' | 'closed';

export interface UsePathChartStreamOptions {
  chartId: number;
  /** Resume point for the very first connect — usually the loaded snapshot's `lastEventId`. */
  initialLastEventId: number | null;
  /** Set false to close (or never open) the connection — e.g. while in replay/paused mode. */
  enabled?: boolean;
  onEvent: (event: PathVizStreamEvent) => void;
}

export interface UsePathChartStreamResult {
  connectionState: StreamConnectionState;
}

function parseMessage(raw: string): PathVizStreamEvent | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed != null &&
      typeof parsed === 'object' &&
      typeof (parsed as Record<string, unknown>).id === 'number' &&
      typeof (parsed as Record<string, unknown>).eventType === 'string'
    ) {
      return parsed as PathVizStreamEvent;
    }
    return null;
  } catch {
    return null;
  }
}

export function usePathChartStream({
  chartId,
  initialLastEventId,
  enabled = true,
  onEvent,
}: UsePathChartStreamOptions): UsePathChartStreamResult {
  const [connectionState, setConnectionState] = useState<StreamConnectionState>('connecting');

  // Kept in a ref so the effect below doesn't need `onEvent` in its deps —
  // a new inline callback identity every render must not tear down and
  // reopen the EventSource connection.
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled) {
      setConnectionState('closed');
      return;
    }
    // Defensive feature-detection: no native EventSource (older/restricted
    // browser embed, or a test environment like jsdom that doesn't
    // implement it) — degrade to "closed" instead of throwing, so the rest
    // of the chart (static snapshot + replay) still works.
    if (typeof EventSource === 'undefined') {
      setConnectionState('closed');
      return;
    }

    setConnectionState('connecting');
    const since = initialLastEventId ?? 0;
    const source = new EventSource(`/api/portal/path-charts/${chartId}/stream?since=${since}`);
    let openedOnce = false;

    source.onopen = () => {
      openedOnce = true;
      setConnectionState('live');
    };
    source.onmessage = (ev: MessageEvent<string>) => {
      setConnectionState('live');
      const event = parseMessage(ev.data);
      if (event) onEventRef.current(event);
    };
    source.onerror = () => {
      // Browser-native EventSource auto-retries on its own; we only reflect
      // that we're mid-retry. `readyState === CLOSED` (2) only happens after
      // `.close()`, which we're about to call on cleanup anyway.
      setConnectionState(openedOnce ? 'reconnecting' : 'connecting');
    };

    return () => {
      source.close();
    };
  }, [chartId, initialLastEventId, enabled]);

  return { connectionState };
}

export default usePathChartStream;
