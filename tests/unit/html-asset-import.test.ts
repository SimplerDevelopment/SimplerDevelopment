// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- db mock ----
// Drizzle's insert(...).values(...).returning(...) chain. By default returns
// a row whose `url` is the value of the most recent .values() call's `url`.
const insertedRows: Array<Record<string, unknown>> = [];
const mockReturning = vi.fn();
const mockValues = vi.fn((row: Record<string, unknown>) => {
  insertedRows.push(row);
  return { returning: mockReturning };
});
const mockInsert = vi.fn(() => ({ values: mockValues }));

vi.mock('@/lib/db', () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
  },
}));

vi.mock('@/lib/db/schema', () => ({
  media: {
    url: 'media.url',
  },
}));

// ---- s3 + ssrf mocks ----
const mockUploadToS3 = vi.fn();
vi.mock('@/lib/s3/upload', () => ({
  uploadToS3: (...args: unknown[]) => mockUploadToS3(...args),
}));

const mockAssertSafeUrl = vi.fn();
vi.mock('@/lib/ssrf-guard', () => ({
  assertSafeUrl: (...args: unknown[]) => mockAssertSafeUrl(...args),
}));

const { importHtmlAssets } = await import('@/lib/html-asset-import');

// ---- helpers ----
function makeFetchResponse(opts: {
  status?: number;
  ok?: boolean;
  contentType?: string;
  contentLength?: number;
  body?: ArrayBuffer;
}) {
  const status = opts.status ?? 200;
  const ok = opts.ok ?? (status >= 200 && status < 300);
  const headers = new Map<string, string>();
  if (opts.contentType !== undefined) headers.set('content-type', opts.contentType);
  if (opts.contentLength !== undefined) headers.set('content-length', String(opts.contentLength));
  return {
    status,
    ok,
    headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
    arrayBuffer: async () => opts.body ?? new ArrayBuffer(opts.contentLength ?? 8),
  };
}

const defaultOpts = {
  websiteId: 1,
  clientId: 2,
  uploadedBy: 3,
};

beforeEach(() => {
  insertedRows.length = 0;
  mockReturning.mockReset();
  mockValues.mockClear();
  mockInsert.mockClear();
  mockUploadToS3.mockReset();
  mockAssertSafeUrl.mockReset();

  // Sensible defaults: ssrf passes, upload succeeds with a stable proxy URL,
  // db returns a row with the uploaded url.
  mockAssertSafeUrl.mockResolvedValue(undefined);
  mockUploadToS3.mockImplementation(async (_buf: Buffer, filename: string, mimeType: string) => ({
    storedFilename: `stored-${filename}`,
    mimeType,
    fileSize: 100,
    url: `/api/media/proxy/${filename}`,
  }));
  mockReturning.mockImplementation(async () => {
    const last = insertedRows[insertedRows.length - 1];
    return [{ url: last?.url ?? '/api/media/proxy/fallback' }];
  });

  // Default fetch stub — individual tests can override.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      makeFetchResponse({
        status: 200,
        contentType: 'image/png',
        contentLength: 8,
      })
    )
  );
});

describe('importHtmlAssets', () => {
  it('returns html plus zero counts when there are no external assets', async () => {
    const html = '<html><body><p>no assets here</p></body></html>';
    const out = await importHtmlAssets(html, defaultOpts);
    expect(out.importedCount).toBe(0);
    expect(out.skippedCount).toBe(0);
    expect(out.html).toContain('no assets here');
    expect(mockUploadToS3).not.toHaveBeenCalled();
  });

  it('rewrites <img src> to the proxy URL on a successful import', async () => {
    const html = '<html><body><img src="https://example.com/cat.png"></body></html>';
    const out = await importHtmlAssets(html, defaultOpts);
    expect(out.importedCount).toBe(1);
    expect(out.skippedCount).toBe(0);
    expect(out.html).toContain('/api/media/proxy/cat.png');
    expect(out.html).not.toContain('https://example.com/cat.png');
    expect(mockUploadToS3).toHaveBeenCalledTimes(1);
  });

  it('leaves same-origin /api/media/proxy/ URLs intact and does not re-upload', async () => {
    const html =
      '<html><body><img src="https://cdn.example.com/api/media/proxy/abc.png"></body></html>';
    const out = await importHtmlAssets(html, { ...defaultOpts });
    // The current code returns the proxy path as the rewrite for proxy URLs.
    expect(out.html).toContain('/api/media/proxy/abc.png');
    expect(mockUploadToS3).not.toHaveBeenCalled();
    expect(out.importedCount).toBe(0);
  });

  it('skips data: URLs (cannot be parsed as http/https)', async () => {
    const html = '<html><body><img src="data:image/png;base64,AAAA"></body></html>';
    const out = await importHtmlAssets(html, defaultOpts);
    expect(out.importedCount).toBe(0);
    expect(out.skippedCount).toBe(0);
    expect(mockUploadToS3).not.toHaveBeenCalled();
    // The original data: URL should remain.
    expect(out.html).toContain('data:image/png;base64,AAAA');
  });

  it('skips unparseable relative URLs when no baseUrl is given', async () => {
    const html = '<html><body><img src="/relative/path.png"></body></html>';
    const out = await importHtmlAssets(html, defaultOpts);
    expect(out.importedCount).toBe(0);
    expect(mockUploadToS3).not.toHaveBeenCalled();
    expect(out.html).toContain('/relative/path.png');
  });

  it('resolves relative URLs against baseUrl', async () => {
    const html = '<html><body><img src="/rel/foo.png"></body></html>';
    const out = await importHtmlAssets(html, {
      ...defaultOpts,
      baseUrl: 'https://example.com/page',
    });
    expect(out.importedCount).toBe(1);
    expect(out.html).toContain('/api/media/proxy/foo.png');
  });

  it('skips non-http(s) absolute URLs', async () => {
    const html = '<html><body><img src="ftp://example.com/a.png"></body></html>';
    const out = await importHtmlAssets(html, defaultOpts);
    expect(out.importedCount).toBe(0);
    expect(out.skippedCount).toBe(0);
    expect(mockUploadToS3).not.toHaveBeenCalled();
  });

  it('skips and counts a redirect response (SSRF guard)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        makeFetchResponse({ status: 302, contentType: 'image/png', contentLength: 8 })
      )
    );
    const html = '<html><body><img src="https://example.com/r.png"></body></html>';
    const out = await importHtmlAssets(html, defaultOpts);
    expect(out.importedCount).toBe(0);
    expect(out.skippedCount).toBe(1);
    expect(out.html).toContain('https://example.com/r.png');
  });

  it('skips non-ok responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => makeFetchResponse({ status: 404 }))
    );
    const html = '<html><body><img src="https://example.com/missing.png"></body></html>';
    const out = await importHtmlAssets(html, defaultOpts);
    expect(out.importedCount).toBe(0);
    expect(out.skippedCount).toBe(1);
  });

  it('skips assets larger than maxAssetBytes via content-length header', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        makeFetchResponse({
          status: 200,
          contentType: 'image/png',
          contentLength: 1000,
        })
      )
    );
    const html = '<html><body><img src="https://example.com/big.png"></body></html>';
    const out = await importHtmlAssets(html, { ...defaultOpts, maxAssetBytes: 10 });
    expect(out.importedCount).toBe(0);
    expect(out.skippedCount).toBe(1);
  });

  it('skips assets larger than maxAssetBytes via actual buffer length', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        makeFetchResponse({
          status: 200,
          contentType: 'image/png',
          // no content-length header — falls through to buffer check
          body: new ArrayBuffer(1000),
        })
      )
    );
    const html = '<html><body><img src="https://example.com/big2.png"></body></html>';
    const out = await importHtmlAssets(html, { ...defaultOpts, maxAssetBytes: 10 });
    expect(out.importedCount).toBe(0);
    expect(out.skippedCount).toBe(1);
  });

  it('stops fetching once maxAssets is reached (concurrency=1 serializes the check)', async () => {
    // With concurrency=1, the second URL is queued until the first finishes,
    // by which time `imported` is already 1 and the maxAssets gate trips.
    const html = `
      <html><body>
        <img src="https://example.com/a.png">
        <img src="https://example.com/b.png">
        <img src="https://example.com/c.png">
      </body></html>
    `;
    const out = await importHtmlAssets(html, {
      ...defaultOpts,
      maxAssets: 1,
      concurrency: 1,
    });
    expect(out.importedCount).toBe(1);
    // The remaining two are dropped silently before entering the fetch path.
    expect(out.skippedCount).toBe(0);
    expect(mockUploadToS3).toHaveBeenCalledTimes(1);
  });

  it('counts a skip when SSRF guard rejects', async () => {
    mockAssertSafeUrl.mockRejectedValue(new Error('private ip'));
    const html = '<html><body><img src="https://internal.example.com/x.png"></body></html>';
    const out = await importHtmlAssets(html, defaultOpts);
    expect(out.importedCount).toBe(0);
    expect(out.skippedCount).toBe(1);
  });

  it('counts a skip when uploadToS3 throws', async () => {
    mockUploadToS3.mockRejectedValue(new Error('s3 down'));
    const html = '<html><body><img src="https://example.com/a.png"></body></html>';
    const out = await importHtmlAssets(html, defaultOpts);
    expect(out.importedCount).toBe(0);
    expect(out.skippedCount).toBe(1);
  });

  it('falls back to uploadResult.url when db returns no row', async () => {
    mockReturning.mockResolvedValueOnce([]);
    const html = '<html><body><img src="https://example.com/a.png"></body></html>';
    const out = await importHtmlAssets(html, defaultOpts);
    expect(out.importedCount).toBe(1);
    expect(out.html).toContain('/api/media/proxy/a.png');
  });

  it('shares one fetch across identical URLs in different attributes', async () => {
    const fetchSpy = vi.fn(async () =>
      makeFetchResponse({ status: 200, contentType: 'image/png', contentLength: 8 })
    );
    vi.stubGlobal('fetch', fetchSpy);
    const html = `
      <html><body>
        <img src="https://example.com/dup.png">
        <img src="https://example.com/dup.png">
      </body></html>
    `;
    const out = await importHtmlAssets(html, defaultOpts);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // Both <img> tags should be rewritten.
    const matches = out.html.match(/\/api\/media\/proxy\/dup\.png/g) ?? [];
    expect(matches.length).toBe(2);
    expect(out.importedCount).toBe(1);
  });

  it('rewrites every entry in a srcset attribute', async () => {
    const html =
      '<html><body><img srcset="https://example.com/s1.png 1x, https://example.com/s2.png 2x"></body></html>';
    const out = await importHtmlAssets(html, defaultOpts);
    expect(out.html).toContain('/api/media/proxy/s1.png 1x');
    expect(out.html).toContain('/api/media/proxy/s2.png 2x');
    expect(out.importedCount).toBe(2);
  });

  it('rewrites url(...) refs inside <style> blocks', async () => {
    const html = `
      <html><head><style>.a { background: url("https://example.com/bg.png"); }</style></head><body></body></html>
    `;
    const out = await importHtmlAssets(html, defaultOpts);
    expect(out.html).toContain('/api/media/proxy/bg.png');
    expect(out.html).not.toContain('https://example.com/bg.png');
    expect(out.importedCount).toBe(1);
  });

  it('rewrites url(...) refs inside inline style attributes', async () => {
    const html =
      '<html><body><div style="background: url(\'https://example.com/inline.png\')"></div></body></html>';
    const out = await importHtmlAssets(html, defaultOpts);
    expect(out.html).toContain('/api/media/proxy/inline.png');
    expect(out.importedCount).toBe(1);
  });

  it('handles link[rel="stylesheet"][href] imports', async () => {
    const html =
      '<html><head><link rel="stylesheet" href="https://example.com/main.css"></head><body></body></html>';
    const out = await importHtmlAssets(html, defaultOpts);
    expect(out.html).toContain('/api/media/proxy/main.css');
    expect(out.importedCount).toBe(1);
  });

  it('handles script[src] and video[poster] attributes', async () => {
    const html = `
      <html><body>
        <script src="https://example.com/app.js"></script>
        <video poster="https://example.com/cover.jpg"></video>
      </body></html>
    `;
    const out = await importHtmlAssets(html, defaultOpts);
    expect(out.html).toContain('/api/media/proxy/app.js');
    expect(out.html).toContain('/api/media/proxy/cover.jpg');
    expect(out.importedCount).toBe(2);
  });

  it('derives filenames from content-type when the URL has no extension', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        makeFetchResponse({
          status: 200,
          contentType: 'image/jpeg',
          contentLength: 8,
        })
      )
    );
    const html = '<html><body><img src="https://example.com/noext"></body></html>';
    const out = await importHtmlAssets(html, defaultOpts);
    expect(mockUploadToS3).toHaveBeenCalledTimes(1);
    const [, filename, mimeType] = mockUploadToS3.mock.calls[0];
    expect(filename).toBe('noext.jpg');
    expect(mimeType).toBe('image/jpeg');
    expect(out.html).toContain('/api/media/proxy/noext.jpg');
  });

  it('uses the bare URL pathname for filenames that already have an extension', async () => {
    const html = '<html><body><img src="https://example.com/path/to/photo.PNG"></body></html>';
    await importHtmlAssets(html, defaultOpts);
    expect(mockUploadToS3).toHaveBeenCalledTimes(1);
    const [, filename] = mockUploadToS3.mock.calls[0];
    expect(filename).toBe('photo.PNG');
  });

  it('falls back to asset.bin filename when no path and unknown content-type', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        makeFetchResponse({
          status: 200,
          contentType: 'application/something-weird',
          contentLength: 8,
        })
      )
    );
    const html = '<html><body><img src="https://example.com/"></body></html>';
    await importHtmlAssets(html, defaultOpts);
    expect(mockUploadToS3).toHaveBeenCalledTimes(1);
    const [, filename, mimeType] = mockUploadToS3.mock.calls[0];
    expect(filename).toBe('asset.bin');
    expect(mimeType).toBe('application/something-weird');
  });

  it('strips content-type parameters like charset', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        makeFetchResponse({
          status: 200,
          contentType: 'text/css; charset=utf-8',
          contentLength: 8,
        })
      )
    );
    const html = '<html><body><img src="https://example.com/styles"></body></html>';
    await importHtmlAssets(html, defaultOpts);
    expect(mockUploadToS3).toHaveBeenCalledTimes(1);
    const [, filename, mimeType] = mockUploadToS3.mock.calls[0];
    expect(mimeType).toBe('text/css');
    expect(filename).toBe('styles.css');
  });

  it('defaults missing content-type to application/octet-stream', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        makeFetchResponse({
          status: 200,
          contentLength: 8,
          // no contentType
        })
      )
    );
    const html = '<html><body><img src="https://example.com/foo.bin"></body></html>';
    await importHtmlAssets(html, defaultOpts);
    expect(mockUploadToS3).toHaveBeenCalledTimes(1);
    const [, , mimeType] = mockUploadToS3.mock.calls[0];
    expect(mimeType).toBe('application/octet-stream');
  });

  it('passes through clientId/websiteId/uploadedBy to the media insert', async () => {
    const html = '<html><body><img src="https://example.com/a.png"></body></html>';
    await importHtmlAssets(html, { websiteId: 77, clientId: 88, uploadedBy: 99 });
    expect(insertedRows.length).toBe(1);
    expect(insertedRows[0]).toMatchObject({
      websiteId: 77,
      clientId: 88,
      uploadedBy: 99,
    });
  });

  it('handles fetch throwing (network error) as a skip', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('econn');
      })
    );
    const html = '<html><body><img src="https://example.com/down.png"></body></html>';
    const out = await importHtmlAssets(html, defaultOpts);
    expect(out.importedCount).toBe(0);
    expect(out.skippedCount).toBe(1);
  });

  it('respects concurrency: more than `concurrency` URLs all still complete', async () => {
    // 5 distinct URLs with concurrency 2 — should still all succeed.
    let inFlight = 0;
    let maxInFlight = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        // Microtask delay to let the scheduler interleave.
        await new Promise((r) => setTimeout(r, 0));
        inFlight--;
        return makeFetchResponse({ status: 200, contentType: 'image/png', contentLength: 8 });
      })
    );
    const html = `
      <html><body>
        <img src="https://example.com/1.png">
        <img src="https://example.com/2.png">
        <img src="https://example.com/3.png">
        <img src="https://example.com/4.png">
        <img src="https://example.com/5.png">
      </body></html>
    `;
    const out = await importHtmlAssets(html, { ...defaultOpts, concurrency: 2 });
    expect(out.importedCount).toBe(5);
    expect(maxInFlight).toBeLessThanOrEqual(2);
  });
});
