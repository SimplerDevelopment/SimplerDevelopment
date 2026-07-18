// One-shot builder for the agency default favicon. Crops transparent
// borders from iconLogo.png, composites onto a white square, and writes
// public/favicon.ico (PNG-encoded — modern browsers accept this) plus
// app/icon.png at common sizes is intentionally NOT generated; the
// project moved the agency favicon out of app/ so tenant favicons win.

import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const SOURCE = process.argv[2];
const TARGET = process.argv[3];
if (!SOURCE || !TARGET) {
  console.error('usage: build-favicon.mjs <source.png> <target.ico>');
  process.exit(1);
}

// Trim() drops the transparent border using the corner-pixel as the
// background reference. Threshold 10 is forgiving of mild aliasing.
const trimmed = await sharp(SOURCE).trim({ threshold: 10 }).toBuffer();
const meta = await sharp(trimmed).metadata();
const w = meta.width ?? 0;
const h = meta.height ?? 0;
const side = Math.max(w, h);

// Square the canvas — center the cropped icon on a slightly-padded white
// square so the favicon doesn't kiss its bounding box.
const padding = Math.round(side * 0.08);
const canvasSide = side + padding * 2;

const squared = await sharp({
  create: {
    width: canvasSide,
    height: canvasSide,
    channels: 4,
    background: { r: 255, g: 255, b: 255, alpha: 1 },
  },
})
  .composite([{ input: trimmed, gravity: 'center' }])
  .png()
  .toBuffer();

// Multi-size set written into a hand-rolled ICO. ICO format spec:
//   header(6) + dirEntries(16 each) + payloads.
// Each payload is the full PNG bytes (modern browsers + Windows accept
// PNG-encoded ICO entries; saves us the BMP encoder).
const SIZES = [16, 32, 48, 64];
const pngs = await Promise.all(
  SIZES.map((s) => sharp(squared).resize(s, s).png().toBuffer()),
);

const numImages = SIZES.length;
const headerSize = 6 + 16 * numImages;
let dataOffset = headerSize;

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type = 1 (icon)
header.writeUInt16LE(numImages, 4);

const entries = Buffer.alloc(16 * numImages);
for (let i = 0; i < numImages; i++) {
  const size = SIZES[i];
  const png = pngs[i];
  // ICO header treats 256 as 0.
  entries.writeUInt8(size === 256 ? 0 : size, i * 16 + 0); // width
  entries.writeUInt8(size === 256 ? 0 : size, i * 16 + 1); // height
  entries.writeUInt8(0, i * 16 + 2); // palette
  entries.writeUInt8(0, i * 16 + 3); // reserved
  entries.writeUInt16LE(1, i * 16 + 4); // color planes
  entries.writeUInt16LE(32, i * 16 + 6); // bits per pixel
  entries.writeUInt32LE(png.length, i * 16 + 8); // size
  entries.writeUInt32LE(dataOffset, i * 16 + 12); // offset
  dataOffset += png.length;
}

const ico = Buffer.concat([header, entries, ...pngs]);
writeFileSync(TARGET, ico);
console.log(`wrote ${ico.length} bytes to ${TARGET} (${SIZES.join(', ')})`);
