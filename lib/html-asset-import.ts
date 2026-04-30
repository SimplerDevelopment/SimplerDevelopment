import { JSDOM } from 'jsdom';
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
}

interface ImportResult {
  html: string;
  importedCount: number;
  skippedCount: number;
}

const DEFAULT_MAX_ASSET_BYTES = 5_000_000; // 5 MB per asset
const DEFAULT_MAX_ASSETS = 200;

// Pull external asset URLs out of an HTML document, fetch each one, push it
// through the media manager (S3 + media row), and rewrite every reference to
// the new proxy URL. Same-origin (`/api/media/proxy/...`) and `data:` URLs
// are left as-is. Fetch failures leave the original URL in place.
export async function importHtmlAssets(
  html: string,
  opts: AssetImportOpts
): Promise<ImportResult> {
  const maxBytes = opts.maxAssetBytes ?? DEFAULT_MAX_ASSET_BYTES;
  const maxAssets = opts.maxAssets ?? DEFAULT_MAX_ASSETS;

  const dom = new JSDOM(html);
  const doc = dom.window.document;

  // url -> rewritten url. Memoized so two img tags with the same src share a
  // single media row.
  const cache = new Map<string, string | null>();
  let imported = 0;
  let skipped = 0;

  async function ingest(rawUrl: string): Promise<string | null> {
    if (!rawUrl) return null;
    if (cache.has(rawUrl)) return cache.get(rawUrl) ?? null;
    if (imported >= maxAssets) {
      cache.set(rawUrl, null);
      return null;
    }

    let resolved: URL;
    try {
      resolved = opts.baseUrl ? new URL(rawUrl, opts.baseUrl) : new URL(rawUrl);
    } catch {
      cache.set(rawUrl, null);
      return null;
    }

    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
      cache.set(rawUrl, null);
      return null;
    }
    if (resolved.pathname.startsWith('/api/media/proxy/')) {
      cache.set(rawUrl, resolved.pathname);
      return resolved.pathname;
    }

    let bytes: ArrayBuffer;
    let contentType: string;
    try {
      const res = await fetch(resolved.toString(), {
        redirect: 'follow',
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const len = Number(res.headers.get('content-length') ?? 0);
      if (len > maxBytes) throw new Error(`asset > ${maxBytes} bytes`);
      bytes = await res.arrayBuffer();
      if (bytes.byteLength > maxBytes) throw new Error(`asset > ${maxBytes} bytes`);
      contentType = (res.headers.get('content-type') ?? '').split(';')[0].trim() || 'application/octet-stream';
    } catch {
      skipped++;
      cache.set(rawUrl, null);
      return null;
    }

    const filename = filenameFromUrl(resolved, contentType);
    const buffer = Buffer.from(bytes);

    let proxyUrl: string;
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
      proxyUrl = row?.url ?? uploadResult.url;
    } catch {
      skipped++;
      cache.set(rawUrl, null);
      return null;
    }

    imported++;
    cache.set(rawUrl, proxyUrl);
    return proxyUrl;
  }

  // Element-attribute rewrites
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
    const els = Array.from(doc.querySelectorAll(selector)) as Element[];
    for (const el of els) {
      const v = el.getAttribute(attr);
      if (!v) continue;
      const rewritten = await ingest(v);
      if (rewritten) el.setAttribute(attr, rewritten);
    }
  }

  // srcset can pack multiple URLs separated by commas, each with an optional
  // width/density descriptor.
  const srcsetEls = Array.from(doc.querySelectorAll('img[srcset], source[srcset]')) as Element[];
  for (const el of srcsetEls) {
    const v = el.getAttribute('srcset');
    if (!v) continue;
    const parts = v.split(',').map((s) => s.trim()).filter(Boolean);
    const rewritten: string[] = [];
    for (const part of parts) {
      const [u, ...rest] = part.split(/\s+/);
      const newU = await ingest(u);
      rewritten.push([newU ?? u, ...rest].join(' '));
    }
    el.setAttribute('srcset', rewritten.join(', '));
  }

  // <style>…url(...)…</style>
  const styleEls = Array.from(doc.querySelectorAll('style')) as Element[];
  for (const el of styleEls) {
    const css = el.textContent ?? '';
    const rewritten = await rewriteCssUrls(css, ingest);
    if (rewritten !== css) el.textContent = rewritten;
  }

  // inline style="…url(...)…"
  const styledEls = Array.from(doc.querySelectorAll('[style]')) as Element[];
  for (const el of styledEls) {
    const css = el.getAttribute('style');
    if (!css) continue;
    const rewritten = await rewriteCssUrls(css, ingest);
    if (rewritten !== css) el.setAttribute('style', rewritten);
  }

  return {
    html: dom.serialize(),
    importedCount: imported,
    skippedCount: skipped,
  };
}

async function rewriteCssUrls(
  css: string,
  ingest: (u: string) => Promise<string | null>
): Promise<string> {
  // Find every url(...) including quoted variants, in source order.
  const regex = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
  const segments: Array<{ start: number; end: number; original: string; quoted: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(css)) !== null) {
    segments.push({ start: m.index, end: m.index + m[0].length, original: m[2], quoted: m[1] });
  }
  if (segments.length === 0) return css;

  let out = '';
  let cursor = 0;
  for (const seg of segments) {
    out += css.slice(cursor, seg.start);
    const newUrl = await ingest(seg.original);
    const finalUrl = newUrl ?? seg.original;
    const q = seg.quoted || '"';
    out += `url(${q}${finalUrl}${q})`;
    cursor = seg.end;
  }
  out += css.slice(cursor);
  return out;
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
