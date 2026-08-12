// Crawler engine tests — network fully stubbed. The SSRF guard is mocked to
// a no-op here (it does real DNS lookups); its own behavior is covered by
// the security suite. What matters in this file: redirect-chain recording,
// robots gating, frontier/dedup/depth/budget mechanics.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/ssrf-guard', () => ({
  assertSafeUrl: vi.fn(async () => {}),
  validateWebhookUrl: vi.fn(() => ({ ok: true, hostname: 'example.com' })),
}));

import { bootstrapCrawl, crawlChunk, fetchPage } from '@/lib/seo/crawler';

type Route = { status?: number; headers?: Record<string, string>; body?: string };
let routes: Record<string, Route>;

function html(body: string): Route {
  return { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body };
}

beforeEach(() => {
  routes = {};
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const route = routes[url];
      if (!route) return new Response('not found', { status: 404, headers: { 'content-type': 'text/html' } });
      return new Response(route.body ?? '', { status: route.status ?? 200, headers: route.headers ?? {} });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchPage', () => {
  it('records the redirect chain and final URL, SSRF-checking every hop', async () => {
    routes['https://example.com/a'] = { status: 301, headers: { location: '/b' } };
    routes['https://example.com/b'] = { status: 302, headers: { location: 'https://example.com/c' } };
    routes['https://example.com/c'] = html('<title>C</title>');

    const res = await fetchPage('https://example.com/a');
    expect(res.httpStatus).toBe(200);
    expect(res.finalUrl).toBe('https://example.com/c');
    expect(res.redirectChain).toEqual(['https://example.com/a', 'https://example.com/b']);
    expect(res.html).toContain('C');

    const { assertSafeUrl } = await import('@/lib/ssrf-guard');
    expect(vi.mocked(assertSafeUrl).mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('stops following a redirect loop and surfaces the terminal 3xx with the chain', async () => {
    routes['https://example.com/loop'] = { status: 301, headers: { location: '/loop' } };
    const res = await fetchPage('https://example.com/loop');
    // The terminal 3xx row (with its repeating chain) is what the
    // redirect-loop rule keys on — better audit signal than a fetch error.
    expect(res.httpStatus).toBe(301);
    expect(res.redirectChain.length).toBeGreaterThanOrEqual(8);
    expect(new Set(res.redirectChain).size).toBeLessThan(res.redirectChain.length);
  });

  it('does not read non-HTML bodies', async () => {
    routes['https://example.com/file.pdf'] = {
      status: 200,
      headers: { 'content-type': 'application/pdf', 'content-length': '12345' },
      body: 'x'.repeat(100),
    };
    const res = await fetchPage('https://example.com/file.pdf');
    expect(res.html).toBeNull();
    expect(res.responseBytes).toBe(12345);
  });

  it('returns the error message on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('boom'))));
    const res = await fetchPage('https://example.com/');
    expect(res.httpStatus).toBeNull();
    expect(res.error).toBe('boom');
  });
});

describe('bootstrapCrawl', () => {
  it('seeds the frontier from the start URL plus internal sitemap URLs', async () => {
    routes['https://example.com/robots.txt'] = {
      status: 200,
      headers: { 'content-type': 'text/plain' },
      body: 'User-agent: *\nDisallow: /admin\nSitemap: https://example.com/sm.xml\n',
    };
    routes['https://example.com/sm.xml'] = {
      status: 200,
      headers: { 'content-type': 'application/xml' },
      body: '<urlset><url><loc>https://example.com/page-1</loc></url><url><loc>https://elsewhere.com/x</loc></url></urlset>',
    };
    routes['https://example.com/sitemap.xml'] = { status: 404 };

    const boot = await bootstrapCrawl('https://example.com/');
    expect(boot.robotsTxt).toContain('Disallow: /admin');
    expect(boot.sitemapUrls).toContain('https://example.com/page-1');
    const urls = boot.frontier.map((f) => f.url);
    expect(urls[0]).toBe('https://example.com/');
    expect(urls).toContain('https://example.com/page-1');
    // External sitemap entries never enter the frontier.
    expect(urls.every((u) => u.startsWith('https://example.com'))).toBe(true);
  });
});

describe('crawlChunk', () => {
  const base = {
    baseUrl: 'https://example.com',
    robotsTxt: null as string | null,
    settings: {},
    maxDepth: 5,
    pageBudget: 100,
    chunkSize: 50,
    concurrency: 1,
  };

  it('crawls, discovers internal links at depth+1, and dedupes', async () => {
    routes['https://example.com/'] = html(
      '<a href="/about">About</a> <a href="/about">Again</a> <a href="https://other.com/x">Ext</a>',
    );
    routes['https://example.com/about'] = html('<a href="/">Home</a>');

    const out = await crawlChunk({
      ...base,
      frontier: [{ url: 'https://example.com/', depth: 0, from: 'seed' }],
      seen: ['https://example.com/'],
    });

    expect(out.pages).toHaveLength(1);
    expect(out.frontier).toEqual([{ url: 'https://example.com/about', depth: 1, from: 'link' }]);
    expect(out.seen).toContain('https://example.com/about');
  });

  it('records robots-blocked URLs as stub pages without fetching', async () => {
    const fetchSpy = vi.mocked(globalThis.fetch as unknown as ReturnType<typeof vi.fn>);
    const out = await crawlChunk({
      ...base,
      robotsTxt: 'User-agent: *\nDisallow: /private',
      frontier: [{ url: 'https://example.com/private/x', depth: 1, from: 'sitemap' }],
      seen: ['https://example.com/private/x'],
    });
    expect(out.pages).toHaveLength(1);
    expect(out.pages[0].page.indexabilityReason).toBe('robots-blocked');
    expect(out.pages[0].page.httpStatus).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('stops discovering past maxDepth and respects the page budget', async () => {
    routes['https://example.com/'] = html('<a href="/deeper">go</a>');
    routes['https://example.com/a'] = html('');
    const out = await crawlChunk({
      ...base,
      maxDepth: 0,
      pageBudget: 1,
      frontier: [
        { url: 'https://example.com/', depth: 0, from: 'seed' },
        { url: 'https://example.com/a', depth: 0, from: 'seed' },
      ],
      seen: ['https://example.com/', 'https://example.com/a'],
    });
    // Budget of 1 → only the first entry fetched; depth 0 = no discovery.
    expect(out.pages).toHaveLength(1);
    expect(out.frontier.map((f) => f.url)).toEqual(['https://example.com/a']);
  });

  it('honors include/exclude path patterns for discovery', async () => {
    routes['https://example.com/'] = html('<a href="/blog/post">B</a> <a href="/shop/item">S</a>');
    const out = await crawlChunk({
      ...base,
      settings: { excludePatterns: ['/shop'] },
      frontier: [{ url: 'https://example.com/', depth: 0, from: 'seed' }],
      seen: ['https://example.com/'],
    });
    expect(out.frontier.map((f) => f.url)).toEqual(['https://example.com/blog/post']);
  });
});
