'use client';

// The Phase 5/6 state machine — composes usePathChartStream.ts (SSE) +
// pathviz-reducer.ts (pure fold) + pathviz-graph-projection.ts (shapes for
// the Phase 4 canvas) + pathviz-scrubber-data.ts (the replay log) into one
// hook so PathChartView.tsx stays JSX/layout, not state machine. This is
// where "one pure reducer shared by live and replay" actually gets wired —
// both modes fold the SAME `replayEvents` array through the SAME
// applyEvent/foldEvents, just from a different starting point and cutoff:
//   - LIVE:   base = seedGraphStateFromSnapshot(snapshot) (sync, via useMemo
//             — NOT an effect, so the very first render with a snapshot
//             already has real data, no extra effect-tick delay), then fold
//             forward whatever in `replayEvents` is newer than the base's
//             lastEventId.
//   - REPLAY: base = empty, fold `replayEvents` up to the scrubber's cursor.
// Both feed the exact same projectNodes/Edges/Claims/PresenceBeacons calls,
// so the canvas never has to know which mode produced its props.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyEvent,
  createEmptyGraphState,
  foldEvents,
  seedGraphStateFromSnapshot,
  type GraphState,
  type NoteEntry,
  type PathVizStreamEvent,
  type StatusHistoryEntry,
} from './pathviz-reducer';
import { projectClaims, projectEdges, projectNodes, projectPresenceBeacons } from './pathviz-graph-projection';
import { eventIdAtOrBefore, fetchFullEventLog, REPLAY_EVENT_CAP } from './pathviz-scrubber-data';
import { usePathChartStream, type StreamConnectionState } from './usePathChartStream';
import type { PathVizClaim, PathVizEdge, PathVizNode, PathVizSnapshot } from './types';

export type PathVizMode = 'live' | 'replay' | 'paused';
export type ScrubSpeed = 1 | 2 | 4;

// Animation windows — kept in one place so PathChartView/PathChartCanvas's
// CSS durations (pathviz-animation-styles.tsx) and this "is it recent"
// bookkeeping never drift apart.
const MOUNT_ANIM_MS = 560; // ~0.55s cubic-bezier(.16,1,.3,1) mount
const FLASH_ANIM_MS = 1000; // ~1s status-change ring flash / error shake
const EDGE_FADE_MS = 900;
const PRESENCE_STALE_MS = 10_000;
const LIVE_TICK_MS = 700; // wall-clock refresh cadence so staleness/flash windows expire without needing a new event

export interface AnimationHints {
  mounted: Set<string>;
  flashing: Map<string, 'flash' | 'shake'>;
  recentEdgeKeys: Set<string>;
}

export interface ReplayScrubberState {
  events: PathVizStreamEvent[];
  loading: boolean;
  capped: boolean;
  chartCreatedAtMs: number;
  latestMs: number;
  cursorMs: number;
  playing: boolean;
  speed: ScrubSpeed;
  onSeek: (ms: number) => void;
  onTogglePlay: () => void;
  onSpeedChange: (speed: ScrubSpeed) => void;
  onGoLive: () => void;
}

export interface UsePathVizLiveReplayResult {
  mode: PathVizMode;
  connectionState: StreamConnectionState;
  nowMs: number;
  displayNodes: PathVizNode[];
  displayEdges: PathVizEdge[];
  displayClaims: PathVizClaim[];
  presenceBeacons: ReturnType<typeof projectPresenceBeacons>;
  animationHints: AnimationHints;
  statusHistoryFor: (nodeKey: string) => StatusHistoryEntry[];
  notesFor: (nodeKey: string) => NoteEntry[];
  scrubber: ReplayScrubberState;
}

function appendEventDedup(existing: PathVizStreamEvent[], event: PathVizStreamEvent): PathVizStreamEvent[] {
  if (existing.length >= REPLAY_EVENT_CAP) return existing;
  if (existing.length > 0 && existing[existing.length - 1].id >= event.id && existing.some((e) => e.id === event.id)) {
    return existing;
  }
  return [...existing, event];
}

/** Folds `events` (any subset/order) onto `base`, applying only ids newer than `base.lastEventId`. */
function foldForward(base: GraphState, events: PathVizStreamEvent[]): GraphState {
  const ordered = [...events].sort((a, b) => a.id - b.id);
  let state = base;
  for (const event of ordered) {
    if (event.id <= base.lastEventId) continue;
    state = applyEvent(state, event);
  }
  return state;
}

export function usePathVizLiveReplay(
  chartId: number,
  snapshot: PathVizSnapshot | null,
): UsePathVizLiveReplayResult {
  const [mode, setMode] = useState<PathVizMode>('live');
  const [liveNowMs, setLiveNowMs] = useState<number>(() => Date.now());
  const [liveResumeId, setLiveResumeId] = useState<number>(0);

  const [replayEvents, setReplayEvents] = useState<PathVizStreamEvent[]>([]);
  const [replayLoading, setReplayLoading] = useState(false);
  const [replayCapped, setReplayCapped] = useState(false);

  const [cursorMs, setCursorMs] = useState<number>(() => Date.now());
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<ScrubSpeed>(1);

  // Seeded synchronously from the snapshot every render (cheap — a handful
  // of Map inserts) so the very first render after the snapshot arrives
  // already reflects real claims/nodes; no effect-tick lag.
  const baseGraphState = useMemo(
    () => (snapshot ? seedGraphStateFromSnapshot(snapshot) : createEmptyGraphState()),
    [snapshot],
  );

  // `0` (not Date.now()) when there's no snapshot yet — this value is unused
  // until PathChartView actually renders the scrubber (which waits on the
  // snapshot), and a memo body must stay pure (no impure Date.now() reads).
  const chartCreatedAtMs = useMemo(() => (snapshot ? new Date(snapshot.chart.createdAt).getTime() : 0), [snapshot]);

  // ── On (re)load: reset to 'live', kick off the background full-log fetch
  // that backs both the scrubber timeline and full replay. ─────────────────
  useEffect(() => {
    if (!snapshot) return;
    setMode('live');
    setPlaying(false);
    setCursorMs(Date.now());
    setLiveResumeId(snapshot.lastEventId ?? 0);
    setReplayEvents([]);

    let cancelled = false;
    setReplayLoading(true);
    void fetchFullEventLog(chartId).then(({ events, capped }) => {
      if (cancelled) return;
      setReplayEvents(events);
      setReplayCapped(capped);
      setReplayLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chartId is stable for the lifetime of one snapshot
  }, [snapshot]);

  // ── Live SSE — only connected while in 'live' mode. `liveResumeId` only
  // changes on snapshot load / onGoLive, never per-message, so this doesn't
  // reconnect on every event. ────────────────────────────────────────────
  const handleLiveEvent = useCallback((event: PathVizStreamEvent) => {
    setReplayEvents((prev) => appendEventDedup(prev, event));
  }, []);

  const { connectionState } = usePathChartStream({
    chartId,
    initialLastEventId: liveResumeId,
    enabled: mode === 'live' && snapshot != null,
    onEvent: handleLiveEvent,
  });

  // ── Wall-clock ticker — lets flash/mount/presence/claim-TTL windows expire in live mode even with no new events. ──
  useEffect(() => {
    if (mode !== 'live') return;
    const id = setInterval(() => setLiveNowMs(Date.now()), LIVE_TICK_MS);
    return () => clearInterval(id);
  }, [mode]);

  // ── Replay play loop — advances cursorMs by wall-clock dt * speed while playing. ──
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  useEffect(() => {
    if (mode !== 'replay' || !playing) {
      lastFrameRef.current = null;
      return;
    }
    const latest =
      replayEvents.length > 0 ? new Date(replayEvents[replayEvents.length - 1].createdAt).getTime() : chartCreatedAtMs;

    const step = (now: number) => {
      if (lastFrameRef.current == null) {
        lastFrameRef.current = now;
        rafRef.current = requestAnimationFrame(step);
        return;
      }
      const dtMs = now - lastFrameRef.current;
      lastFrameRef.current = now;
      setCursorMs((prev) => {
        const next = prev + dtMs * speed;
        if (next >= latest) {
          setPlaying(false);
          return latest;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      lastFrameRef.current = null;
    };
  }, [mode, playing, speed, replayEvents, chartCreatedAtMs]);

  // ── Mode actions ──────────────────────────────────────────────────────────
  const onSeek = useCallback((ms: number) => {
    setMode('replay');
    setPlaying(false);
    setCursorMs(ms);
  }, []);

  const onTogglePlay = useCallback(() => {
    setPlaying((prev) => {
      const next = !prev;
      setMode(next ? 'replay' : 'paused');
      return next;
    });
  }, []);

  const onSpeedChange = useCallback((next: ScrubSpeed) => {
    setSpeed(next);
    setPlaying((prev) => {
      if (prev) return prev;
      setMode('replay');
      return true;
    });
  }, []);

  // The server's own /stream route replays everything newer than `since`
  // before going live (app/api/portal/path-charts/[id]/stream/route.ts) —
  // so "go live" only needs to resume the SSE connection from the highest
  // id this client currently knows about; no separate catch-up fetch here.
  const onGoLive = useCallback(() => {
    setPlaying(false);
    setLiveResumeId((prevResumeId) => Math.max(prevResumeId, foldForward(baseGraphState, replayEvents).lastEventId));
    setMode('live');
  }, [baseGraphState, replayEvents]);

  // ── Effective state/time for the current mode ────────────────────────────
  const liveGraphState = useMemo(() => foldForward(baseGraphState, replayEvents), [baseGraphState, replayEvents]);

  const cursorEventId = useMemo(() => eventIdAtOrBefore(replayEvents, cursorMs), [replayEvents, cursorMs]);
  const replayGraphState = useMemo(() => foldEvents(replayEvents, cursorEventId), [replayEvents, cursorEventId]);

  const effectiveState = mode === 'live' ? liveGraphState : replayGraphState;
  const nowMs = mode === 'live' ? liveNowMs : cursorMs;

  const displayNodes = useMemo(() => projectNodes(effectiveState, chartId), [effectiveState, chartId]);
  const displayEdges = useMemo(() => projectEdges(effectiveState, chartId), [effectiveState, chartId]);
  const displayClaims = useMemo(
    () => projectClaims(effectiveState, chartId, nowMs),
    [effectiveState, chartId, nowMs],
  );
  const presenceBeacons = useMemo(
    () => projectPresenceBeacons(effectiveState, nowMs, PRESENCE_STALE_MS),
    [effectiveState, nowMs],
  );

  const animationHints = useMemo<AnimationHints>(() => {
    const mounted = new Set<string>();
    const flashing = new Map<string, 'flash' | 'shake'>();
    for (const n of effectiveState.nodes.values()) {
      if (nowMs - n.bornAtMs >= 0 && nowMs - n.bornAtMs < MOUNT_ANIM_MS) mounted.add(n.key);
      const statusAge = nowMs - n.statusChangedAtMs;
      if (statusAge >= 0 && statusAge < FLASH_ANIM_MS && n.status !== 'planned') {
        flashing.set(n.key, n.status === 'error' ? 'shake' : 'flash');
      }
    }
    const recentEdgeKeys = new Set<string>();
    for (const e of effectiveState.edges.values()) {
      if (nowMs - e.bornAtMs >= 0 && nowMs - e.bornAtMs < EDGE_FADE_MS) recentEdgeKeys.add(e.edgeKey);
    }
    return { mounted, flashing, recentEdgeKeys };
  }, [effectiveState, nowMs]);

  const statusHistoryFor = useCallback(
    (nodeKey: string) => effectiveState.statusHistory.get(nodeKey) ?? [],
    [effectiveState],
  );
  const notesFor = useCallback((nodeKey: string) => effectiveState.notes.get(nodeKey) ?? [], [effectiveState]);

  const latestMs = useMemo(
    () =>
      replayEvents.length > 0 ? new Date(replayEvents[replayEvents.length - 1].createdAt).getTime() : chartCreatedAtMs,
    [replayEvents, chartCreatedAtMs],
  );

  return {
    mode,
    connectionState,
    nowMs,
    displayNodes,
    displayEdges,
    displayClaims,
    presenceBeacons,
    animationHints,
    statusHistoryFor,
    notesFor,
    scrubber: {
      events: replayEvents,
      loading: replayLoading,
      capped: replayCapped,
      chartCreatedAtMs,
      latestMs,
      cursorMs,
      playing,
      speed,
      onSeek,
      onTogglePlay,
      onSpeedChange,
      onGoLive,
    },
  };
}

export default usePathVizLiveReplay;
