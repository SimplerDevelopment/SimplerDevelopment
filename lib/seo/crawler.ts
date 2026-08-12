// SEO crawler engine — fetch layer + discovery + chunked frontier
// processing. Deliberately DB-free: the runner (lib/seo/runner.ts) owns
// persistence and run state; everything here is pure input → output so the
// crawl logic is unit-testable and the runner can re-enter mid-run.
//
// Security posture: every outbound request (including every redirect hop)
// passes lib/ssrf-guard.ts assertSafeUrl — tenants point this at arbitrary
// domains, so the crawler is an SSRF primitive by design and must never
// reach private address space. Response bodies are stream-capped: a hostile
// server answering with gigabytes must cost us at most MAX_HTML_BYTES.

import { assertSafeUrl } from '@/lib/ssrf-guard';
import type { SeoProjectSettings } from '@/lib/db/schema';
import type { ExtractResult } from './types';
import { extractPage } from './extract';
import { normalizeUrl, isInternalUrl, urlHash } from './url';
import { parseRobotsTxt, type ParsedRobots } from './robots';
import { parseSitemap } from './sitemap';

export const SEO_CRAWLER_USER_AGENT =
  'Mozilla/5.0 (compatible; SimplerDevelopmentBot/1.0; +https://simplerdevelopment.com)';

const FETCH_TIMEOUT_MS = 15_000;
const MAX_HTML_BYTES = 2_500_000;
const MAX_REDIRECTS = 8;
const MAX_SITEMAP_DOCS = 10; // total sitemap documents fetched per run (index recursion included)
const MAX_SITEMAP_URLS = 5_000;
const DEFAULT_CONCURRENCY = 3; // one domain per run, so this IS the per-domain rate limit
// Hard cap on the dedup set: bounds the jsonb run-state row on link-farms.
// Discovery past this point is dropped — the page budget is far smaller
// anyway, so this only trims URLs we were never going to fetch.
const MAX_SEEN = 5_000;

export type FetchPageResult = {
  requestedUrl: string;
  finalUrl: string; // last URL actually fetched (raw, un-normalized)
  httpStatus: number | null; // null = network/timeout failure
  headers: Record<string, string>;
  html: string | null;
  contentType: string | null;
  redirectChain: string[]; // hops visited before finalUrl; [] when direct
  responseTimeMs: number;
  responseBytes: number;
  error?: string;
};

async function readBodyCapped(res: Response, cap: number): Promise<{ text: string; bytes: number }> {
  const reader = res.body?.getReader();
  if (!reader) return { text: '', bytes: 0 };
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > cap) {
      // ponytail: truncate at cap rather than fail — a partial parse of a
      // pathologically huge page still beats no audit row at all.
      chunks.push(value.slice(0, value.byteLength - (bytes - cap)));
      await reader.cancel();
      bytes = cap;
      break;
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(bytes);
  let off = 0;
  for (const c of chunks) {
    merged.set(c, off);
    off += c.byteLength;
  }
  return { text: new TextDecoder('utf-8', { fatal: false }).decode(merged), bytes };
}

// Redirects are followed manually so the chain is recorded and every hop is
// SSRF-checked — fetch's automatic mode would happily follow a redirect into
// 169.254.169.254.
export async function fetchPage(url: string): Promise<FetchPageResult> {
  const started = Date.now();
  const chain: string[] = [];
  let current = url;

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertSafeUrl(current);
      const res = await fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          'user-agent': SEO_CRAWLER_USER_AGENT,
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      const location = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && location && hop < MAX_REDIRECTS) {
        res.body?.cancel().catch(() => {});
        chain.push(current);
        current = new URL(location, current).toString();
        continue;
      }

      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        headers[k] = v;
      });
      const contentType = headers['content-type'] ?? null;
      const isHtml = contentType?.includes('html') ?? false;

      let html: string | null = null;
      let bytes = 0;
      if (isHtml && res.status < 300) {
        const body = await readBodyCapped(res, MAX_HTML_BYTES);
        html = body.text;
        bytes = body.bytes;
      } else {
        const len = Number(headers['content-length'] ?? 0);
        bytes = Number.isFinite(len) ? len : 0;
        res.body?.cancel().catch(() => {});
      }

      return {
        requestedUrl: url,
        finalUrl: current,
        httpStatus: res.status,
        headers,
        html,
        contentType,
        redirectChain: chain,
        responseTimeMs: Date.now() - started,
        responseBytes: bytes,
      };
    }
    // MAX_REDIRECTS exceeded without a terminal response.
    return {
      requestedUrl: url,
      finalUrl: current,
      httpStatus: null,
      headers: {},
      html: null,
      contentType: null,
      redirectChain: chain,
      responseTimeMs: Date.now() - started,
      responseBytes: 0,
      error: 'too-many-redirects',
    };
  } catch (err) {
    return {
      requestedUrl: url,
      finalUrl: current,
      httpStatus: null,
      headers: {},
      html: null,
      contentType: null,
      redirectChain: chain,
      responseTimeMs: Date.now() - started,
      responseBytes: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export type FrontierEntry = {
  url: string; // normalized
  depth: number;
  from: 'seed' | 'link' | 'sitemap' | 'redirect';
};

export type CrawlBootstrap = {
  robotsTxt: string | null;
  sitemapUrls: string[];
  frontier: FrontierEntry[];
};

// Discovery: robots.txt → sitemaps (with index recursion) → seed frontier.
// Sitemap-discovered pages get depth 1: depth means link depth from the
// seed, and a page reachable only via the sitemap has no click path — depth 1
// keeps the orphan rule (incoming 0 && depth > 0) able to flag it.
export async function bootstrapCrawl(
  startUrl: string,
  opts: { ignoreQueryParams?: boolean } = {},
): Promise<CrawlBootstrap> {
  const seed = normalizeUrl(startUrl, undefined, opts);
  if (!seed) throw new Error(`Invalid start URL: ${startUrl}`);
  const origin = new URL(seed).origin;

  let robotsTxt: string | null = null;
  const robotsRes = await fetchPage(`${origin}/robots.txt`);
  if (robotsRes.httpStatus === 200) {
    // robots.txt is text/plain; fetchPage only reads html bodies, so re-read
    // via a direct capped fetch when the status was good.
    const res = await fetch(`${origin}/robots.txt`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'user-agent': SEO_CRAWLER_USER_AGENT },
    }).catch(() => null);
    if (res?.ok) {
      const body = await readBodyCapped(res, 512_000);
      robotsTxt = body.text;
    }
  }

  const robots = parseRobotsTxt(robotsTxt ?? '');
  const sitemapQueue = [...new Set([...robots.sitemaps, `${origin}/sitemap.xml`])];
  const sitemapUrls: string[] = [];
  let docsFetched = 0;

  while (sitemapQueue.length && docsFetched < MAX_SITEMAP_DOCS && sitemapUrls.length < MAX_SITEMAP_URLS) {
    const smUrl = sitemapQueue.shift()!;
    docsFetched++;
    try {
      await assertSafeUrl(smUrl);
      const res = await fetch(smUrl, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { 'user-agent': SEO_CRAWLER_USER_AGENT },
      });
      if (!res.ok) {
        res.body?.cancel().catch(() => {});
        continue;
      }
      const body = await readBodyCapped(res, MAX_HTML_BYTES);
      const parsed = parseSitemap(body.text);
      sitemapQueue.push(...parsed.childSitemaps);
      for (const u of parsed.urls) {
        if (sitemapUrls.length >= MAX_SITEMAP_URLS) break;
        sitemapUrls.push(u);
      }
    } catch {
      // Unreachable/unsafe sitemap URL — discovery is best-effort.
    }
  }

  const frontier: FrontierEntry[] = [{ url: seed, depth: 0, from: 'seed' }];
  const seen = new Set([seed]);
  for (const raw of sitemapUrls) {
    const n = normalizeUrl(raw, origin, opts);
    if (!n || !isInternalUrl(n, seed) || seen.has(n)) continue;
    seen.add(n);
    frontier.push({ url: n, depth: 1, from: 'sitemap' });
  }

  return { robotsTxt, sitemapUrls, frontier };
}

// Include/exclude are simple substring matches against the URL path — the
// settings UI sells them as "path contains".
function matchesPatterns(url: string, settings: SeoProjectSettings): boolean {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return false;
  }
  if (settings.excludePatterns?.some((p) => p && path.includes(p))) return false;
  if (settings.includePatterns?.length) {
    return settings.includePatterns.some((p) => p && path.includes(p));
  }
  return true;
}

export type CrawlChunkInput = {
  frontier: FrontierEntry[];
  seen: string[]; // normalized URLs already fetched or queued this run
  baseUrl: string;
  robotsTxt: string | null;
  settings: SeoProjectSettings;
  maxDepth: number;
  pageBudget: number; // pages this run may still record
  chunkSize: number;
  concurrency?: number;
};

export type CrawlChunkOutput = {
  pages: ExtractResult[];
  frontier: FrontierEntry[];
  seen: string[];
};

// Robots-disallowed URLs become stub rows without a fetch: the block itself
// is audit signal (sitemap/robots rules key on it), and recording it costs
// no request.
function robotsBlockedStub(entry: FrontierEntry): ExtractResult {
  return {
    page: {
      url: entry.url,
      urlHash: urlHash(entry.url),
      httpStatus: null,
      redirectChain: [],
      depth: entry.depth,
      discoveredFrom: entry.from,
      indexable: false,
      indexabilityReason: 'robots-blocked',
      meta: {},
    },
    links: [],
  };
}

export async function crawlChunk(input: CrawlChunkInput): Promise<CrawlChunkOutput> {
  const robots: ParsedRobots = parseRobotsTxt(input.robotsTxt ?? '');
  const seen = new Set(input.seen);
  const frontier = [...input.frontier];
  const normOpts = { ignoreQueryParams: input.settings.ignoreQueryParams };

  const takeCount = Math.min(input.chunkSize, input.pageBudget, frontier.length);
  const batch = frontier.splice(0, takeCount);
  const pages: ExtractResult[] = [];

  const queue = [...batch];
  const workers = Array.from({ length: Math.max(1, input.concurrency ?? DEFAULT_CONCURRENCY) }, async () => {
    for (;;) {
      const entry = queue.shift();
      if (!entry) return;

      if (!robots.isAllowed(entry.url)) {
        pages.push(robotsBlockedStub(entry));
        continue;
      }

      const fetched = await fetchPage(entry.url);
      const finalNormalized = normalizeUrl(fetched.finalUrl, undefined, normOpts) ?? entry.url;
      // The row keeps the requested URL identity; a followed redirect marks
      // the final URL as seen so the target isn't crawled twice.
      if (finalNormalized !== entry.url) seen.add(finalNormalized);

      const result = extractPage({
        html: fetched.html ?? '',
        url: entry.url,
        baseUrl: input.baseUrl,
        httpStatus: fetched.httpStatus ?? 0,
        headers: fetched.headers,
        redirectChain: fetched.redirectChain,
        responseTimeMs: fetched.responseTimeMs,
        responseBytes: fetched.responseBytes,
        depth: entry.depth,
        discoveredFrom: entry.from,
        robotsBlocked: false,
        ignoreQueryParams: input.settings.ignoreQueryParams,
      });
      // Network failure has no real status — keep the row but null the 0 out
      // so status-code rules don't misread it.
      if (fetched.httpStatus === null) result.page.httpStatus = null;
      if (fetched.error) result.page.meta = { ...result.page.meta, headers: undefined };
      if (finalNormalized !== entry.url) result.page.finalUrl = finalNormalized;
      pages.push(result);

      // Enqueue newly discovered internal links.
      if (entry.depth < input.maxDepth) {
        for (const link of result.links) {
          if (seen.size >= MAX_SEEN) break;
          if (!link.isInternal || seen.has(link.href)) continue;
          if (!matchesPatterns(link.href, input.settings)) continue;
          seen.add(link.href);
          frontier.push({ url: link.href, depth: entry.depth + 1, from: 'link' });
        }
      }
    }
  });
  await Promise.all(workers);

  return { pages, frontier, seen: [...seen] };
}
