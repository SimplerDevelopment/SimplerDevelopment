import { parse } from 'node-html-parser';
import { db } from '@/lib/db';
import { media } from '@/lib/db/schema';
import { uploadToS3 } from '@/lib/s3/upload';

interface AssetImportOpts {
  websiteId: number;
  clientId: number;
  uploadedBy: number;
  // When the source HTML had its own URL, we resolve relative refs against it.
  baseUrl?: string;
  // Limits + safety. Anything bigger / non-http is skipped silently.
  maxAssetBytes?: number;
  maxAssets?: number;
  // How many fetches in flight at once. Higher = faster on remote pages with
  // many assets but more pressure on memory + outbound sockets.
  concurrency?: number;
  // Per-asset fetch deadline. Stragglers are skipped, leaving the original URL.
  perAssetTimeoutMs?: number;
}

interface ImportResult {
  html: string;
  importedCount: number;
  skippedCount: number;
}

const DEFAULT_MAX_ASSET_BYTES = 5_000_000; // 5 MB per asset
const DEFAULT_MAX_ASSETS = 200;
const DEFAULT_CONCURRENCY = 8;
const DEFAULT_TIMEOUT_MS = 8_000;

// Pull external asset URLs out of an HTML document, fetch each one, push it
// through the media manager (S3 + media row), and rewrite every reference to
// the new proxy URL. Same-origin (`/api/media/proxy/...`) and `data:` URLs
// are left as-is. Fetch failures leave the original URL in place.
//
// Strategy: a first DOM pass collects every URL. Unique URLs are then fetched
// in parallel (capped) and the result memoized. A second pass writes the
// rewritten URL back to each attribute / CSS reference. Doing all fetches in
// parallel is the difference between a 200-asset page importing in seconds
// vs. timing out the serverless function.
export async function importHtmlAssets(
  html: string,
  opts: AssetImportOpts
): Promise<ImportResult> {
  const maxBytes = opts.maxAssetBytes ?? DEFAULT_MAX_ASSET_BYTES;
  const maxAssets = opts.maxAssets ?? DEFAULT_MAX_ASSETS;
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
  const timeoutMs = opts.perAssetTimeoutMs ?? DEFAULT_TIMEOUT_MS;

  const root = parse(html, {
    voidTag: { closingSlash: true },
    blockTextElements: { script: true, style: true, pre: true },
  });

  // ── Pass 1: collect URLs ────────────────────────────────────────────────
  const urls = new Set<string>();

  const singleAttrSelectors: Array<[string, string]> = [
    ['img[src]', 'src'],
    ['source[src]', 'src'],
    ['video[src]', 'src'],
    ['audio[src]', 'src'],
    ['video[poster]', 'poster'],
    ['script[src]', 'src'],
    ['link[rel="stylesheet"][href]', 'href'],
    ['link[rel="preload"][href]', 'href'],
    ['link[rel="icon"][href]', 'href'],
    ['link[rel="apple-touch-icon"][href]', 'href'],
  ];
  for (const [selector, attr] of singleAttrSelectors) {
    for (const el of root.querySelectorAll(selector)) {
      const v = el.getAttribute(attr);
      if (v) urls.add(v);
    }
  }
  for (const el of root.querySelectorAll('img[srcset], source[srcset]')) {
    const v = el.getAttribute('srcset');
    if (!v) continue;
    for (const part of v.split(',').map((s) => s.trim()).filter(Boolean)) {
      const [u] = part.split(/\s+/);
      if (u) urls.add(u);
    }
  }
  for (const el of root.querySelectorAll('style')) {
    extractCssUrls(el.textContent ?? '').forEach((u) => urls.add(u));
  }
  for (const el of root.querySelectorAll('[style]')) {
    const v = el.getAttribute('style');
    if (v) extractCssUrls(v).forEach((u) => urls.add(u));
  }

  // ── Pass 2: fetch unique URLs in parallel (capped) ──────────────────────
  // The map's value is the Promise so that two callers asking for the same
  // URL share one in-flight request. null = decided to skip.
  const cache = new Map<string, Promise<string | null>>();
  let imported = 0;
  let skipped = 0;
  let active = 0;
  const queue: Array<() => void> = [];
  const acquire = () =>
    new Promise<void>((resolve) => {
      if (active < concurrency) {
        active++;
        resolve();
      } else {
        queue.push(() => {
          active++;
          resolve();
        });
      }
    });
  const release = () => {
    active--;
    queue.shift()?.();
  };

  function ingest(rawUrl: string): Promise<string | null> {
    if (!rawUrl) return Promise.resolve(null);
    const existing = cache.get(rawUrl);
    if (existing) return existing;

    const job = (async () => {
      let resolved: URL;
      try {
        resolved = opts.baseUrl ? new URL(rawUrl, opts.baseUrl) : new URL(rawUrl);
      } catch {
        return null;
      }
      if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return null;
      if (resolved.pathname.startsWith('/api/media/proxy/')) return resolved.pathname;
      if (imported >= maxAssets) return null;

      await acquire();
      try {
        if (imported >= maxAssets) return null;

        let bytes: ArrayBuffer;
        let contentType: string;
        try {
          const res = await fetch(resolved.toString(), {
            redirect: 'follow',
            signal: AbortSignal.timeout(timeoutMs),
          });
          if (!res.ok) throw new Error(`status ${res.status}`);
          const len = Number(res.headers.get('content-length') ?? 0);
          if (len > maxBytes) throw new Error(`asset > ${maxBytes} bytes`);
          bytes = await res.arrayBuffer();
          if (bytes.byteLength > maxBytes) throw new Error(`asset > ${maxBytes} bytes`);
          contentType = (res.headers.get('content-type') ?? '').split(';')[0].trim() || 'application/octet-stream';
        } catch {
          skipped++;
          return null;
        }

        const filename = filenameFromUrl(resolved, contentType);
        const buffer = Buffer.from(bytes);

        try {
          const uploadResult = await uploadToS3(buffer, filename, contentType);
          const [row] = await db
            .insert(media)
            .values({
              filename,
              storedFilename: uploadResult.storedFilename,
              mimeType: uploadResult.mimeType,
              fileSize: uploadResult.fileSize,
              url: uploadResult.url,
              uploadedBy: opts.uploadedBy,
              clientId: opts.clientId,
              websiteId: opts.websiteId,
            })
            .returning({ url: media.url });
          imported++;
          return row?.url ?? uploadResult.url;
        } catch {
          skipped++;
          return null;
        }
      } finally {
        release();
      }
    })();
    cache.set(rawUrl, job);
    return job;
  }

  // Kick off all fetches in parallel; the semaphore enforces concurrency.
  await Promise.all(Array.from(urls, (u) => ingest(u)));

  // ── Pass 3: write rewrites back into the DOM ────────────────────────────
  const rewritten = new Map<string, string | null>();
  for (const [u, p] of cache.entries()) rewritten.set(u, await p);

  for (const [selector, attr] of singleAttrSelectors) {
    for (const el of root.querySelectorAll(selector)) {
      const v = el.getAttribute(attr);
      if (!v) continue;
      const r = rewritten.get(v);
      if (r) el.setAttribute(attr, r);
    }
  }
  for (const el of root.querySelectorAll('img[srcset], source[srcset]')) {
    const v = el.getAttribute('srcset');
    if (!v) continue;
    const parts = v.split(',').map((s) => s.trim()).filter(Boolean);
    const out: string[] = [];
    for (const part of parts) {
      const [u, ...rest] = part.split(/\s+/);
      const r = rewritten.get(u) ?? null;
      out.push([r ?? u, ...rest].join(' '));
    }
    el.setAttribute('srcset', out.join(', '));
  }
  for (const el of root.querySelectorAll('style')) {
    const css = el.textContent ?? '';
    const next = applyCssRewrites(css, rewritten);
    if (next !== css) el.textContent = next;
  }
  for (const el of root.querySelectorAll('[style]')) {
    const css = el.getAttribute('style');
    if (!css) continue;
    const next = applyCssRewrites(css, rewritten);
    if (next !== css) el.setAttribute('style', next);
  }

  return {
    html: root.toString(),
    importedCount: imported,
    skippedCount: skipped,
  };
}

function extractCssUrls(css: string): string[] {
  const out: string[] = [];
  const regex = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(css)) !== null) out.push(m[2]);
  return out;
}

function applyCssRewrites(css: string, map: Map<string, string | null>): string {
  const regex = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
  return css.replace(regex, (match, quote: string, url: string) => {
    const r = map.get(url);
    if (!r) return match;
    const q = quote || '"';
    return `url(${q}${r}${q})`;
  });
}

function filenameFromUrl(u: URL, contentType: string): string {
  const last = u.pathname.split('/').filter(Boolean).pop() ?? '';
  if (last && /\.[a-z0-9]{2,5}$/i.test(last)) return decodeURIComponent(last).slice(0, 200);
  const ext = mimeToExt(contentType);
  const base = last ? decodeURIComponent(last) : 'asset';
  return `${base}.${ext}`.slice(0, 200);
}

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/x-icon': 'ico',
    'font/woff': 'woff',
    'font/woff2': 'woff2',
    'application/font-woff': 'woff',
    'application/font-woff2': 'woff2',
    'text/css': 'css',
    'text/javascript': 'js',
    'application/javascript': 'js',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'audio/mpeg': 'mp3',
  };
  return map[mime.toLowerCase()] ?? 'bin';
}
