/**
 * Pure logic backing ReplayScrubber.tsx (components/portal/pathviz/
 * pathviz-scrubber-data.ts) — no React, no DOM. `fetchFullEventLog` is the
 * one function here that touches the network, exercised with a mocked
 * `fetch` to cover paging, the short-page stop condition, and the hard cap.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  buildTimelineTicks,
  eventIdAtOrBefore,
  eventTimeById,
  fetchFullEventLog,
  REPLAY_EVENT_CAP,
} from '@/components/portal/pathviz/pathviz-scrubber-data';
import type { PathVizStreamEvent } from '@/components/portal/pathviz/pathviz-reducer';

function makeEvent(id: number, eventType: string, createdAt: string, payload: unknown = {}): PathVizStreamEvent {
  return { id, eventType, payload, agentLabel: 'claude/worker', createdAt };
}

describe('eventIdAtOrBefore', () => {
  const events = [
    makeEvent(1, 'node.upserted', '2026-07-18T00:00:00.000Z'),
    makeEvent(2, 'node.status', '2026-07-18T00:00:10.000Z'),
    makeEvent(3, 'node.status', '2026-07-18T00:00:20.000Z'),
  ];

  it('returns the highest id whose createdAt is <= the given ms', () => {
    const t = new Date('2026-07-18T00:00:15.000Z').getTime();
    expect(eventIdAtOrBefore(events, t)).toBe(2);
  });

  it('returns 0 when ms is before every event', () => {
    const t = new Date('2026-07-17T00:00:00.000Z').getTime();
    expect(eventIdAtOrBefore(events, t)).toBe(0);
  });

  it('returns the last id when ms is after every event', () => {
    const t = new Date('2026-07-19T00:00:00.000Z').getTime();
    expect(eventIdAtOrBefore(events, t)).toBe(3);
  });

  it('is order-independent (sorts defensively by id)', () => {
    const t = new Date('2026-07-18T00:00:15.000Z').getTime();
    expect(eventIdAtOrBefore([...events].reverse(), t)).toBe(2);
  });
});

describe('eventTimeById', () => {
  it('returns the ms timestamp for a known id, null otherwise', () => {
    const events = [makeEvent(7, 'note', '2026-07-18T00:00:00.000Z')];
    expect(eventTimeById(events, 7)).toBe(new Date('2026-07-18T00:00:00.000Z').getTime());
    expect(eventTimeById(events, 8)).toBeNull();
  });
});

describe('buildTimelineTicks', () => {
  it('classifies node.status as status/error tone, conflict as conflict tone, and skips presence-y event types', () => {
    const t0 = new Date('2026-07-18T00:00:00.000Z').getTime();
    const t1 = new Date('2026-07-18T00:01:00.000Z').getTime();
    const events = [
      makeEvent(1, 'node.status', new Date(t0 + 10_000).toISOString(), { status: 'wired' }),
      makeEvent(2, 'node.status', new Date(t0 + 20_000).toISOString(), { status: 'error' }),
      makeEvent(3, 'conflict', new Date(t0 + 30_000).toISOString(), {}),
      makeEvent(4, 'agent.touch', new Date(t0 + 40_000).toISOString(), {}),
      makeEvent(5, 'claim', new Date(t0 + 45_000).toISOString(), {}),
      makeEvent(6, 'note', new Date(t0 + 50_000).toISOString(), {}),
    ];
    const ticks = buildTimelineTicks(events, t0, t1);
    expect(ticks.map((t) => t.id)).toEqual([1, 2, 3]);
    expect(ticks[0].tone).toBe('status');
    expect(ticks[1].tone).toBe('error');
    expect(ticks[2].tone).toBe('conflict');
    ticks.forEach((t) => expect(t.fraction).toBeGreaterThanOrEqual(0));
    ticks.forEach((t) => expect(t.fraction).toBeLessThanOrEqual(1));
  });

  it('returns an empty tick list when the timeline has zero/negative span', () => {
    expect(buildTimelineTicks([makeEvent(1, 'node.status', '2026-07-18T00:00:00.000Z')], 100, 100)).toEqual([]);
  });
});

describe('fetchFullEventLog', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('pages a full page then stops once a second (short) page signals the end', async () => {
    const page1 = Array.from({ length: 500 }, (_, i) => makeEvent(i + 1, 'node.status', '2026-07-18T00:00:00.000Z'));
    const page2 = Array.from({ length: 3 }, (_, i) => makeEvent(501 + i, 'node.status', '2026-07-18T00:00:00.000Z'));
    const fetchMock = vi.fn((url: string) => {
      const since = new URL(url, 'http://localhost').searchParams.get('since');
      if (since === '0') return Promise.resolve({ json: async () => ({ success: true, data: page1 }) } as Response);
      return Promise.resolve({ json: async () => ({ success: true, data: page2 }) } as Response);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { events, capped } = await fetchFullEventLog(1);
    expect(events).toHaveLength(503);
    expect(events[0].id).toBe(1);
    expect(events.at(-1)?.id).toBe(503);
    expect(capped).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('stops as soon as a page comes back shorter than the page limit, without an extra empty-page round trip', async () => {
    const page1 = Array.from({ length: 10 }, (_, i) => makeEvent(i + 1, 'node.status', '2026-07-18T00:00:00.000Z'));
    const fetchMock = vi.fn(() => Promise.resolve({ json: async () => ({ success: true, data: page1 }) } as Response));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { events } = await fetchFullEventLog(1);
    expect(events).toHaveLength(10);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('caps at REPLAY_EVENT_CAP and reports capped=true', async () => {
    let call = 0;
    const fetchMock = vi.fn(() => {
      call++;
      const start = (call - 1) * 500 + 1;
      const page = Array.from({ length: 500 }, (_, i) => makeEvent(start + i, 'node.status', '2026-07-18T00:00:00.000Z'));
      return Promise.resolve({ json: async () => ({ success: true, data: page }) } as Response);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { events, capped } = await fetchFullEventLog(1);
    expect(capped).toBe(true);
    expect(events.length).toBeGreaterThanOrEqual(REPLAY_EVENT_CAP);
    expect(events.length).toBe(call * 500);
  });

  it('returns whatever was collected so far instead of throwing on a network error', async () => {
    let call = 0;
    const fetchMock = vi.fn(() => {
      call++;
      if (call === 1) {
        return Promise.resolve({
          json: async () => ({ success: true, data: [makeEvent(1, 'node.status', '2026-07-18T00:00:00.000Z')] }),
        } as Response);
      }
      return Promise.reject(new Error('network down'));
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { events } = await fetchFullEventLog(1);
    expect(events).toHaveLength(1);
  });
});
