// Pure(ish) helpers backing ReplayScrubber.tsx — split out from the
// component so the "which event is at this timestamp" / "build the tick
// strip" logic is unit-testable without mounting React or reactflow (see
// tests/unit/pathviz-scrubber.test.ts). Only `fetchFullEventLog` touches the
// network; everything else here is a plain function over arrays.

import type { PathVizStreamEvent } from './pathviz-reducer';

const PAGE_LIMIT = 500;
/** Exported so usePathVizLiveReplay.ts can apply the same ceiling to the live-appended tail of the log. */
export const REPLAY_EVENT_CAP = 10_000;
const HARD_CAP = REPLAY_EVENT_CAP;

export interface FullEventLogResult {
  events: PathVizStreamEvent[];
  /** True if HARD_CAP was hit before the log ran out — replay is truncated. */
  capped: boolean;
}

/**
 * Pages `GET /api/portal/path-charts/:id/events?since&limit` from since=0
 * until a short page (< PAGE_LIMIT rows) signals "that's everything," or
 * until HARD_CAP events have been collected — whichever comes first. This
 * is the sole data source for full replay (folding from empty) and for the
 * scrubber's timeline/tick strip.
 */
export async function fetchFullEventLog(chartId: number): Promise<FullEventLogResult> {
  const events: PathVizStreamEvent[] = [];
  let since = 0;
  let capped = false;

  try {
    while (true) {
      const res = await fetch(`/api/portal/path-charts/${chartId}/events?since=${since}&limit=${PAGE_LIMIT}`);
      const body: { success?: boolean; data?: PathVizStreamEvent[] } = await res.json();
      const page = body?.success && Array.isArray(body.data) ? body.data : [];
      events.push(...page);

      if (page.length === 0) break;
      since = page[page.length - 1].id;

      if (events.length >= HARD_CAP) {
        capped = true;
        break;
      }
      if (page.length < PAGE_LIMIT) break;
    }
  } catch {
    // Background hydration for the scrubber/replay log — a network hiccup
    // here shouldn't break the live view. Return whatever was collected.
  }

  return { events, capped };
}

/** Highest event id whose `createdAt` is <= `ms` — the scrubber's "fold up to here" cursor. Assumes ascending-id order (sorts defensively). */
export function eventIdAtOrBefore(events: PathVizStreamEvent[], ms: number): number {
  let result = 0;
  const ordered = [...events].sort((a, b) => a.id - b.id);
  for (const e of ordered) {
    const t = new Date(e.createdAt).getTime();
    if (Number.isFinite(t) && t <= ms) result = e.id;
    else if (Number.isFinite(t) && t > ms) break;
  }
  return result;
}

/** The ms timestamp of an event by id, or null if not found — used to seed the reducer's replay "now." */
export function eventTimeById(events: PathVizStreamEvent[], id: number): number | null {
  const event = events.find((e) => e.id === id);
  if (!event) return null;
  const t = new Date(event.createdAt).getTime();
  return Number.isFinite(t) ? t : null;
}

export type TickTone = 'status' | 'conflict' | 'error' | 'default';

export interface ScrubberTick {
  id: number;
  /** 0..1 fraction across the [t0, t1] timeline. */
  fraction: number;
  tone: TickTone;
}

const EVENT_TYPES_WITHOUT_TICKS = new Set(['agent.touch', 'claim', 'release', 'note']);

/**
 * Builds the timeline's event-density ticks — status events tinted, conflict
 * events amber and taller (the taller/amber distinction is a CSS concern in
 * ReplayScrubber.tsx; this just classifies each event's `tone`). Presence,
 * claims, releases, and notes don't get their own tick (too dense / covered
 * by the ticker elsewhere) — mirrors the mockup's §10 scrubber build loop.
 */
export function buildTimelineTicks(
  events: PathVizStreamEvent[],
  t0Ms: number,
  t1Ms: number,
): ScrubberTick[] {
  const span = t1Ms - t0Ms;
  if (span <= 0) return [];

  const ticks: ScrubberTick[] = [];
  for (const e of events) {
    if (EVENT_TYPES_WITHOUT_TICKS.has(e.eventType)) continue;
    const t = new Date(e.createdAt).getTime();
    if (!Number.isFinite(t)) continue;

    let tone: TickTone = 'default';
    if (e.eventType === 'conflict') tone = 'conflict';
    else if (e.eventType === 'node.status') {
      const payload = e.payload as { status?: string } | null;
      tone = payload?.status === 'error' || payload?.status === 'blocked' ? 'error' : 'status';
    }

    ticks.push({ id: e.id, fraction: Math.min(1, Math.max(0, (t - t0Ms) / span)), tone });
  }
  return ticks;
}
