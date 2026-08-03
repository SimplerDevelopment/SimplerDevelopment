/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment jsdom
/**
 * usePathChartStream.ts — the low-level SSE hook. jsdom has no native
 * EventSource, so this suite installs a small mock (mirroring the browser's
 * event-target shape: onopen/onmessage/onerror callbacks, `.close()`) and
 * asserts the hook's three jobs: parse+deliver messages, reflect connection
 * state, and close cleanly on unmount.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { usePathChartStream } from '@/components/portal/pathviz/usePathChartStream';

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }
  close() {
    this.closed = true;
  }
  emitOpen() {
    this.onopen?.();
  }
  emitMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
  emitError() {
    this.onerror?.();
  }
}

function HookHarness({ chartId, initialLastEventId, enabled, onEvent, onState }: any) {
  const { connectionState } = usePathChartStream({ chartId, initialLastEventId, enabled, onEvent });
  onState(connectionState);
  return null;
}

describe('usePathChartStream', () => {
  const originalEventSource = (global as any).EventSource;

  beforeEach(() => {
    MockEventSource.instances = [];
    (global as any).EventSource = MockEventSource;
  });
  afterEach(() => {
    (global as any).EventSource = originalEventSource;
  });

  it('opens an EventSource at the chart stream URL with the initial since', () => {
    render(<HookHarness chartId={7} initialLastEventId={42} enabled onEvent={() => {}} onState={() => {}} />);
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toBe('/api/portal/path-charts/7/stream?since=42');
  });

  it('parses each message and delivers the event to the consumer', async () => {
    const received: unknown[] = [];
    render(
      <HookHarness chartId={1} initialLastEventId={0} enabled onEvent={(e: unknown) => received.push(e)} onState={() => {}} />,
    );
    const source = MockEventSource.instances[0];
    const event = { id: 5, eventType: 'node.status', payload: { key: 'wallet', status: 'wired' }, agentLabel: 'a', createdAt: '2026-07-18T00:00:00.000Z' };
    source.emitMessage(event);
    await waitFor(() => expect(received).toHaveLength(1));
    expect(received[0]).toEqual(event);
  });

  it('ignores a malformed message instead of throwing', async () => {
    const received: unknown[] = [];
    render(<HookHarness chartId={1} initialLastEventId={0} enabled onEvent={(e: unknown) => received.push(e)} onState={() => {}} />);
    const source = MockEventSource.instances[0];
    source.onmessage?.({ data: 'not json' });
    source.onmessage?.({ data: JSON.stringify({ whatever: true }) }); // missing id/eventType
    expect(received).toHaveLength(0);
  });

  it('reflects connection state: connecting -> live on open, reconnecting on a later error', async () => {
    const states: string[] = [];
    render(<HookHarness chartId={1} initialLastEventId={0} enabled onEvent={() => {}} onState={(s: string) => states.push(s)} />);
    const source = MockEventSource.instances[0];
    expect(states).toContain('connecting');

    source.emitOpen();
    await waitFor(() => expect(states.at(-1)).toBe('live'));

    source.emitError();
    await waitFor(() => expect(states.at(-1)).toBe('reconnecting'));
  });

  it('does not open a connection when disabled', () => {
    render(<HookHarness chartId={1} initialLastEventId={0} enabled={false} onEvent={() => {}} onState={() => {}} />);
    expect(MockEventSource.instances).toHaveLength(0);
  });

  it('closes the EventSource on unmount', () => {
    const { unmount } = render(
      <HookHarness chartId={1} initialLastEventId={0} enabled onEvent={() => {}} onState={() => {}} />,
    );
    const source = MockEventSource.instances[0];
    expect(source.closed).toBe(false);
    unmount();
    expect(source.closed).toBe(true);
  });

  it('closes and reopens when chartId changes', () => {
    const { rerender } = render(
      <HookHarness chartId={1} initialLastEventId={0} enabled onEvent={() => {}} onState={() => {}} />,
    );
    const first = MockEventSource.instances[0];
    rerender(<HookHarness chartId={2} initialLastEventId={0} enabled onEvent={() => {}} onState={() => {}} />);
    expect(first.closed).toBe(true);
    expect(MockEventSource.instances).toHaveLength(2);
    expect(MockEventSource.instances[1].url).toBe('/api/portal/path-charts/2/stream?since=0');
  });
});
