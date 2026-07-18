// @vitest-environment node
/**
 * Unit tests for `lib/brain/extract-links.ts`. The module is pure aside from
 * `fetch` and `dns/promises#lookup`, both of which we stub here.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// dns lookup is called by isAllowedHost — default to a public IP so fetches
// flow through. Individual tests override per-call as needed.
const dnsLookupMock = vi.fn(async (_host: string) => ({ address: '93.184.216.34', family: 4 }));
vi.mock('dns/promises', () => ({
  lookup: (host: string) => dnsLookupMock(host),
}));

const { extractUrlsFromText, fetchLinkMeta, extractAndFetchLinks } = await import(
  '@/lib/brain/extract-links'
);

// ---- helpers ---------------------------------------------------------------

interface MockResponseInit {
  status?: number;
  contentType?: string;
  body?: string;
  finalUrl?: string;
}

function makeResponse(init: MockResponseInit = {}): Response {
  const status = init.status ?? 200;
  const contentType = init.contentType ?? 'text/html; charset=utf-8';
  const body = init.body ?? '';
  const headers = new Headers({ 'content-type': contentType });

  // Construct a streamable body. The implementation reads via getReader().
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });

  const res = new Response(stream, { status, headers });
  // res.url is read-only on the spec Response; override via defineProperty.
  Object.defineProperty(res, 'url', { value: init.finalUrl ?? '', configurable: true });
  return res;
}

describe('extractUrlsFromText', () => {
  it('returns [] for empty input', () => {
    expect(extractUrlsFromText('')).toEqual([]);
  });

  it('returns [] when no URLs are present', () => {
    expect(extractUrlsFromText('hello world, no links here')).toEqual([]);
  });

  it('extracts a single http URL', () => {
    expect(extractUrlsFromText('go to http://example.com now')).toEqual([
      'http://example.com',
    ]);
  });

  it('extracts a single https URL', () => {
    expect(extractUrlsFromText('see https://example.com/path here')).toEqual([
      'https://example.com/path',
    ]);
  });

  it('strips a single trailing punctuation char', () => {
    expect(extractUrlsFromText('visit https://example.com.')).toEqual([
      'https://example.com',
    ]);
  });

  it('strips a run of trailing punctuation chars', () => {
    expect(extractUrlsFromText('what about https://example.com/path?!).')).toEqual([
      'https://example.com/path',
    ]);
  });

  it('extracts multiple URLs in order', () => {
    const out = extractUrlsFromText('first https://a.com then http://b.com last https://c.com');
    expect(out).toEqual(['https://a.com', 'http://b.com', 'https://c.com']);
  });

  it('dedupes identical URLs', () => {
    const out = extractUrlsFromText('https://example.com and again https://example.com');
    expect(out).toEqual(['https://example.com']);
  });

  it('dedupes after normalizing hostname casing', () => {
    const out = extractUrlsFromText('https://Example.com and https://example.com');
    // Both normalize to the same URL — only the first survives.
    expect(out).toHaveLength(1);
    expect(out[0]).toBe('https://Example.com');
  });

  it('dedupes URLs that differ only by fragment', () => {
    const out = extractUrlsFromText('https://example.com/#a and https://example.com/#b');
    expect(out).toHaveLength(1);
  });

  it('caps at MAX_URLS (15)', () => {
    const urls = Array.from({ length: 20 }, (_, i) => `https://site${i}.com`).join(' ');
    const out = extractUrlsFromText(urls);
    expect(out).toHaveLength(15);
    expect(out[0]).toBe('https://site0.com');
    expect(out[14]).toBe('https://site14.com');
  });

  it('does not extract mailto: links', () => {
    expect(extractUrlsFromText('email me at mailto:foo@example.com')).toEqual([]);
  });

  it('does not extract ftp:// links', () => {
    expect(extractUrlsFromText('grab ftp://example.com/file')).toEqual([]);
  });

  it('stops at whitespace', () => {
    expect(extractUrlsFromText('see https://example.com/path other text')).toEqual([
      'https://example.com/path',
    ]);
  });

  it('stops at angle brackets (plain-text email wrapping)', () => {
    const out = extractUrlsFromText('link <https://example.com/path> wrapped');
    expect(out).toEqual(['https://example.com/path']);
  });

  it('stops at closing quotes and brackets', () => {
    expect(extractUrlsFromText('"https://example.com/path" or (https://other.com/x)')).toEqual([
      'https://example.com/path',
      'https://other.com/x',
    ]);
  });

  it('skips a string that fails URL construction', () => {
    // The regex requires http(s):// — a bare "http://" alone with no host
    // is what the URL constructor balks at. Hard to trigger naturally with
    // the current regex, but the catch path is exercised here for safety.
    // "http://[" is invalid — URL constructor throws.
    const out = extractUrlsFromText('weird http://[');
    expect(out).toEqual([]);
  });

  it('preserves URL path and query string verbatim', () => {
    const out = extractUrlsFromText('https://example.com/path?a=1&b=2');
    expect(out).toEqual(['https://example.com/path?a=1&b=2']);
  });

  it('handles URLs across multiple lines', () => {
    const out = extractUrlsFromText('first\nhttps://a.com\nthen\nhttps://b.com');
    expect(out).toEqual(['https://a.com', 'https://b.com']);
  });
});

// ---- fetchLinkMeta ---------------------------------------------------------

describe('fetchLinkMeta', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dnsLookupMock.mockReset();
    dnsLookupMock.mockResolvedValue({ address: '93.184.216.34', family: 4 });
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns og:title / og:description / og:image / og:site_name when present', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse({
        finalUrl: 'https://example.com/article',
        body: `
          <html><head>
            <meta property="og:title" content="OG Title">
            <meta property="og:description" content="OG description here">
            <meta property="og:image" content="https://cdn.example.com/img.png">
            <meta property="og:site_name" content="Example">
            <title>Fallback Title</title>
          </head></html>
        `,
      }) as unknown as Response,
    );

    const meta = await fetchLinkMeta('https://example.com/article');
    expect(meta).toEqual({
      url: 'https://example.com/article',
      finalUrl: undefined,
      title: 'OG Title',
      description: 'OG description here',
      image: 'https://cdn.example.com/img.png',
      siteName: 'Example',
    });
  });

  it('falls back to <title> when og:title is missing', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse({
        finalUrl: 'https://example.com/',
        body: '<html><head><title>Just the title</title></head></html>',
      }) as unknown as Response,
    );

    const meta = await fetchLinkMeta('https://example.com/');
    expect(meta.title).toBe('Just the title');
  });

  it('falls back to <meta name="description"> when og:description is missing', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse({
        finalUrl: 'https://example.com/',
        body: '<html><head><meta name="description" content="A plain description"></head></html>',
      }) as unknown as Response,
    );

    const meta = await fetchLinkMeta('https://example.com/');
    expect(meta.description).toBe('A plain description');
  });

  it('falls back to hostname when og:site_name is missing', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse({
        finalUrl: 'https://example.com/page',
        body: '<html><head><title>x</title></head></html>',
      }) as unknown as Response,
    );

    const meta = await fetchLinkMeta('https://example.com/page');
    expect(meta.siteName).toBe('example.com');
  });

  it('records finalUrl only when it differs from the input URL', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse({
        finalUrl: 'https://example.com/redirected',
        body: '<html><head><title>x</title></head></html>',
      }) as unknown as Response,
    );

    const meta = await fetchLinkMeta('https://example.com/start');
    expect(meta.finalUrl).toBe('https://example.com/redirected');
  });

  it('resolves a relative og:image against the final URL', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse({
        finalUrl: 'https://example.com/articles/x',
        body: `
          <html><head>
            <meta property="og:image" content="/img/cover.png">
          </head></html>
        `,
      }) as unknown as Response,
    );

    const meta = await fetchLinkMeta('https://example.com/articles/x');
    expect(meta.image).toBe('https://example.com/img/cover.png');
  });

  it('decodes common HTML entities in titles', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse({
        finalUrl: 'https://example.com/',
        body: '<html><head><title>A &amp; B &lt;3&gt; &#39;quotes&#39; &#x27;hex&#x27;</title></head></html>',
      }) as unknown as Response,
    );

    const meta = await fetchLinkMeta('https://example.com/');
    expect(meta.title).toBe("A & B <3> 'quotes' 'hex'");
  });

  it('decodes &nbsp; and &quot; in og:description', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse({
        finalUrl: 'https://example.com/',
        body: '<html><head><meta property="og:description" content="hello&nbsp;world &quot;quoted&quot;"></head></html>',
      }) as unknown as Response,
    );

    const meta = await fetchLinkMeta('https://example.com/');
    expect(meta.description).toBe('hello world "quoted"');
  });

  it('handles content-first meta tag attribute order', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse({
        finalUrl: 'https://example.com/',
        body: '<html><head><meta content="Reversed Order" property="og:title"></head></html>',
      }) as unknown as Response,
    );

    const meta = await fetchLinkMeta('https://example.com/');
    expect(meta.title).toBe('Reversed Order');
  });

  it('truncates description at 500 chars', async () => {
    const long = 'a'.repeat(800);
    fetchSpy.mockResolvedValueOnce(
      makeResponse({
        finalUrl: 'https://example.com/',
        body: `<html><head><meta property="og:description" content="${long}"></head></html>`,
      }) as unknown as Response,
    );

    const meta = await fetchLinkMeta('https://example.com/');
    expect(meta.description).toHaveLength(500);
  });

  it('truncates title at 300 chars when only <title> is present', async () => {
    const long = 'b'.repeat(500);
    fetchSpy.mockResolvedValueOnce(
      makeResponse({
        finalUrl: 'https://example.com/',
        body: `<html><head><title>${long}</title></head></html>`,
      }) as unknown as Response,
    );

    const meta = await fetchLinkMeta('https://example.com/');
    expect(meta.title).toHaveLength(300);
  });

  it('leaves description undefined when no description tag is present', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse({
        finalUrl: 'https://example.com/',
        body: '<html><head><title>only title</title></head></html>',
      }) as unknown as Response,
    );

    const meta = await fetchLinkMeta('https://example.com/');
    expect(meta.description).toBeUndefined();
  });

  it('returns an error when the response is not ok (HTTP 404)', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse({ status: 404, body: 'not found' }) as unknown as Response,
    );

    const meta = await fetchLinkMeta('https://example.com/missing');
    expect(meta.url).toBe('https://example.com/missing');
    expect(meta.error).toBe('HTTP 404');
    expect(meta.title).toBeUndefined();
  });

  it('returns an error for a non-HTML content-type', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse({
        contentType: 'application/json',
        body: '{"a":1}',
        finalUrl: 'https://example.com/api',
      }) as unknown as Response,
    );

    const meta = await fetchLinkMeta('https://example.com/api');
    expect(meta.error).toBe('Non-HTML content-type: application/json');
  });

  it('accepts xhtml content-type', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse({
        contentType: 'application/xhtml+xml',
        body: '<html><head><title>xhtml</title></head></html>',
        finalUrl: 'https://example.com/x',
      }) as unknown as Response,
    );

    const meta = await fetchLinkMeta('https://example.com/x');
    expect(meta.title).toBe('xhtml');
    expect(meta.error).toBeUndefined();
  });

  it('rejects unsupported protocols (data:)', async () => {
    const meta = await fetchLinkMeta('data:text/html,<p>hi</p>');
    expect(meta.error).toMatch(/Unsupported protocol/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('blocks localhost by name', async () => {
    const meta = await fetchLinkMeta('http://localhost/admin');
    expect(meta.error).toBe('Blocked: private/loopback host');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('blocks *.local hostnames', async () => {
    const meta = await fetchLinkMeta('http://printer.local/');
    expect(meta.error).toBe('Blocked: private/loopback host');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('blocks *.internal hostnames', async () => {
    const meta = await fetchLinkMeta('http://service.internal/');
    expect(meta.error).toBe('Blocked: private/loopback host');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('blocks RFC1918 10.x addresses (DNS resolves to private)', async () => {
    dnsLookupMock.mockResolvedValueOnce({ address: '10.0.0.5', family: 4 });
    const meta = await fetchLinkMeta('https://internal.example.com/');
    expect(meta.error).toBe('Blocked: private/loopback host');
  });

  it('blocks 127.0.0.0/8 (loopback)', async () => {
    dnsLookupMock.mockResolvedValueOnce({ address: '127.0.0.1', family: 4 });
    const meta = await fetchLinkMeta('https://loop.example.com/');
    expect(meta.error).toBe('Blocked: private/loopback host');
  });

  it('blocks 169.254/16 (link-local)', async () => {
    dnsLookupMock.mockResolvedValueOnce({ address: '169.254.169.254', family: 4 });
    const meta = await fetchLinkMeta('https://metadata.example.com/');
    expect(meta.error).toBe('Blocked: private/loopback host');
  });

  it('blocks 172.16/12 (private)', async () => {
    dnsLookupMock.mockResolvedValueOnce({ address: '172.20.1.1', family: 4 });
    const meta = await fetchLinkMeta('https://corp.example.com/');
    expect(meta.error).toBe('Blocked: private/loopback host');
  });

  it('blocks 192.168/16 (private)', async () => {
    dnsLookupMock.mockResolvedValueOnce({ address: '192.168.1.1', family: 4 });
    const meta = await fetchLinkMeta('https://home.example.com/');
    expect(meta.error).toBe('Blocked: private/loopback host');
  });

  it('blocks 0.0.0.0 (this network)', async () => {
    dnsLookupMock.mockResolvedValueOnce({ address: '0.0.0.0', family: 4 });
    const meta = await fetchLinkMeta('https://zero.example.com/');
    expect(meta.error).toBe('Blocked: private/loopback host');
  });

  it('blocks multicast / reserved (>= 224.x.x.x)', async () => {
    dnsLookupMock.mockResolvedValueOnce({ address: '224.0.0.1', family: 4 });
    const meta = await fetchLinkMeta('https://multi.example.com/');
    expect(meta.error).toBe('Blocked: private/loopback host');
  });

  it('blocks IPv6 loopback ::1', async () => {
    dnsLookupMock.mockResolvedValueOnce({ address: '::1', family: 6 });
    const meta = await fetchLinkMeta('https://v6.example.com/');
    expect(meta.error).toBe('Blocked: private/loopback host');
  });

  it('blocks IPv6 unique-local (fc00::/7)', async () => {
    dnsLookupMock.mockResolvedValueOnce({ address: 'fd00::1', family: 6 });
    const meta = await fetchLinkMeta('https://v6ula.example.com/');
    expect(meta.error).toBe('Blocked: private/loopback host');
  });

  it('blocks IPv6 link-local fe80::/10', async () => {
    dnsLookupMock.mockResolvedValueOnce({ address: 'fe80::1', family: 6 });
    const meta = await fetchLinkMeta('https://v6ll.example.com/');
    expect(meta.error).toBe('Blocked: private/loopback host');
  });

  it('allows a public IPv4 address used directly as host', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse({
        finalUrl: 'https://8.8.8.8/',
        body: '<html><head><title>ip</title></head></html>',
      }) as unknown as Response,
    );

    const meta = await fetchLinkMeta('https://8.8.8.8/');
    expect(meta.error).toBeUndefined();
    // dns lookup is bypassed when host is a literal IP.
    expect(dnsLookupMock).not.toHaveBeenCalled();
  });

  it('blocks a private IPv4 address used directly as host (no DNS lookup)', async () => {
    const meta = await fetchLinkMeta('http://10.1.2.3/');
    expect(meta.error).toBe('Blocked: private/loopback host');
    expect(dnsLookupMock).not.toHaveBeenCalled();
  });

  it('treats a DNS lookup failure as a blocked host', async () => {
    dnsLookupMock.mockRejectedValueOnce(new Error('ENOTFOUND'));
    const meta = await fetchLinkMeta('https://nonexistent.example.com/');
    expect(meta.error).toBe('Blocked: private/loopback host');
  });

  it('captures fetch network errors and returns them on .error', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('connection refused'));
    const meta = await fetchLinkMeta('https://example.com/');
    expect(meta.error).toBe('connection refused');
  });

  it('truncates very long error messages to 200 chars', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('x'.repeat(500)));
    const meta = await fetchLinkMeta('https://example.com/');
    expect(meta.error).toHaveLength(200);
  });

  it('stringifies a non-Error thrown value', async () => {
    fetchSpy.mockRejectedValueOnce('plain string failure');
    const meta = await fetchLinkMeta('https://example.com/');
    expect(meta.error).toBe('plain string failure');
  });

  it('returns finalUrl undefined when fetch leaves res.url empty (uses input URL)', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse({
        finalUrl: '', // falsy — falls back to input URL inside fetchHtml
        body: '<html><head><title>same</title></head></html>',
      }) as unknown as Response,
    );

    const meta = await fetchLinkMeta('https://example.com/same');
    expect(meta.finalUrl).toBeUndefined();
    expect(meta.title).toBe('same');
  });

  it('returns image undefined when og:image is absent', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse({
        finalUrl: 'https://example.com/',
        body: '<html><head><title>no-image</title></head></html>',
      }) as unknown as Response,
    );
    const meta = await fetchLinkMeta('https://example.com/');
    expect(meta.image).toBeUndefined();
  });
});

// ---- extractAndFetchLinks --------------------------------------------------

describe('extractAndFetchLinks', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dnsLookupMock.mockReset();
    dnsLookupMock.mockResolvedValue({ address: '93.184.216.34', family: 4 });
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns [] when text has no URLs and no existing entries', async () => {
    const out = await extractAndFetchLinks('hello world');
    expect(out).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns existing entries verbatim when text has no URLs', async () => {
    const existing = [{ url: 'https://kept.example.com', title: 'Kept' }];
    const out = await extractAndFetchLinks('plain text', existing);
    expect(out).toBe(existing);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetches each extracted URL once and returns metadata in input order', async () => {
    fetchSpy.mockImplementation(async (url) => {
      const u = String(url);
      return makeResponse({
        finalUrl: u,
        body: `<html><head><title>${u}</title></head></html>`,
      }) as unknown as Response;
    });

    const text = 'see https://a.com and https://b.com';
    const out = await extractAndFetchLinks(text);
    expect(out.map((l) => l.url)).toEqual(['https://a.com', 'https://b.com']);
    expect(out[0].title).toBe('https://a.com');
    expect(out[1].title).toBe('https://b.com');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('reuses a cached existing entry (no fetch) when it has no error and force=false', async () => {
    const existing = [
      { url: 'https://a.com', title: 'cached A' },
    ];
    fetchSpy.mockImplementation(async (url) => {
      return makeResponse({
        finalUrl: String(url),
        body: '<html><head><title>fresh</title></head></html>',
      }) as unknown as Response;
    });

    const out = await extractAndFetchLinks('https://a.com', existing);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ url: 'https://a.com', title: 'cached A' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('re-fetches a cached entry that has an .error field', async () => {
    const existing = [
      { url: 'https://a.com', error: 'previous failure' },
    ];
    fetchSpy.mockResolvedValueOnce(
      makeResponse({
        finalUrl: 'https://a.com',
        body: '<html><head><title>retry win</title></head></html>',
      }) as unknown as Response,
    );

    const out = await extractAndFetchLinks('see https://a.com', existing);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('retry win');
    expect(out[0].error).toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('re-fetches all entries when force=true even if cached and clean', async () => {
    const existing = [
      { url: 'https://a.com', title: 'stale A' },
    ];
    fetchSpy.mockResolvedValueOnce(
      makeResponse({
        finalUrl: 'https://a.com',
        body: '<html><head><title>fresh A</title></head></html>',
      }) as unknown as Response,
    );

    const out = await extractAndFetchLinks('https://a.com', existing, { force: true });
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('fresh A');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('mixes cached + freshly-fetched results into one ordered array', async () => {
    const existing = [
      { url: 'https://cached.com', title: 'cached!' },
    ];
    fetchSpy.mockImplementation(async (url) => {
      return makeResponse({
        finalUrl: String(url),
        body: '<html><head><title>fresh</title></head></html>',
      }) as unknown as Response;
    });

    const text = 'https://cached.com and https://new.com';
    const out = await extractAndFetchLinks(text, existing);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ url: 'https://cached.com', title: 'cached!' });
    expect(out[1].url).toBe('https://new.com');
    expect(out[1].title).toBe('fresh');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('returns dedup-respecting results — duplicate URL in text is only fetched once', async () => {
    fetchSpy.mockImplementation(async (url) => {
      return makeResponse({
        finalUrl: String(url),
        body: '<html><head><title>once</title></head></html>',
      }) as unknown as Response;
    });

    const out = await extractAndFetchLinks('https://a.com and again https://a.com');
    expect(out).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('returns an error LinkMeta for each URL that fails to fetch', async () => {
    fetchSpy.mockRejectedValue(new Error('boom'));
    const out = await extractAndFetchLinks('https://a.com https://b.com');
    expect(out).toHaveLength(2);
    expect(out[0].error).toBe('boom');
    expect(out[1].error).toBe('boom');
  });

  it('uses default empty existing[] when only text is passed', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse({
        finalUrl: 'https://a.com',
        body: '<html><head><title>solo</title></head></html>',
      }) as unknown as Response,
    );
    const out = await extractAndFetchLinks('https://a.com');
    expect(out[0].title).toBe('solo');
  });
});
