// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { BoundedTtlCache } from '@/lib/bounded-ttl-cache';
import { checkPluginCallbackRateLimit, resetPluginCallbackRateLimit } from '@/lib/plugins/rate-limit';

afterEach(() => vi.useRealTimers());

it('bounds plugin identities without resetting existing quotas, then recovers after expiry', () => {
  vi.useFakeTimers();
  resetPluginCallbackRateLimit();
  expect(checkPluginCallbackRateLimit(1, 1, 1).ok).toBe(true);
  for (let client = 2; client <= 5_000; client++) {
    expect(checkPluginCallbackRateLimit(1, client).ok).toBe(true);
  }
  for (let client = 5_001; client < 10_000; client++) {
    expect(checkPluginCallbackRateLimit(1, client).ok).toBe(false);
  }
  expect(checkPluginCallbackRateLimit(1, 1, 1).ok).toBe(false);
  vi.advanceTimersByTime(60_001);
  expect(checkPluginCallbackRateLimit(1, 10_000).ok).toBe(true);
  resetPluginCallbackRateLimit();
});

it('does not retain per-client results when caching is disabled', () => {
  const cache = new BoundedTtlCache<object, number>(1_024, 0);
  for (let client = 0; client < 100_000; client++) cache.set(client, { client });
  expect(cache.size).toBe(0);
});

it('cleans abandoned credentials when other tenants access the cache, without timers', () => {
  vi.useFakeTimers();
  const cache = new BoundedTtlCache<string>(1_024, 60_000);
  for (let client = 0; client < 1_000; client++) cache.set(`${client}:key`, 'secret');
  vi.advanceTimersByTime(60_001);
  cache.set('new-tenant:key', 'new-secret');
  expect(cache.size).toBe(1);
  expect(cache.get('new-tenant:key')).toBe('new-secret');
  expect(vi.getTimerCount()).toBe(0);
});

it('retains bounded stale fallback data and supports selective invalidation', () => {
  vi.useFakeTimers();
  const cache = new BoundedTtlCache<string, number>(2, Infinity);
  cache.set(1, 'one'); cache.set(2, 'two');
  vi.advanceTimersByTime(86_400_000);
  expect(cache.get(1)).toBe('one');
  cache.set(3, 'three');
  expect([...cache.keys()]).toEqual([1, 3]);
  cache.delete(1);
  expect(cache.get(1)).toBeUndefined();
  expect(cache.get(3)).toBe('three');
});
