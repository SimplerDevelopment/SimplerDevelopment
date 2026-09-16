// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRateLimiter } from '@/lib/security/memory-rate-limit';
import { BoundedTtlCache } from '@/lib/bounded-ttl-cache';
import { createEventStream } from '@/lib/chat/event-stream';

afterEach(() => vi.useRealTimers());

describe('bounded request history', () => {
  it('caps 100,000 distinct identities without resetting active quotas', () => {
    const limiter = new MemoryRateLimiter(100);
    expect(limiter.check('hot', 1, 60_000, 0)).toBe(0);
    for (let i = 0; i < 100_000; i++) limiter.check(`ip-${i}`, 10, 60_000, 0);
    expect(limiter.size).toBe(100);
    expect(limiter.check('hot', 1, 60_000, 1)).toBeGreaterThan(0);
    expect(limiter.check('new', 10, 60_000, 1)).toBeGreaterThan(0);
    expect(limiter.check('new', 10, 60_000, 60_001)).toBe(0);
    expect(limiter.size).toBe(1);
  });

  it('prunes abandoned identities repeatedly, respecting different windows', () => {
    const limiter = new MemoryRateLimiter(100);
    limiter.check('long', 1, 600_000, 0);
    for (let cycle = 0; cycle < 50; cycle++) {
      const now = cycle * 2_000;
      for (let i = 0; i < 90; i++) limiter.check(`${cycle}-${i}`, 2, 1_000, now);
      expect(limiter.size).toBeLessThanOrEqual(91);
      expect(limiter.check('long', 1, 600_000, now)).toBeGreaterThan(0);
    }
  });
});

describe('bounded host cache', () => {
  it('caps host cardinality, retains recently read entries and handles negative hits', () => {
    const cache = new BoundedTtlCache<number | null>(3, 60_000);
    cache.set('a', 1); cache.set('b', 2); cache.set('miss', null);
    expect(cache.get('miss')).toBeNull();
    expect(cache.get('a')).toBe(1);
    cache.set('c', 3);
    expect(cache.get('b')).toBeUndefined();
    for (let i = 0; i < 100_000; i++) cache.set(`host-${i}`, i);
    expect(cache.size).toBe(3);
  });

  it('never serves expired routing results', () => {
    vi.useFakeTimers();
    const cache = new BoundedTtlCache<number | null>(10, 100);
    cache.set('tenant', 42); cache.set('miss', null);
    vi.advanceTimersByTime(100);
    expect(cache.get('tenant')).toBeUndefined();
    expect(cache.get('miss')).toBeUndefined();
    expect(cache.size).toBe(0);
  });
});

describe('chat SSE resource lifecycle', () => {
  it('releases a heartbeat and subscription when LISTEN fails (close does not call cancel)', async () => {
    vi.useFakeTimers();
    const unsubscribe = vi.fn(async () => {});
    const stream = createEventStream(new AbortController().signal, {}, () => ({
      ready: Promise.reject(new Error('database unavailable')), unsubscribe,
    }));
    const reader = stream.getReader();
    await reader.read();
    expect((await reader.read()).done).toBe(true);
    await vi.waitFor(() => expect(unsubscribe).toHaveBeenCalledTimes(1));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('releases subscriptions on abort, including while LISTEN is still pending', async () => {
    vi.useFakeTimers();
    for (let i = 0; i < 1_000; i++) {
      const abort = new AbortController();
      const unsubscribe = vi.fn(async () => {});
      const stream = createEventStream(abort.signal, { i }, () => ({ ready: new Promise(() => {}), unsubscribe }));
      abort.abort();
      await stream.cancel();
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    }
    expect(vi.getTimerCount()).toBe(0);
  });

  it('drops a stalled consumer instead of buffering unlimited messages', async () => {
    vi.useFakeTimers();
    let emit!: (event: string, data: unknown) => void;
    const unsubscribe = vi.fn(async () => {});
    const stream = createEventStream(new AbortController().signal, {}, send => {
      emit = send;
      return { ready: Promise.resolve(), unsubscribe };
    });
    for (let i = 0; i < 1_000; i++) emit('message', 'x'.repeat(4_096));
    await expect(stream.getReader().read()).rejects.toThrow('too slow');
    await vi.waitFor(() => expect(unsubscribe).toHaveBeenCalledTimes(1));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not subscribe an already-aborted request', () => {
    const abort = new AbortController(); abort.abort();
    const subscribe = vi.fn();
    createEventStream(abort.signal, {}, subscribe);
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('handles an abort during subscription setup exactly once', async () => {
    vi.useFakeTimers();
    const abort = new AbortController();
    const unsubscribe = vi.fn(async () => {});
    const stream = createEventStream(abort.signal, {}, () => {
      abort.abort();
      return { ready: Promise.resolve(), unsubscribe };
    });
    await stream.cancel();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
