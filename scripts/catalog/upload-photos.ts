/**
 * Phase B — upload the Gildan catalog mockup images to S3 and backfill the
 * catalog tables with proxy URLs + pixel dimensions.
 *
 * Source images: a flat dir of files named as flattened InkSoft CDN URLs, e.g.
 *   cdn.inksoft.com_images_products_756_products_8000_Black_front_500.png
 * which maps from catalog_sides.source_image_path (already ?decache-stripped):
 *   filename = "cdn.inksoft.com" + source_image_path.replaceAll("/", "_")
 *
 * For each UNIQUE source path (deduped across sides + style fronts): read its
 * pixel size with sharp, upload to the shared S3 bucket (media/<uuid>.png), then
 * UPDATE every catalog row sharing that path with the resulting /api/media/proxy
 * URL (+ width/height for sides). Resumable + idempotent: only rows whose URL is
 * still null are processed, so a re-run finishes a partial batch.
 *
 *   bun scripts/catalog/upload-photos.ts --limit=1   # canary
 *   bun scripts/catalog/upload-photos.ts             # full batch
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

import { readFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import postgres from 'postgres';
import sharp from 'sharp';
import { uploadToS3 } from '../../lib/s3/upload';

const PHOTO_DIR =
  process.env.CATALOG_PHOTO_DIR ||
  '/Users/dancoyle/Documents/philaprints.com/applications/web/product-photos';
const CONCURRENCY = Number(process.env.CATALOG_UPLOAD_CONCURRENCY || 8);
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : Infinity;

const DEST_URL = process.env.DATABASE_URL;
if (!DEST_URL) throw new Error('DATABASE_URL is not set');

const fileFor = (cleanPath: string): string =>
  'cdn.inksoft.com' + cleanPath.replace(/\//g, '_');
const mimeFor = (f: string): string =>
  /\.jpe?g$/i.test(f) ? 'image/jpeg' : /\.webp$/i.test(f) ? 'image/webp' : 'image/png';

async function mapPool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    })
  );
  return out;
}

async function main() {
  const dst = postgres(DEST_URL!, { max: Math.max(4, CONCURRENCY) });
  try {
    // Rows still needing an image, grouped by their source path.
    const sideRows = await dst<{ p: string }[]>`
      select distinct source_image_path as p
      from catalog_sides
      where source_image_path is not null and image_url is null`;
    const styleRows = await dst<{ p: string }[]>`
      select distinct source_image_path_front as p
      from catalog_styles
      where source_image_path_front is not null and front_image_url is null`;

    // Reuse URLs already uploaded for the same path (resume / cross-table dedupe).
    const knownSides = await dst<{ p: string; u: string }[]>`
      select distinct source_image_path as p, image_url as u
      from catalog_sides where image_url is not null and source_image_path is not null`;
    const knownStyles = await dst<{ p: string; u: string }[]>`
      select distinct source_image_path_front as p, front_image_url as u
      from catalog_styles where front_image_url is not null and source_image_path_front is not null`;
    const pathToUrl = new Map<string, string>();
    for (const r of [...knownSides, ...knownStyles]) if (!pathToUrl.has(r.p)) pathToUrl.set(r.p, r.u);

    const allPaths = Array.from(new Set([...sideRows.map((r) => r.p), ...styleRows.map((r) => r.p)]));
    const toUpload = allPaths.filter((p) => !pathToUrl.has(p)).slice(0, LIMIT);
    console.log(
      `paths needing image: ${allPaths.length} | already uploaded (reuse): ${pathToUrl.size} | uploading now: ${toUpload.length}` +
        (LIMIT !== Infinity ? ` (--limit=${LIMIT})` : '')
    );

    let uploaded = 0, missing = 0, failed = 0;
    const dims = new Map<string, { w?: number; h?: number }>();
    const missingFiles: string[] = [];

    await mapPool(toUpload, CONCURRENCY, async (p) => {
      const fp = join(PHOTO_DIR, fileFor(p));
      let buf: Buffer;
      try {
        buf = await readFile(fp);
      } catch {
        missing++; missingFiles.push(fileFor(p)); return;
      }
      try {
        const meta = await sharp(buf).metadata();
        const res = await uploadToS3(buf, basename(fp), mimeFor(fp));
        pathToUrl.set(p, res.url);
        dims.set(p, { w: meta.width, h: meta.height });
        uploaded++;
        if (uploaded % 100 === 0) console.log(`  …uploaded ${uploaded}/${toUpload.length}`);
      } catch (e) {
        failed++;
        console.error(`  upload failed for ${fileFor(p)}: ${(e as Error).message}`);
      }
    });

    // Backfill: one UPDATE per uploaded path (covers every row sharing it).
    let sidesSet = 0, stylesSet = 0;
    for (const [p, url] of pathToUrl) {
      const d = dims.get(p) ?? {};
      const sres = await dst`
        update catalog_sides set image_url = ${url}, width = ${d.w ?? null}, height = ${d.h ?? null}, updated_at = now()
        where source_image_path = ${p} and image_url is null`;
      sidesSet += sres.count;
      const stres = await dst`
        update catalog_styles set front_image_url = ${url}, updated_at = now()
        where source_image_path_front = ${p} and front_image_url is null`;
      stylesSet += stres.count;
    }

    console.log(
      `uploaded ${uploaded} | missing-on-disk ${missing} | failed ${failed} | backfilled sides ${sidesSet}, style-fronts ${stylesSet}`
    );
    if (missingFiles.length) console.log(`  missing samples: ${missingFiles.slice(0, 5).join(', ')}`);
  } finally {
    await dst.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
