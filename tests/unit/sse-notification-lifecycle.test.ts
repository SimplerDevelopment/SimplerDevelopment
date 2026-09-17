// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEventStream } from '@/lib/chat/event-stream';

afterEach(() => vi.useRealTimers());

describe('notification stream wire compatibility', () => {
  it('preserves ready and default message events and the 15-second heartbeat', async () => {
    vi.useFakeTimers();
    let notify!: (event: string, data: unknown) => void;
    const unsubscribe = vi.fn(async () => {});
    const stream = createEventStream(new AbortController().signal, {}, emit => {
      notify = emit;
      return { ready: Promise.resolve(), unsubscribe };
    }, { initialEvent: 'ready', heartbeatMs: 15_000 });
    const reader = stream.getReader();
    const decode = async () => new TextDecoder().decode((await reader.read()).value);
    expect(await decode()).toBe('event: ready\ndata: {}\n\n');
    notify('', { ping: true, eventId: 3 });
    expect(await decode()).toBe('data: {"ping":true,"eventId":3}\n\n');
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await decode()).toBe(': ping\n\n');
    await reader.cancel();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not resurrect a heartbeat after abort during LISTEN setup', async () => {
    vi.useFakeTimers();
    let ready!: () => void;
    const pending = new Promise<void>(resolve => { ready = resolve; });
    const unsubscribe = vi.fn(async () => { await pending; });
    const abort = new AbortController();
    const stream = createEventStream(abort.signal, {}, () => ({ ready: pending, unsubscribe }),
      { initialEvent: 'ready', heartbeatMs: 15_000 });
    abort.abort();
    ready();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    const reader = stream.getReader();
    await reader.read();
    expect((await reader.read()).done).toBe(true);
  });
});
