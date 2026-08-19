// @vitest-environment node
/**
 * Unit tests for app/api/media/proxy/[...path]/route.ts
 *
 * ITM-027: the route grew an optional `?w=` resize-on-the-fly path (sharp,
 * whitelisted widths only). These tests cover:
 *  - 404 passthrough when the S3 object doesn't exist
 *  - full-size response is unchanged when no `?w=` is given
 *  - a non-whitelisted width is rejected with 400 (no arbitrary-dimension
 *    resize oracle)
 *  - a whitelisted width actually shrinks bytes and preserves the stored
 *    format (webp stays webp)
 *  - sharp never enlarges a source smaller than the requested width
 *  - SVG and GIF are passed through byte-for-byte even with a valid `?w=`
 *
 * `next/cache`'s unstable_cache is mocked to a passthrough (no cache layer)
 * so every test call re-invokes the wrapped fetch/resize function directly
 * against the mocked S3 client — sharp itself is NOT mocked, since the
 * whitelist + passthrough behavior this file exists to verify is the actual
 * resize/no-resize decision, not just that sharp was *called*.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import sharp from 'sharp';

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

/** Fresh single-use async-iterable body per call — mirrors an S3 SDK stream. */
function bodyStreamFor(buffer: Buffer) {
  return {
    async *[Symbol.asyncIterator]() {
      yield new Uint8Array(buffer);
    },
  };
}

/** Every send() call gets its own fresh stream over the same bytes — the
 * route (with caching mocked to a passthrough) legitimately calls
 * fetchProxyAsset twice on a resize request (once directly, once again
 * inside resizeProxyAsset), which a real unstable_cache would dedupe. */
function mockS3Object(buffer: Buffer, contentType: string) {
  sendMock.mockImplementation(async () => ({
    Body: bodyStreamFor(buffer),
    ContentType: contentType,
  }));
}

async function makeSourceWebp(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 50, b: 10 } },
  })
    .webp()
    .toBuffer();
}

function makeRequest(url: string): NextRequest {
  return new NextRequest(url);
}

function callGet(url: string, key: string) {
  return import('@/app/api/media/proxy/[...path]/route').then(({ GET }) =>
    GET(makeRequest(url), { params: Promise.resolve({ path: key.split('/') }) })
  );
}

beforeEach(() => {
  sendMock.mockReset();
});

describe('GET /api/media/proxy/[...path]', () => {
  it('returns 404 when the S3 object is missing', async () => {
    sendMock.mockResolvedValueOnce({ Body: undefined });
    const res = await callGet('http://localhost/api/media/proxy/missing.webp', 'missing.webp');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('serves the full-size asset unchanged when no ?w= is given', async () => {
    const source = await makeSourceWebp(1920, 1080);
    mockS3Object(source, 'image/webp');
    const res = await callGet('http://localhost/api/media/proxy/hero.webp', 'hero.webp');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/webp');
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.length).toBe(source.length);
    expect(buf.equals(source)).toBe(true);
  });

  it.each([0, 100, 828.5, 2000, -480])('rejects a non-whitelisted width (%s) with 400', async (w) => {
    const source = await makeSourceWebp(1920, 1080);
    mockS3Object(source, 'image/webp');
    const res = await callGet(`http://localhost/api/media/proxy/hero.webp?w=${w}`, 'hero.webp');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/480, 828, 1200, 1600/);
  });

  it.each([480, 828, 1200, 1600])('accepts whitelisted width %s, shrinks bytes, preserves webp content-type', async (w) => {
    const source = await makeSourceWebp(1920, 1080);
    mockS3Object(source, 'image/webp');
    const res = await callGet(`http://localhost/api/media/proxy/hero.webp?w=${w}`, 'hero.webp');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/webp');
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.length).toBeLessThan(source.length);
    expect(Number(res.headers.get('Content-Length'))).toBe(buf.length);
    const meta = await sharp(buf).metadata();
    expect(meta.width).toBe(w);
    expect(meta.format).toBe('webp');
  });

  it('never enlarges a source image smaller than the requested width', async () => {
    const source = await makeSourceWebp(300, 200); // smaller than every whitelisted width
    mockS3Object(source, 'image/webp');
    const res = await callGet('http://localhost/api/media/proxy/small.webp?w=480', 'small.webp');
    expect(res.status).toBe(200);
    const buf = Buffer.from(await res.arrayBuffer());
    const meta = await sharp(buf).metadata();
    expect(meta.width).toBe(300); // unchanged — not upscaled to 480
  });

  it('preserves jpeg format through a resize (never transcodes)', async () => {
    const source = await sharp({
      create: { width: 1920, height: 1080, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .jpeg()
      .toBuffer();
    mockS3Object(source, 'image/jpeg');
    const res = await callGet('http://localhost/api/media/proxy/photo.jpg?w=828', 'photo.jpg');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
    const buf = Buffer.from(await res.arrayBuffer());
    const meta = await sharp(buf).metadata();
    expect(meta.width).toBe(828);
    expect(meta.format).toBe('jpeg');
  });

  it('passes SVG through byte-for-byte untouched even with a valid ?w=', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100"/></svg>'
    );
    mockS3Object(svg, 'image/svg+xml');
    const res = await callGet('http://localhost/api/media/proxy/icon.svg?w=480', 'icon.svg');
    expect(res.status).toBe(200);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.equals(svg)).toBe(true);
  });

  it('passes GIF through byte-for-byte untouched even with a valid ?w=', async () => {
    // Header bytes only — passthrough never decodes it, so it doesn't need to
    // be a fully valid animated GIF for this assertion.
    const gif = Buffer.from('GIF89a-not-a-real-gif-but-untouched-bytes', 'ascii');
    mockS3Object(gif, 'image/gif');
    const res = await callGet('http://localhost/api/media/proxy/anim.gif?w=828', 'anim.gif');
    expect(res.status).toBe(200);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.equals(gif)).toBe(true);
  });

  it('passes non-image types (e.g. PDF) through untouched with a valid ?w=', async () => {
    const pdf = Buffer.from('%PDF-1.4 fake pdf bytes');
    mockS3Object(pdf, 'application/pdf');
    const res = await callGet('http://localhost/api/media/proxy/doc.pdf?w=480', 'doc.pdf');
    expect(res.status).toBe(200);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.equals(pdf)).toBe(true);
  });
});
