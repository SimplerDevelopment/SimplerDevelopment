import sharp from 'sharp';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC = '/Users/dancoyle/simplerdevelopment/simplerdevelopment2026/.planning/postcaptain-replication/screenshots';
const OUT = join(SRC, 'sliced-mobile');
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const SLICE_H = 844;
const files = ['live-mobile.png', 'local-mobile.png'];
for (const f of files) {
  const meta = await sharp(join(SRC, f)).metadata();
  const total = meta.height ?? 0;
  const w = meta.width ?? 0;
  let i = 0;
  for (let y = 0; y < total; y += SLICE_H) {
    const h = Math.min(SLICE_H, total - y);
    const id = String(i).padStart(2, '0');
    const out = join(OUT, `${f.replace('.png','')}-${id}.png`);
    await sharp(join(SRC, f)).extract({ left: 0, top: y, width: w, height: h }).toFile(out);
    i++;
  }
  console.log(f, 'slices:', i, 'total:', total);
}
