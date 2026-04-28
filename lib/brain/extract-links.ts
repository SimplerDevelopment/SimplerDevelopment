/**
 * Brain link extractor — pulls URLs out of an email body, fetches each one's
 * HTML, and parses Open Graph + standard meta tags. Result is stored on the
 * meeting's source_metadata.links[] so the UI can render preview cards.
 *
 * Design notes:
 *   - Runs at meeting Process time, not at email ingest, so cost (network +
 *     latency) is only paid when the user actually wants it.
 *   - Pure stdlib + regex — no cheerio/og-scraper dep. The OG/title/description
 *     parsing is intentionally simple; junk-quality links just get a URL row.
 *   - Basic SSRF defense: refuses to fetch hostnames that resolve to private
 *     IPv4/IPv6 ranges. Vercel can't reach most internal addresses anyway,
 *     but the explicit check keeps logs clean.
 *   - Timeout per request, cap on total URLs, cap on response size.
 */

import { lookup } from 'dns/promises';
import { isIP } from 'net';

export interface LinkMeta {
  /** The URL as it appeared in the email body (after stripping trailing punctuation). */
  url: string;
  /** Final URL after redirects. */
  finalUrl?: string;
  title?: string;
  description?: string;
  /** og:image — absolute URL if available. */
  image?: string;
  /** og:site_name or hostname fallback. */
  siteName?: string;
  /** Set if the fetch failed. UI shows the URL alone in this case. */
  error?: string;
}

const MAX_URLS = 15;
const PER_FETCH_TIMEOUT_MS = 8_000;
const MAX_HTML_BYTES = 1_000_000; // 1MB — enough for <head>, more wastes time

/**
 * Match plain http/https URLs in text. Stops at whitespace, common closing
 * punctuation that's almost never part of a URL, and angle brackets (which
 * sometimes wrap links in plain-text email).
 */
const URL_REGEX = /https?:\/\/[^\s<>"'`)\]}]+/gi;

/**
 * Trailing characters that are usually email punctuation, not part of the URL.
 * "https://example.com." with the period being end-of-sentence.
 */
const TRAILING_TRIM = /[.,;:!?'")\]}]+$/;

export function extractUrlsFromText(text: string): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of text.matchAll(URL_REGEX)) {
    let url = match[0].replace(TRAILING_TRIM, '');
    // Skip mailto, tel, etc — the regex already filters but being explicit.
    if (!/^https?:\/\//i.test(url)) continue;
    // Normalize for dedup — lowercase host, strip fragment.
    let normalized: string;
    try {
      const u = new URL(url);
      u.hash = '';
      u.hostname = u.hostname.toLowerCase();
      normalized = u.toString();
    } catch {
      continue;
    }
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(url);
    if (out.length >= MAX_URLS) break;
  }
  return out;
}

/**
 * Resolve the URL's hostname and refuse private/loopback ranges. Doesn't
 * cover every SSRF vector (DNS rebinding, etc.) but blocks the common
 * targets — internal services, metadata endpoints, localhost.
 */
async function isAllowedHost(url: URL): Promise<boolean> {
  const host = url.hostname;
  // Block obvious targets by name first.
  if (/^(localhost|.+\.local|.+\.internal)$/i.test(host)) return false;

  let ip: string;
  if (isIP(host)) {
    ip = host;
  } else {
    try {
      const result = await lookup(host);
      ip = result.address;
    } catch {
      return false;
    }
  }
  return !isPrivateIp(ip);
}

function isPrivateIp(ip: string): boolean {
  // IPv4
  const v4 = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const a = +v4[1], b = +v4[2];
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 0) return true;
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  // IPv6 — basic checks
  if (ip === '::1' || ip === '::') return true;
  if (ip.toLowerCase().startsWith('fc') || ip.toLowerCase().startsWith('fd')) return true; // unique local
  if (ip.toLowerCase().startsWith('fe80')) return true; // link-local
  return false;
}

async function fetchHtml(url: string): Promise<{ html: string; finalUrl: string }> {
  const u = new URL(url);
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error(`Unsupported protocol: ${u.protocol}`);
  if (!(await isAllowedHost(u))) throw new Error('Blocked: private/loopback host');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PER_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        // Some sites serve different content (or block) based on UA.
        // Identify as a bot but include a contact hint for sites that care.
        'User-Agent': 'SimplerDevelopment-LinkPreview/1.0 (+https://simplerdevelopment.com)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('html') && !ct.includes('xhtml') && !ct.includes('xml')) {
      throw new Error(`Non-HTML content-type: ${ct.split(';')[0]}`);
    }

    // Stream and stop early at MAX_HTML_BYTES — most OG tags live in <head>
    // which is usually well under 100KB.
    const reader = res.body?.getReader();
    if (!reader) throw new Error('No response body');
    const decoder = new TextDecoder();
    let html = '';
    let total = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      html += decoder.decode(value, { stream: true });
      if (total >= MAX_HTML_BYTES) break;
      // Stop early if we've already passed </head> — no useful tags after.
      if (/<\/head>/i.test(html)) break;
    }
    html += decoder.decode();

    return { html, finalUrl: res.url || url };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Decode the small set of HTML entities that show up in title/og:title/etc.
 * Avoids pulling in a full HTML parser dependency.
 */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

/**
 * Extract a meta-tag content value. Handles either order
 * (`<meta property="..." content="...">` or content-first), and either
 * single or double quotes. Lazy but covers the common cases.
 */
function pickMeta(html: string, attrName: 'property' | 'name', value: string): string | undefined {
  const v = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re1 = new RegExp(
    `<meta\\s+(?:[^>]*?\\s)?${attrName}\\s*=\\s*["']${v}["'][^>]*?\\bcontent\\s*=\\s*["']([^"']*?)["']`,
    'i',
  );
  const re2 = new RegExp(
    `<meta\\s+(?:[^>]*?\\s)?content\\s*=\\s*["']([^"']*?)["'][^>]*?\\b${attrName}\\s*=\\s*["']${v}["']`,
    'i',
  );
  const m = html.match(re1) || html.match(re2);
  return m ? decodeEntities(m[1]).trim() : undefined;
}

function pickTitle(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1].trim()).slice(0, 300) : undefined;
}

function resolveUrl(maybeRelative: string, base: string): string {
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return maybeRelative;
  }
}

export async function fetchLinkMeta(url: string): Promise<LinkMeta> {
  try {
    const { html, finalUrl } = await fetchHtml(url);

    const ogTitle = pickMeta(html, 'property', 'og:title');
    const ogDescription = pickMeta(html, 'property', 'og:description');
    const ogImage = pickMeta(html, 'property', 'og:image');
    const ogSiteName = pickMeta(html, 'property', 'og:site_name');
    const titleTag = pickTitle(html);
    const metaDescription = pickMeta(html, 'name', 'description');

    let hostname: string | undefined;
    try { hostname = new URL(finalUrl).hostname; } catch { /* ignore */ }

    return {
      url,
      finalUrl: finalUrl !== url ? finalUrl : undefined,
      title: ogTitle || titleTag,
      description: (ogDescription || metaDescription || '').slice(0, 500) || undefined,
      image: ogImage ? resolveUrl(ogImage, finalUrl) : undefined,
      siteName: ogSiteName || hostname,
    };
  } catch (err) {
    return {
      url,
      error: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200),
    };
  }
}

/**
 * Extract URLs from text and fetch metadata for each in parallel. Existing
 * link metadata is preserved unless `force` is true; transient failures
 * (no metadata, just an `error` field) are retried.
 */
export async function extractAndFetchLinks(
  text: string,
  existing: LinkMeta[] = [],
  opts: { force?: boolean } = {},
): Promise<LinkMeta[]> {
  const urls = extractUrlsFromText(text);
  if (urls.length === 0) return existing.length > 0 ? existing : [];

  const existingByUrl = new Map<string, LinkMeta>();
  for (const e of existing) existingByUrl.set(e.url, e);

  const results = await Promise.all(urls.map(async (url) => {
    const cached = existingByUrl.get(url);
    if (cached && !cached.error && !opts.force) return cached;
    return fetchLinkMeta(url);
  }));

  return results;
}
