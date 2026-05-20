/**
 * One-time generator for blank t-shirt mockup PNGs used as the composite base
 * by the magamommy designer agent. Outputs three colorways (white, black,
 * heather grey) for front and back surfaces, dimensions 2400×3200 @ 300 DPI.
 *
 * These are PLACEHOLDER silhouettes — a simple shirt shape with a neckline
 * cutout, generated via `sharp`. Replace with hi-fi product photography when
 * available; the designer agent only cares about the print-area coordinates
 * (configured in productDesignSurfaces) and the file existing at the URL.
 *
 * Usage:
 *   bun scripts/magamommy/generate-blank-mockups.ts
 *
 * Idempotent: skips files that already exist. Pass --force to regenerate.
 */

import sharp from 'sharp';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

const OUT_DIR = path.resolve(process.cwd(), 'public/assets/magamommy');

// Shirt silhouette as a single SVG path. The coords assume a 2400×3200 canvas
// and roughly approximate a crew-neck tee with sleeves out, body tapered.
function shirtSvg(opts: { fill: string; stroke: string; widthPx: number; heightPx: number }) {
  const w = opts.widthPx;
  const h = opts.heightPx;
  return `
    <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">
      <rect width="100%" height="100%" fill="#ffffff"/>
      <path
        d="
          M ${w * 0.18} ${h * 0.18}
          L ${w * 0.36} ${h * 0.08}
          C ${w * 0.42} ${h * 0.12}, ${w * 0.58} ${h * 0.12}, ${w * 0.64} ${h * 0.08}
          L ${w * 0.82} ${h * 0.18}
          L ${w * 0.94} ${h * 0.30}
          L ${w * 0.78} ${h * 0.38}
          L ${w * 0.78} ${h * 0.92}
          L ${w * 0.22} ${h * 0.92}
          L ${w * 0.22} ${h * 0.38}
          L ${w * 0.06} ${h * 0.30}
          Z
        "
        fill="${opts.fill}" stroke="${opts.stroke}" stroke-width="3"
      />
      <path
        d="M ${w * 0.40} ${h * 0.10} C ${w * 0.46} ${h * 0.16}, ${w * 0.54} ${h * 0.16}, ${w * 0.60} ${h * 0.10}"
        fill="none" stroke="${opts.stroke}" stroke-width="6"
      />
    </svg>
  `;
}

interface Colorway { name: string; fill: string; stroke: string }

const COLORWAYS: Colorway[] = [
  { name: 'white',         fill: '#fafafa', stroke: '#d4d4d4' },
  { name: 'black',         fill: '#1a1a1a', stroke: '#0a0a0a' },
  { name: 'heather-grey',  fill: '#a3a3a3', stroke: '#737373' },
];

const SURFACES = ['front', 'back'] as const;

const WIDTH = 2400;
const HEIGHT = 3200;

async function fileExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

async function generate(force: boolean) {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const results: Array<{ file: string; status: 'created' | 'skipped' }> = [];

  for (const cw of COLORWAYS) {
    for (const surface of SURFACES) {
      const filename = `blank-tee-${cw.name}-${surface}.png`;
      const outPath = path.join(OUT_DIR, filename);

      if (!force && (await fileExists(outPath))) {
        results.push({ file: filename, status: 'skipped' });
        continue;
      }

      const svg = shirtSvg({ fill: cw.fill, stroke: cw.stroke, widthPx: WIDTH, heightPx: HEIGHT });
      await sharp(Buffer.from(svg))
        .png({ compressionLevel: 9 })
        .toFile(outPath);

      results.push({ file: filename, status: 'created' });
    }
  }

  console.log('Magamommy blank-mockup generation complete:');
  for (const r of results) {
    console.log(`  ${r.status.padEnd(8)} ${r.file}`);
  }
  console.log(`Output: ${OUT_DIR}`);
}

const force = process.argv.includes('--force');
generate(force).catch((err) => {
  console.error('[generate-blank-mockups] failed:', err);
  process.exit(1);
});
