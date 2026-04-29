// Mobile section-aligned SBS pairs, anchor-driven (mirrors sbs.mjs).
// Output: screenshots/sbs-mobile/<section>-{live,local}.png + index.html
import sharp from 'sharp';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = '/Users/dancoyle/simplerdevelopment/simplerdevelopment2026/.planning/postcaptain-replication/screenshots';
const OUT = join(SRC, 'sbs-mobile');
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const W = 390;

const anchorsPath = join(SRC, 'section-anchors.json');
if (!existsSync(anchorsPath)) {
  console.error(`missing ${anchorsPath} — run detect-sections.mjs first.`);
  process.exit(1);
}
const ANCHORS = JSON.parse(readFileSync(anchorsPath, 'utf8'));

const SECTION_ORDER = [
  { id: 'hero', name: '1. Hero' },
  { id: 'services', name: '2. Mapping Smarter Moves' },
  { id: 'portals', name: '3. Portals' },
  { id: 'audits', name: '4. Audits' },
  { id: 'solutions', name: '5. Slate Solutions' },
  { id: 'stats', name: '6. Strategic Growth Engine' },
  { id: 'team', name: "7. Follow Our Team's Lead" },
  { id: 'cta-footer', name: '8. CTA + Footer' },
];

function rangesFor(side) {
  const data = ANCHORS[side];
  if (!data) throw new Error(`no anchors for ${side}`);
  const { totalHeight, anchors } = data;
  const ids = SECTION_ORDER.map((s) => s.id);
  const ranges = {};
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const start = anchors[id] ?? 0;
    const next = ids[i + 1];
    const end = next != null && anchors[next] != null ? anchors[next] : totalHeight;
    ranges[id] = [Math.max(0, Math.floor(start)), Math.max(start + 1, Math.floor(end))];
  }
  return ranges;
}

const liveRanges = rangesFor('live-mobile');
const localRanges = rangesFor('local-mobile');

async function crop(src, [a, b], outPath) {
  const meta = await sharp(src).metadata();
  const totalH = meta.height ?? 0;
  const top = Math.max(0, a);
  const height = Math.max(1, Math.min(b - a, totalH - top));
  await sharp(src).extract({ left: 0, top, width: W, height }).toFile(outPath);
}

for (const s of SECTION_ORDER) {
  await crop(join(SRC, 'live-mobile.png'), liveRanges[s.id], join(OUT, `${s.id}-live.png`));
  await crop(join(SRC, 'local-mobile.png'), localRanges[s.id], join(OUT, `${s.id}-local.png`));
}

const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>postcaptain compare (mobile)</title>
<style>
  body { background:#1a1a1a; color:#eee; font-family: system-ui; margin:0; padding:0;}
  h1 { padding: 16px 24px 8px; font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase; color:#9FB7B1;}
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; padding: 0 24px 32px; max-width: 980px;}
  .col { background:#0a0a0a; border-radius:6px; overflow:hidden;}
  .col .lbl { padding: 8px 14px; font-size:10px; letter-spacing:0.2em; font-weight:700; }
  .col.live .lbl { background:#1B6FA8; color:#fff;}
  .col.local .lbl { background:#5BA573; color:#fff;}
  img { display:block; width: 100%; height: auto; }
</style></head><body>
${SECTION_ORDER.map((s) => `
  <h1>${s.name} — live ${liveRanges[s.id].join('→')} • local ${localRanges[s.id].join('→')}</h1>
  <div class="row">
    <div class="col live"><div class="lbl">LIVE</div><img src="${s.id}-live.png"></div>
    <div class="col local"><div class="lbl">LOCAL</div><img src="${s.id}-local.png"></div>
  </div>
`).join('')}
</body></html>`;
writeFileSync(join(OUT, 'index.html'), html);
console.log('wrote', join(OUT, 'index.html'));
