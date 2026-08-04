import { describe, it, expect } from 'vitest';
import { parseRetryAfter } from './fetch';
import { SimplerDevelopment } from '../client';
import { RateLimitError } from './errors';

/** Minimal stub fetch: returns a fixed response and records the last call's url/init. */
function stubFetch(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  let lastUrl = '';
  let lastInit: any;
  const fn = async (url: string, reqInit?: any) => {
    lastUrl = url;
    lastInit = reqInit;
    return new Response(JSON.stringify(body), { status: init.status ?? 200, headers: init.headers });
  };
  return { fn, calls: () => ({ url: lastUrl, init: lastInit }) };
}

describe('parseRetryAfter', () => {
  it('parses a plain delta-seconds string', () => {
    expect(parseRetryAfter('120')).toBe(120);
  });

  it('falls back to the default (60) when null/missing', () => {
    expect(parseRetryAfter(null)).toBe(60);
  });

  it('computes an approximate positive delta for a future HTTP-date', () => {
    const future = new Date(Date.now() + 90_000).toUTCString();
    const result = parseRetryAfter(future);
    expect(result).toBeGreaterThan(85);
    expect(result).toBeLessThan(95);
  });

  it('clamps a past HTTP-date to 0, never negative', () => {
    const past = new Date(Date.now() - 90_000).toUTCString();
    expect(parseRetryAfter(past)).toBe(0);
  });

  it('falls back to the default for garbage input', () => {
    expect(parseRetryAfter('not-a-date')).toBe(60);
  });

  it('falls back to the default for a partial-number string rather than loose-parsing it', () => {
    // "120abc" must NOT yield 120 via a loose parseInt path. The default is
    // also 60, so this is only meaningful because 60 !== 120 — proving it
    // fell through to the date branch (which also fails) and then default.
    expect(parseRetryAfter('120abc')).toBe(60);
  });

  it('surfaces a 429 response as RateLimitError with retryAfter from the header', async () => {
    const stub = stubFetch({ success: false }, { status: 429, headers: { 'Retry-After': '30' } });
    const client = new SimplerDevelopment({ siteId: 1, fetch: stub.fn as any });

    const err: RateLimitError = await client.config.get().catch((e) => e);
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err.retryAfter).toBe(30);
  });
});

describe('request options / caching', () => {
  it('applies client-level defaults.revalidate to init.next.revalidate', async () => {
    const stub = stubFetch({ success: true, data: {} });
    const client = new SimplerDevelopment({
      siteId: 1,
      fetch: stub.fn as any,
      defaults: { revalidate: 60 },
    });

    await client.config.get();
    expect(stub.calls().init.next.revalidate).toBe(60);
  });

  it('lets a per-call request override the client default', async () => {
    const stub = stubFetch({ success: true, data: {} });
    const client = new SimplerDevelopment({
      siteId: 1,
      fetch: stub.fn as any,
      defaults: { revalidate: 60 },
    });

    await client.config.get({ revalidate: 300 });
    expect(stub.calls().init.next.revalidate).toBe(300);
  });

  it('puts tags in init.next.tags', async () => {
    const stub = stubFetch({ success: true, data: {} });
    const client = new SimplerDevelopment({ siteId: 1, fetch: stub.fn as any });

    await client.config.get({ tags: ['site-config'] });
    expect(stub.calls().init.next.tags).toEqual(['site-config']);
  });

  it('puts cache in init.cache', async () => {
    const stub = stubFetch({ success: true, data: {} });
    const client = new SimplerDevelopment({ siteId: 1, fetch: stub.fn as any });

    await client.config.get({ cache: 'no-store' });
    expect(stub.calls().init.cache).toBe('no-store');
  });

  it('merges custom headers, and x-api-key still wins when apiKey is configured', async () => {
    const stub = stubFetch({ success: true, data: {} });
    const client = new SimplerDevelopment({
      siteId: 1,
      apiKey: 'secret-key',
      fetch: stub.fn as any,
    });

    await client.config.get({ headers: { 'x-custom': 'yes' } });
    const { init } = stub.calls();
    expect(init.headers['x-custom']).toBe('yes');
    expect(init.headers['x-api-key']).toBe('secret-key');
  });

  it('omits init.next entirely when no revalidate/tags are set', async () => {
    const stub = stubFetch({ success: true, data: {} });
    const client = new SimplerDevelopment({ siteId: 1, fetch: stub.fn as any });

    await client.config.get();
    expect(stub.calls().init.next).toBeUndefined();
  });
});
