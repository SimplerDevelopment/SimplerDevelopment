// @vitest-environment node
/**
 * Unit tests for app/api/media/proxy/[...path]/route.ts
 *
 * ITM-027: the route has an optional `?w=` resize path that delegates to the
 * BUILT-IN image optimizer (/_next/image) via an internal fetch — deliberately
 * no sharp in this function (a module-level sharp import once failed to load
 * in the deployed bundle and 500'd every proxied image; 2026-08-19 outage).
 * These tests cover:
 *  - 404 passthrough when the S3 object doesn't exist
 *  - full-size response unchanged when no `?w=` is given (optimizer untouched)
 *  - non-whitelisted width → 400, rejected BEFORE the S3 fetch
 *  - whitelisted width on a raster type → streams the optimizer's response,
 *    with the optimizer called on the same-origin /_next/image URL (encoded
 *    proxy path, requested width, q=75)
 *  - SVG/GIF with a valid `?w=` → full-size passthrough, optimizer NOT called
 *  - optimizer failure (non-ok or thrown fetch) → full-size fallback, not 500
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('next/cache', () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T): T => fn,
}));

const sendMock = vi.fn();
vi.mock('@/lib/s3/client', () => ({
  getS3Client: () => ({ send: sendMock }),
  getBucketName: () => 'test-bucket',
}));

vi.mock('@aws-sdk/client-s3', () => ({
  GetObjectCommand: class {
    constructor(public input: unknown) {}
  },
}));

import { GET } from '@/app/api/media/proxy/[...path]/route';

/** Fresh single-use async-iterable body per call — mirrors an S3 SDK stream. */
function bodyStreamFor(buffer: Buffer) {
  return {
    async *[Symbol.asyncIterator]() {
      yield new Uint8Array(buffer);
    },
  };
}

function mockS3Object(buffer: Buffer, contentType: string) {
  sendMock.mockImplementation(async () => ({
    Body: bodyStreamFor(buffer),
    ContentType: contentType,
  }));
}

const FULL_BYTES = Buffer.alloc(5000, 7);
const SMALL_BYTES = Buffer.alloc(900, 3);

function makeRequest(url: string) {
  return new Request(url) as unknown as Parameters<typeof GET>[0];
}

function routeParams(key: string) {
  return { params: Promise.resolve({ path: key.split('/') }) };
}

const realFetch = globalThis.fetch;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  sendMock.mockReset();
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('/api/media/proxy/[...path] ?w= resize (optimizer delegation)', () => {
  it('404s when the S3 object does not exist', async () => {
    sendMock.mockImplementation(async () => ({ Body: null }));
    const res = await GET(makeRequest('http://localhost/api/media/proxy/media/x.webp'), routeParams('media/x.webp'));
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('serves the full-size original untouched when no ?w= is given', async () => {
    mockS3Object(FULL_BYTES, 'image/webp');
    const res = await GET(makeRequest('http://localhost/api/media/proxy/media/x.webp'), routeParams('media/x.webp'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/webp');
    expect(Buffer.from(await res.arrayBuffer()).length).toBe(FULL_BYTES.length);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([999, 100, 0, -5, 1601])('rejects non-whitelisted width %s with 400 before the S3 fetch', async (w) => {
    const res = await GET(makeRequest(`http://localhost/api/media/proxy/media/x.webp?w=${w}`), routeParams('media/x.webp'));
    expect(res.status).toBe(400);
    expect(sendMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([480, 828, 1200, 1600])('delegates width %s to the built-in optimizer and streams its response', async (w) => {
    mockS3Object(FULL_BYTES, 'image/webp');
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array(SMALL_BYTES), {
        status: 200,
        headers: { 'content-type': 'image/webp', 'content-length': String(SMALL_BYTES.length) },
      })
    );
    const res = await GET(makeRequest(`http://localhost/api/media/proxy/media/x.webp?w=${w}`), routeParams('media/x.webp'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/webp');
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(Buffer.from(await res.arrayBuffer()).length).toBe(SMALL_BYTES.length);
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain('/_next/image?url=');
    expect(calledUrl).toContain(encodeURIComponent('/api/media/proxy/media/x.webp'));
    expect(calledUrl).toContain(`&w=${w}&q=75`);
    // Same origin as the incoming request — no cross-origin optimizer hop.
    expect(calledUrl.startsWith('http://localhost/')).toBe(true);
  });

  it.each([
    ['image/svg+xml', 'media/x.svg'],
    ['image/gif', 'media/x.gif'],
  ])('passes %s through full-size on a valid ?w= without touching the optimizer', async (ct, key) => {
    mockS3Object(FULL_BYTES, ct);
    const res = await GET(makeRequest(`http://localhost/api/media/proxy/${key}?w=828`), routeParams(key));
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).length).toBe(FULL_BYTES.length);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to full-size when the optimizer responds non-ok', async () => {
    mockS3Object(FULL_BYTES, 'image/webp');
    fetchMock.mockResolvedValue(new Response('Bad request', { status: 400 }));
    const res = await GET(makeRequest('http://localhost/api/media/proxy/media/x.webp?w=828'), routeParams('media/x.webp'));
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).length).toBe(FULL_BYTES.length);
  });

  it('falls back to full-size when the optimizer fetch throws', async () => {
    mockS3Object(FULL_BYTES, 'image/webp');
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await GET(makeRequest('http://localhost/api/media/proxy/media/x.webp?w=828'), routeParams('media/x.webp'));
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).length).toBe(FULL_BYTES.length);
  });
});
