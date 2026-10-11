// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';

import { useAsyncAction } from '@/lib/hooks/useAsyncAction';
import { ApiError, fetchJson } from '@/lib/api/fetch-json';

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('useAsyncAction', () => {
  it('runs fn, returns its result, tracks busy', async () => {
    const { result } = renderHook(() => useAsyncAction(async (x: number) => x * 2));
    expect(result.current.busy).toBe(false);
    let out: number | undefined;
    await act(async () => {
      out = await result.current.run(21);
    });
    expect(out).toBe(42);
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('ignores a second concurrent run (synchronous guard)', async () => {
    const gate = deferred<number>();
    const fn = vi.fn(() => gate.promise);
    const { result } = renderHook(() => useAsyncAction(fn));
    let first: number | undefined;
    let second: number | undefined = -1;
    await act(async () => {
      const p1 = result.current.run().then((v) => { first = v; });
      const p2 = result.current.run().then((v) => { second = v; });
      expect(fn).toHaveBeenCalledTimes(1);
      gate.resolve(7);
      await Promise.all([p1, p2]);
    });
    expect(first).toBe(7);
    expect(second).toBeUndefined();
    expect(result.current.busy).toBe(false);
  });

  it('captures errors and always clears busy', async () => {
    const { result } = renderHook(() =>
      useAsyncAction(async (): Promise<number> => { throw new Error('boom'); }),
    );
    let out: number | undefined = -1;
    await act(async () => {
      out = await result.current.run();
    });
    expect(out).toBeUndefined();
    expect(result.current.error).toBe('boom');
    expect(result.current.busy).toBe(false);
  });

  it('reset clears the error', async () => {
    const { result } = renderHook(() =>
      useAsyncAction(async (): Promise<number> => { throw new Error('boom'); }),
    );
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.error).toBe('boom');
    act(() => {
      result.current.reset();
    });
    expect(result.current.error).toBeNull();
  });
});

describe('fetchJson', () => {
  it('returns parsed JSON on 2xx', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { id: 1 } }),
    })));
    const data = await fetchJson<{ success: boolean; data: { id: number } }>('/x');
    expect(data).toEqual({ success: true, data: { id: 1 } });
    vi.unstubAllGlobals();
  });

  it('throws ApiError with server message on !ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 403,
      json: async () => ({ success: false, message: 'Nope' }),
    })));
    const err = await fetchJson('/x').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe('Nope');
    expect((err as ApiError).status).toBe(403);
    vi.unstubAllGlobals();
  });

  it('throws ApiError status 0 on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('down'); }));
    const err = await fetchJson('/x').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(0);
    vi.unstubAllGlobals();
  });

  it('throws ApiError on unparsable body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => { throw new Error('bad json'); },
    })));
    const err = await fetchJson('/x').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    vi.unstubAllGlobals();
  });
});
