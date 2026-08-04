/**
 * Phase B-0 — download the catalog mockup images from their source CDN into the
 * flat directory that `upload-photos.ts` expects.
 *
 * `import-gildan.ts` restores catalog rows but not images: it carries only
 * `source_image_path` (e.g. /images/products/756/products/8000/White/front/500.png).
 * Phase B (`upload-photos.ts`) then reads files named
 *   cdn.inksoft.com + source_image_path.replaceAll("/", "_")
 * from CATALOG_PHOTO_DIR, uploads them to S3 and backfills the URLs.
 *
 * That leaves a gap: if the local photo directory is gone, there is no way back
 * to images short of a re-download. This fills it, so the pair is
 *
 *   bun scripts/catalog/fetch-photos.ts    # CDN  -> CATALOG_PHOTO_DIR
 *   bun scripts/catalog/upload-photos.ts   # dir  -> S3 + DB backfill
 *
 * Resumable + idempotent: a path whose file already exists on disk is skipped,
 * so a re-run finishes a partial batch and costs nothing when complete.
 *
 *   CATALOG_PHOTO_DIR=/path/to/photos bun scripts/catalog/fetch-photos.ts --limit=5
 *   CATALOG_PHOTO_DIR=/path/to/photos bun scripts/catalog/fetch-photos.ts
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

import { mkdir, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import postgres from 'postgres';

const PHOTO_DIR = process.env.CATALOG_PHOTO_DIR;
if (!PHOTO_DIR) {
  console.error('Error: CATALOG_PHOTO_DIR env var is required — the directory to download into.');
  process.exit(1);
}

// Same host the paths were harvested from; overridable if the catalog is ever
// re-pointed at a different origin.
const CDN_BASE = process.env.CATALOG_CDN_BASE || 'https://cdn.inksoft.com';
const CONCURRENCY = Number(process.env.CATALOG_FETCH_CONCURRENCY || 8);
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : Infinity;

const DEST_URL = process.env.DATABASE_URL;
if (!DEST_URL) throw new Error('DATABASE_URL is not set');

/** Must match upload-photos.ts exactly — it reads what this writes. */
const fileFor = (cleanPath: string): string =>
  'cdn.inksoft.com' + cleanPath.replace(/\//g, '_');

async function mapPool<T>(items: T[], n: number, fn: (t: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

async function exists(p: string): Promise<boolean> {
  try {
    const s = await stat(p);
    return s.size > 0;
  } catch {
    return false;
  }
}

async function main() {
  await mkdir(PHOTO_DIR!, { recursive: true });
  const dst = postgres(DEST_URL!, { max: 4 });

  try {
    // Same set upload-photos.ts will look for: every path still missing a URL.
    const sideRows = await dst<{ p: string }[]>`
      select distinct source_image_path as p
      from catalog_sides
      where source_image_path is not null and image_url is null`;
    const styleRows = await dst<{ p: string }[]>`
      select distinct source_image_path_front as p
      from catalog_styles
      where source_image_path_front is not null and front_image_url is null`;

    const allPaths = Array.from(
      new Set([...sideRows.map((r) => r.p), ...styleRows.map((r) => r.p)]),
    ).slice(0, LIMIT);

    console.log(
      `paths needing an image: ${allPaths.length}` +
        (LIMIT !== Infinity ? ` (--limit=${LIMIT})` : '') +
        ` | source: ${CDN_BASE} | dest: ${PHOTO_DIR}`,
    );

    let fetched = 0, skipped = 0, failed = 0;
    const failures: string[] = [];

    await mapPool(allPaths, CONCURRENCY, async (p) => {
      const dest = join(PHOTO_DIR!, fileFor(p));
      if (await exists(dest)) { skipped++; return; }

      try {
        const res = await fetch(`${CDN_BASE}${p}`);
        if (!res.ok) {
          failed++; failures.push(`${res.status} ${p}`);
          return;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length === 0) {
          failed++; failures.push(`empty ${p}`);
          return;
        }
        await writeFile(dest, buf);
        fetched++;
        if (fetched % 100 === 0) console.log(`  …fetched ${fetched}`);
      } catch (e) {
        failed++;
        failures.push(`${(e as Error).message} ${p}`);
      }
    });

    console.log(`\nfetched: ${fetched} | already on disk: ${skipped} | failed: ${failed}`);
    if (failures.length) {
      console.log('first failures:');
      for (const f of failures.slice(0, 10)) console.log(`  ${f}`);
      if (failures.length > 10) console.log(`  …and ${failures.length - 10} more`);
    }
    console.log('\nnext: bun scripts/catalog/upload-photos.ts');
  } finally {
    await dst.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
