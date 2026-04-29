// Build a section-aligned side-by-side compare HTML using the live + local
// full-page captures. We slice both at fixed Y boundaries that we believe
// map to common section breaks, then layout pairs in a grid.
import sharp from 'sharp';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = '/Users/dancoyle/simplerdevelopment/simplerdevelopment2026/.planning/postcaptain-replication/screenshots';
const OUT = join(SRC, 'sbs');
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const liveMeta = await sharp(join(SRC, 'live-desktop.png')).metadata();
const localMeta = await sharp(join(SRC, 'local-desktop.png')).metadata();
const liveH = liveMeta.height ?? 0;
const localH = localMeta.height ?? 0;
const W = 1440;

// Map approximate Y ranges per section. Live is much taller because of scroll-
// tabs section. Local is denser. We pick proportional ranges per side.
// Order: hero, services-tabs+detail, portals, audits, solutions, stats, team, cta+footer
//
// Live total height: ~9124px. Local total height: ~8693px (after batch11 — the
// stats card grew taller when we let suffix wrap to second line for the long
// labels; banner suppressed at capture time so hero now starts at 0).
// Section boundaries picked from manual inspection of fresh screenshots.
const sections = [
  { id: 'hero', name: '1. Hero', live: [0, 760], local: [0, 760] },
  { id: 'services', name: '2. Mapping Smarter Moves + Service tabs/details', live: [760, 5230], local: [760, 4400] },
  { id: 'portals', name: '3. Portals (sky-blue)', live: [5230, 5810], local: [4400, 4900] },
  { id: 'audits', name: '4. Audits (navy)', live: [5810, 6310], local: [4900, 5400] },
  { id: 'solutions', name: '5. Slate Solutions (mint)', live: [6310, 7050], local: [5400, 6300] },
  { id: 'stats', name: '6. Strategic Growth Engine (stats)', live: [7050, 7800], local: [6300, 7100] },
  { id: 'team', name: '7. Follow Our Team\'s Lead', live: [7800, 8330], local: [7100, 7900] },
  { id: 'cta-footer', name: '8. CTA + Footer', live: [8330, liveH], local: [7900, localH] },
];

async function crop(src, [a, b], outPath) {
  const meta = await sharp(src).metadata();
  const totalH = meta.height ?? 0;
  const top = Math.max(0, a);
  const height = Math.max(1, Math.min(b - a, totalH - top));
  await sharp(src).extract({ left: 0, top, width: W, height }).resize({ width: 720 }).toFile(outPath);
}

for (const s of sections) {
  await crop(join(SRC, 'live-desktop.png'), s.live, join(OUT, `${s.id}-live.png`));
  await crop(join(SRC, 'local-desktop.png'), s.local, join(OUT, `${s.id}-local.png`));
}

const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>postcaptain compare</title>
<style>
  body { background:#1a1a1a; color:#eee; font-family: system-ui; margin:0; padding:0;}
  h1 { padding: 16px 24px 8px; font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase; color:#9FB7B1;}
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; padding: 0 24px 32px; }
  .col { background:#0a0a0a; border-radius:6px; overflow:hidden;}
  .col .lbl { padding: 8px 14px; font-size:10px; letter-spacing:0.2em; font-weight:700; }
  .col.live .lbl { background:#1B6FA8; color:#fff;}
  .col.local .lbl { background:#5BA573; color:#fff;}
  img { display:block; width: 100%; height: auto; }
</style></head><body>
${sections.map((s) => `
  <h1>${s.name}</h1>
  <div class="row">
    <div class="col live"><div class="lbl">LIVE — postcaptain.com</div><img src="${s.id}-live.png"></div>
    <div class="col local"><div class="lbl">LOCAL — sites/postcaptain.com</div><img src="${s.id}-local.png"></div>
  </div>
`).join('')}
</body></html>`;
writeFileSync(join(OUT, 'index.html'), html);
console.log('wrote', join(OUT, 'index.html'));
