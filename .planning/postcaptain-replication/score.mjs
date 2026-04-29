// Pixelmatch-based hard scoring for postcaptain replication.
//
// Reads section pair PNGs from screenshots/sbs/ (desktop) and (optionally)
// screenshots/sbs-mobile/ (mobile, if present). Each pair is `<section>-live.png`
// and `<section>-local.png`. The two images may differ in height because the
// boundary heuristics in sbs.mjs are approximate; we resize the local image to
// match the live image's dimensions before diffing so pixelmatch has same-size
// inputs. We then report % matching pixels (NOT-different / total) per section
// plus a pixel-area-weighted aggregate.
//
// Output: a Markdown table to stdout AND a JSON file at screenshots/scores.json.
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import sharp from 'sharp';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = '/Users/dancoyle/simplerdevelopment/simplerdevelopment2026/.planning/postcaptain-replication/screenshots';
const SBS_DESKTOP = join(ROOT, 'sbs');
const SBS_MOBILE = join(ROOT, 'sbs-mobile');

const SECTION_ORDER = [
  'hero',
  'services',
  'portals',
  'audits',
  'solutions',
  'stats',
  'team',
  'cta-footer',
];

async function loadAsPNG(path, targetW, targetH) {
  // Resize to (targetW, targetH) using sharp, output PNG buffer, parse with pngjs.
  // We use 'fill' so the image is forced to exactly the target dims.
  const buf = await sharp(path)
    .resize({ width: targetW, height: targetH, fit: 'fill' })
    .png()
    .toBuffer();
  return PNG.sync.read(buf);
}

async function dimsOf(path) {
  const m = await sharp(path).metadata();
  return { w: m.width ?? 0, h: m.height ?? 0 };
}

async function scoreSection(dir, section) {
  const livePath = join(dir, `${section}-live.png`);
  const localPath = join(dir, `${section}-local.png`);
  if (!existsSync(livePath) || !existsSync(localPath)) return null;
  const live = await dimsOf(livePath);
  const local = await dimsOf(localPath);
  // Use the smaller of each dimension as the common canvas to avoid stretching.
  const W = Math.min(live.w, local.w);
  const H = Math.min(live.h, local.h);
  if (W <= 0 || H <= 0) return null;
  const livePng = await loadAsPNG(livePath, W, H);
  const localPng = await loadAsPNG(localPath, W, H);
  const diff = new PNG({ width: W, height: H });
  const diffPixels = pixelmatch(livePng.data, localPng.data, diff.data, W, H, {
    threshold: 0.1,
    includeAA: false,
  });
  const totalPixels = W * H;
  const matchPct = ((totalPixels - diffPixels) / totalPixels) * 100;
  return {
    section,
    width: W,
    height: H,
    totalPixels,
    diffPixels,
    matchPct,
  };
}

async function scoreSet(dir, label) {
  if (!existsSync(dir)) {
    console.log(`# ${label}: no pairs at ${dir} — skipping`);
    return null;
  }
  const results = [];
  for (const s of SECTION_ORDER) {
    const r = await scoreSection(dir, s);
    if (r) results.push(r);
  }
  if (results.length === 0) return null;
  const totalAreaPx = results.reduce((acc, r) => acc + r.totalPixels, 0);
  const totalDiffPx = results.reduce((acc, r) => acc + r.diffPixels, 0);
  const aggregate = ((totalAreaPx - totalDiffPx) / totalAreaPx) * 100;
  return { label, results, aggregate };
}

function fmtTable(label, set) {
  let out = `\n## ${label}\n\n`;
  out += '| Section | Size (W×H) | Match % | Diff px |\n';
  out += '|---|---|---|---|\n';
  for (const r of set.results) {
    out += `| ${r.section} | ${r.width}×${r.height} | ${r.matchPct.toFixed(2)}% | ${r.diffPixels.toLocaleString()} |\n`;
  }
  out += `| **aggregate (area-weighted)** | — | **${set.aggregate.toFixed(2)}%** | — |\n`;
  return out;
}

(async () => {
  const desktop = await scoreSet(SBS_DESKTOP, 'Desktop');
  const mobile = await scoreSet(SBS_MOBILE, 'Mobile');

  let md = '# postcaptain pixelmatch scores\n';
  md += `\n_pixelmatch threshold 0.1, includeAA: false. Match % = (total − diff) / total._\n`;
  if (desktop) md += fmtTable('Desktop', desktop);
  if (mobile) md += fmtTable('Mobile', mobile);
  console.log(md);

  const json = {
    generatedAt: new Date().toISOString(),
    desktop: desktop && {
      aggregate: desktop.aggregate,
      sections: desktop.results,
    },
    mobile: mobile && {
      aggregate: mobile.aggregate,
      sections: mobile.results,
    },
  };
  writeFileSync(join(ROOT, 'scores.json'), JSON.stringify(json, null, 2));
  console.log(`\nwrote ${join(ROOT, 'scores.json')}`);
})();
