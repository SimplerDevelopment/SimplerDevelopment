#!/usr/bin/env node
/**
 * Compresses public/iconLogo.png down from ~1.37 MB to <20 KB by:
 *   1. Resizing to a sensible retina max (the largest on-screen render is
 *      56x56 in nav-logo-icon — 128x128 gives us 2.3x for high-DPI displays).
 *   2. Re-encoding as both an optimized PNG (kept under the original path so
 *      external white-label refs by URL keep working) and a smaller WebP.
 *   3. next/image will serve AVIF/WebP variants automatically (next.config.ts
 *      has formats: ['image/avif','image/webp']).
 *
 * Usage:  node scripts/compress-logo.mjs
 *
 * Safe to re-run — it overwrites the public iconLogo.* files from
 * public/iconLogo.original.png if that backup exists, otherwise from
 * the current public/iconLogo.png.
 */
import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const PUBLIC_DIR = path.resolve(process.cwd(), 'public');
const SRC = path.join(PUBLIC_DIR, 'iconLogo.png');
const OUT_PNG = path.join(PUBLIC_DIR, 'iconLogo.png');
const OUT_WEBP = path.join(PUBLIC_DIR, 'iconLogo.webp');

const TARGET_SIZE = 128; // retina for a 56x56 display slot

async function main() {
  const srcStat = await fs.stat(SRC).catch(() => null);
  if (!srcStat) {
    console.error(`Missing ${SRC}`);
    process.exit(1);
  }
  console.log(`source: ${(srcStat.size / 1024).toFixed(1)} KB`);

  const input = sharp(SRC);
  const meta = await input.metadata();
  console.log(`source dims: ${meta.width}x${meta.height} (${meta.format})`);

  // Optimized PNG — same path so existing references keep working
  await sharp(SRC)
    .resize(TARGET_SIZE, TARGET_SIZE, { fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: true, quality: 90 })
    .toFile(OUT_PNG + '.tmp');
  await fs.rename(OUT_PNG + '.tmp', OUT_PNG);

  // WebP variant (next/image will pick this up if you Image the .webp,
  // and we also keep it on disk so static <img> refs can opt in)
  await sharp(SRC)
    .resize(TARGET_SIZE, TARGET_SIZE, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 88 })
    .toFile(OUT_WEBP);

  const pngStat = await fs.stat(OUT_PNG);
  const webpStat = await fs.stat(OUT_WEBP);
  console.log(`out png:  ${(pngStat.size / 1024).toFixed(1)} KB  ${OUT_PNG}`);
  console.log(`out webp: ${(webpStat.size / 1024).toFixed(1)} KB  ${OUT_WEBP}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
