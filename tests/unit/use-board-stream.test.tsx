// @vitest-environment jsdom
/**
 * Unit tests for components/portal/useBoardStream.
 *
 * The subtle behaviour here is the skip-first-`ready`: the hook must refetch on
 * a RE-connect (Vercel caps function duration, so a board left open is cut off
 * and EventSource silently reconnects; Postgres NOTIFY has no replay, so
 * anything published during the gap is lost) — but NOT on the first connect,
 * where the page was just server-rendered and its data is already fresh.
 *
 * Getting that backwards is invisible in manual testing: too eager just wastes
 * a fetch on every board load, too lazy loses updates only after a reconnect
 * that takes minutes to occur. Hence a test.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { useBoardStream } from '@/components/portal/useBoardStream';

type Listener = () => void;

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  closed = false;
  listeners: Record<string, Listener[]> = {};
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, fn: Listener) {
    (this.listeners[type] ??= []).push(fn);
  }
  removeEventListener(type: string, fn: Listener) {
    this.listeners[type] = (this.listeners[type] ?? []).filter(f => f !== fn);
  }
  close() { this.closed = true; }
  emit(type: string) { for (const fn of this.listeners[type] ?? []) fn(); }
}

function Harness({ projectId, onWake }: { projectId: number | null; onWake: () => void }) {
  useBoardStream(projectId, onWake);
  return null;
}

beforeEach(() => {
  FakeEventSource.instances = [];
  (globalThis as unknown as { EventSource: unknown }).EventSource = FakeEventSource;
});
afterEach(() => {
  delete (globalThis as unknown as { EventSource?: unknown }).EventSource;
});

describe('useBoardStream', () => {
  it('opens the project board stream', () => {
    render(<Harness projectId={153} onWake={vi.fn()} />);
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toBe('/api/portal/projects/153/board-stream');
  });

  it('does NOT wake on the first ready — the page was just server-rendered', () => {
    const onWake = vi.fn();
    render(<Harness projectId={153} onWake={onWake} />);
    act(() => FakeEventSource.instances[0].emit('ready'));
    expect(onWake).not.toHaveBeenCalled();
  });

  it('wakes on a LATER ready — that is a reconnect, and NOTIFY has no replay', () => {
    const onWake = vi.fn();
    render(<Harness projectId={153} onWake={onWake} />);
    const es = FakeEventSource.instances[0];
    act(() => es.emit('ready'));   // initial connect — ignored
    act(() => es.emit('ready'));   // reconnect — must refetch
    act(() => es.emit('ready'));
    expect(onWake).toHaveBeenCalledTimes(2);
  });

  it('wakes on every message', () => {
    const onWake = vi.fn();
    render(<Harness projectId={153} onWake={onWake} />);
    const es = FakeEventSource.instances[0];
    act(() => { es.emit('message'); es.emit('message'); });
    expect(onWake).toHaveBeenCalledTimes(2);
  });

  it('always calls the LATEST callback without reopening the stream', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Harness projectId={153} onWake={first} />);
    rerender(<Harness projectId={153} onWake={second} />);
    // A new EventSource per render would reconnect in a loop.
    expect(FakeEventSource.instances).toHaveLength(1);
    act(() => FakeEventSource.instances[0].emit('message'));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('closes the stream on unmount', () => {
    const { unmount } = render(<Harness projectId={153} onWake={vi.fn()} />);
    const es = FakeEventSource.instances[0];
    unmount();
    expect(es.closed).toBe(true);
  });

  it('opens nothing without a project id', () => {
    render(<Harness projectId={null} onWake={vi.fn()} />);
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it('opens nothing when the runtime has no EventSource', () => {
    delete (globalThis as unknown as { EventSource?: unknown }).EventSource;
    expect(() => render(<Harness projectId={153} onWake={vi.fn()} />)).not.toThrow();
    expect(FakeEventSource.instances).toHaveLength(0);
  });
});
