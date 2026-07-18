/**
 * Unpack a user-uploaded `.zip` containing an HTML page plus its sibling
 * assets (images, CSS, JS, fonts). Each entry is uploaded to S3 under a
 * single `media/<uuid>/...` prefix so that the html-embed `<iframe>` can
 * resolve relative refs via the existing path-based media proxy
 * (`/api/media/proxy/media/<uuid>/<rel-path>`).
 *
 * Storage strategy: we insert ONE `media` row per file. That keeps the
 * media-management UI honest (each file is countable / billable) while still
 * letting siblings resolve at the same prefix, since the proxy looks up by
 * S3 key, not by media-row id.
 */
import JSZip from 'jszip';
import { randomUUID } from 'crypto';
import { uploadToS3, type UploadResult } from '@/lib/s3/upload';

// Hard caps. These are intentionally small — the html-embed pipeline is for
// hand-built pitch decks and landing pages, not for shipping full SPAs.
export const MAX_ZIP_TOTAL_BYTES = 50 * 1024 * 1024; // 50 MB uncompressed
export const MAX_ZIP_FILE_COUNT = 200;
export const MAX_ZIP_PER_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

// Allowed extensions inside the zip. Anything outside this list is a hard
// reject — we don't want users uploading executables or shells via zip.
const ALLOWED_EXT_TO_MIME: Record<string, string> = {
  html: 'text/html',
  htm: 'text/html',
  xhtml: 'application/xhtml+xml',
  css: 'text/css',
  js: 'application/javascript',
  mjs: 'application/javascript',
  json: 'application/json',
  txt: 'text/plain',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  eot: 'application/vnd.ms-fontobject',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  // Source maps — harmless and devs occasionally include them.
  map: 'application/json',
};

function extOf(filename: string): string {
  const idx = filename.lastIndexOf('.');
  return idx === -1 ? '' : filename.slice(idx + 1).toLowerCase();
}

/** True if the path tries to escape its archive (`..` segment, abs path, drive prefix). */
export function isPathTraversal(path: string): boolean {
  if (path.startsWith('/') || path.startsWith('\\')) return true;
  // Windows-style drive prefix.
  if (/^[a-zA-Z]:[\\/]/.test(path)) return true;
  const parts = path.split(/[/\\]/);
  return parts.some((p) => p === '..');
}

export interface ZipUploadEntry {
  /** Path within the zip, normalized to forward-slash, no leading slash. */
  relativePath: string;
  /** Resolved mime type used for both S3 ContentType + media row. */
  mimeType: string;
  /** Result returned by uploadToS3 (key prefix mode). */
  upload: UploadResult;
}

export interface ZipUploadResult {
  /** UUID directory used as the S3 prefix. */
  prefix: string;
  /** All uploaded files (including the index). */
  entries: ZipUploadEntry[];
  /** The HTML file that should be the iframe entry point. */
  index: ZipUploadEntry;
}

export interface UnpackOptions {
  /**
   * Override for the upload function. Tests inject a mock; production passes
   * the real `uploadToS3`.
   */
  upload?: typeof uploadToS3;
}

/**
 * Unpack a zip buffer, validate it, and upload every entry to S3 under a
 * shared UUID prefix.
 *
 * Throws an Error with a `.statusCode` of 400 when validation fails so the
 * route handler can surface a sensible 400 to the client.
 */
export async function unpackAndUploadZip(
  zipBuffer: Buffer,
  options: UnpackOptions = {}
): Promise<ZipUploadResult> {
  const upload = options.upload ?? uploadToS3;

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(zipBuffer);
  } catch {
    throw httpError(400, 'Could not read zip archive');
  }

  // Collect file entries (skip directories) and validate up-front before any
  // S3 round-trip. We resolve all buffers in parallel inside the validation
  // pass since JSZip's file objects are lazy.
  const fileEntries: { path: string; entry: JSZip.JSZipObject }[] = [];
  zip.forEach((path, entry) => {
    if (entry.dir) return;
    fileEntries.push({ path, entry });
  });

  if (fileEntries.length === 0) {
    throw httpError(400, 'Zip archive is empty');
  }
  if (fileEntries.length > MAX_ZIP_FILE_COUNT) {
    throw httpError(400, `Zip archive contains too many files (max ${MAX_ZIP_FILE_COUNT})`);
  }

  // Path traversal + extension allow-list pre-check.
  for (const { path } of fileEntries) {
    if (isPathTraversal(path)) {
      throw httpError(400, `Zip entry has illegal path: ${path}`);
    }
    const ext = extOf(path);
    if (!ext || !(ext in ALLOWED_EXT_TO_MIME)) {
      throw httpError(400, `Zip entry has disallowed file type: ${path}`);
    }
  }

  // Read all bodies (in parallel) and enforce per-file + total caps.
  const buffers: { path: string; mimeType: string; buffer: Buffer }[] = await Promise.all(
    fileEntries.map(async ({ path, entry }) => {
      const u8 = await entry.async('uint8array');
      if (u8.byteLength > MAX_ZIP_PER_FILE_BYTES) {
        throw httpError(
          400,
          `Zip entry ${path} exceeds per-file cap of ${MAX_ZIP_PER_FILE_BYTES} bytes`
        );
      }
      return {
        path: normalizePath(path),
        mimeType: ALLOWED_EXT_TO_MIME[extOf(path)],
        buffer: Buffer.from(u8),
      };
    })
  );

  const totalBytes = buffers.reduce((acc, b) => acc + b.buffer.byteLength, 0);
  if (totalBytes > MAX_ZIP_TOTAL_BYTES) {
    throw httpError(
      400,
      `Zip archive uncompressed size ${totalBytes} exceeds ${MAX_ZIP_TOTAL_BYTES} bytes`
    );
  }

  // Pick the index. Priority: index.html at root → first .html at root → first .html anywhere.
  const indexPath = pickIndex(buffers.map((b) => b.path));
  if (!indexPath) {
    throw httpError(400, 'Zip archive contains no .html file');
  }

  // Single shared prefix.
  const prefix = randomUUID();

  // Upload each entry. Run sequentially with a small concurrency cap so we
  // don't blast 200 simultaneous S3 connections from one route invocation.
  const entries: ZipUploadEntry[] = [];
  const concurrency = 6;
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < buffers.length) {
      const i = cursor++;
      const item = buffers[i];
      const key = `media/${prefix}/${item.path}`;
      const result = await upload(item.buffer, item.path, item.mimeType, { key });
      entries.push({
        relativePath: item.path,
        mimeType: item.mimeType,
        upload: result,
      });
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, buffers.length) }, () => worker()));

  const indexEntry = entries.find((e) => e.relativePath === indexPath);
  if (!indexEntry) {
    // Should be impossible — we already verified the index exists.
    throw httpError(500, 'Index entry missing after upload');
  }

  return { prefix, entries, index: indexEntry };
}

/** Normalize separators + strip a single leading `./`. */
function normalizePath(path: string): string {
  let out = path.replace(/\\/g, '/');
  if (out.startsWith('./')) out = out.slice(2);
  return out;
}

/** Pick the html entry point. Returns the matching path or null. */
export function pickIndex(paths: string[]): string | null {
  // 1. exact `index.html` at root
  const root = paths.find((p) => p === 'index.html');
  if (root) return root;
  // 2. any `.html` at the root level
  const rootHtml = paths.find((p) => /^[^/]+\.(html?|xhtml)$/i.test(p));
  if (rootHtml) return rootHtml;
  // 3. first `.html` anywhere (shallowest first by path-segment count)
  const anyHtml = paths
    .filter((p) => /\.(html?|xhtml)$/i.test(p))
    .sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))[0];
  return anyHtml ?? null;
}

interface HttpError extends Error {
  statusCode: number;
}

function httpError(status: number, message: string): HttpError {
  const err = new Error(message) as HttpError;
  err.statusCode = status;
  return err;
}

export function isHttpError(err: unknown): err is HttpError {
  return err instanceof Error && typeof (err as HttpError).statusCode === 'number';
}
