'use client';

// Bottom scrubber bar — timeline from chart.created to the latest known
// event, event-density ticks, drag/click-to-seek (folds the reducer up to
// the cursor via usePathVizLiveReplay.ts), play/pause + speed, and a LIVE
// button that snaps back to streaming. Reference: mockup §10 (scrubber) +
// §11 (sim clock/modes) — see usePathVizLiveReplay.ts's onSeek/onTogglePlay/
// onSpeedChange/onGoLive for the actual mode-transition semantics this bar
// triggers.
//
// Presentational + pointer math only: the tick classification and
// fold-at-cursor logic live in pathviz-scrubber-data.ts so they're testable
// without mounting this component.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildTimelineTicks, type ScrubberTick } from './pathviz-scrubber-data';
import type { PathVizMode, ReplayScrubberState, ScrubSpeed } from './usePathVizLiveReplay';
import { THEME } from './pathviz-theme';

export type ReplayScrubberProps = ReplayScrubberState & { mode: PathVizMode };

const SPEEDS: ScrubSpeed[] = [1, 2, 4];

function fmtDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function tickColor(tone: ScrubberTick['tone']): string {
  if (tone === 'conflict') return '#ECA83D';
  if (tone === 'error') return '#F1655A';
  if (tone === 'status') return '#22B8E6';
  return THEME.lineBright;
}

function modeBadgeStyle(mode: PathVizMode): { label: string; color: string } {
  if (mode === 'live') return { label: 'LIVE', color: '#6EE86E' };
  if (mode === 'paused') return { label: 'PAUSED', color: '#ECA83D' };
  return { label: 'REPLAY', color: '#22B8E6' };
}

export default function ReplayScrubber({
  mode,
  events,
  loading,
  capped,
  chartCreatedAtMs,
  latestMs,
  cursorMs,
  playing,
  speed,
  onSeek,
  onTogglePlay,
  onSpeedChange,
  onGoLive,
}: ReplayScrubberProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const span = Math.max(1, latestMs - chartCreatedAtMs);
  const ticks = useMemo(() => buildTimelineTicks(events, chartCreatedAtMs, latestMs), [events, chartCreatedAtMs, latestMs]);
  const cursorFraction = mode === 'live' ? 1 : Math.min(1, Math.max(0, (cursorMs - chartCreatedAtMs) / span));

  const seekFromClientX = useCallback(
    (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      onSeek(chartCreatedAtMs + fraction * span);
    },
    [chartCreatedAtMs, span, onSeek],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      setDragging(true);
      seekFromClientX(e.clientX);
    },
    [seekFromClientX],
  );

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => seekFromClientX(e.clientX);
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging, seekFromClientX]);

  const badge = modeBadgeStyle(mode);
  const elapsedMs = mode === 'live' ? latestMs - chartCreatedAtMs : cursorMs - chartCreatedAtMs;

  return (
    <div
      data-testid="pathviz-replay-scrubber"
      className="flex items-center gap-3 px-4 py-2.5 border-t"
      style={{ borderColor: THEME.line, background: THEME.panel }}
    >
      <button
        type="button"
        onClick={onGoLive}
        data-testid="pathviz-scrubber-live-btn"
        className="flex items-center gap-1.5 text-[10px] font-mono font-bold tracking-[.12em] px-2 py-1 rounded-full border shrink-0"
        style={{ borderColor: `${badge.color}88`, color: badge.color, background: `${badge.color}14` }}
        title="Jump back to live streaming"
      >
        <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: badge.color, boxShadow: `0 0 6px ${badge.color}` }} />
        {badge.label}
      </button>

      <button
        type="button"
        onClick={onTogglePlay}
        data-testid="pathviz-scrubber-playpause"
        aria-label={playing ? 'Pause' : 'Play'}
        className="shrink-0"
        style={{ color: THEME.ink2 }}
      >
        <span className="material-icons text-lg">{playing ? 'pause' : 'play_arrow'}</span>
      </button>

      <span className="text-[10px] font-mono shrink-0" style={{ color: THEME.ink3 }} data-testid="pathviz-scrubber-clock">
        {fmtDuration(elapsedMs)} / {fmtDuration(span)}
      </span>

      <div
        ref={trackRef}
        onMouseDown={handleMouseDown}
        data-testid="pathviz-scrubber-track"
        className="relative flex-1 h-4 cursor-pointer"
      >
        <div
          className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[3px] rounded-full"
          style={{ background: THEME.line }}
        />
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 h-[3px] rounded-full"
          style={{ width: `${cursorFraction * 100}%`, background: THEME.lineBright }}
        />
        {ticks.map((tick) => (
          <div
            key={tick.id}
            className="absolute top-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: `${tick.fraction * 100}%`,
              width: tick.tone === 'conflict' ? 3 : 2,
              height: tick.tone === 'conflict' ? 12 : 7,
              background: tickColor(tick.tone),
            }}
          />
        ))}
        <div
          data-testid="pathviz-scrubber-playhead"
          className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2"
          style={{ left: `${cursorFraction * 100}%`, marginLeft: -5, borderColor: THEME.ink, background: badge.color }}
        />
      </div>

      <div className="flex items-center gap-1 shrink-0" data-testid="pathviz-scrubber-speeds">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onSpeedChange(s)}
            data-testid={`pathviz-scrubber-speed-${s}`}
            className="text-[10px] font-mono px-1.5 py-0.5 rounded border"
            style={{
              borderColor: speed === s ? THEME.ink2 : THEME.line,
              color: speed === s ? THEME.ink : THEME.ink3,
              background: speed === s ? THEME.panel2 : 'transparent',
            }}
          >
            {s}×
          </button>
        ))}
      </div>

      {loading && events.length === 0 && (
        <span className="text-[10px] font-mono shrink-0" style={{ color: THEME.ink3 }} data-testid="pathviz-scrubber-loading">
          loading history…
        </span>
      )}
      {capped && (
        <span className="text-[10px] font-mono shrink-0" style={{ color: '#ECA83D' }} data-testid="pathviz-scrubber-capped">
          capped at 10,000 events
        </span>
      )}
    </div>
  );
}
