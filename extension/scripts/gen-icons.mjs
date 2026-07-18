// Generates placeholder PNG icons for the extension.
// Hand-rolled minimal PNG encoder (no deps) — produces a solid-color square
// with a subtle inner mark. The user is expected to replace these with real
// brand icons before publishing.
//
// Output: public/icon-16.png, icon-32.png, icon-48.png, icon-128.png

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '..', 'public');
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

// CRC32 table for PNG chunks
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  const crcInput = Buffer.concat([typeBuf, data]);
  crc.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

// Brand-ish indigo (Tailwind indigo-600 = #4f46e5)
const BRAND = { r: 79, g: 70, b: 229 };
const MARK = { r: 255, g: 255, b: 255 };

function makePng(size) {
  // RGBA, 8-bit, color type 6
  const rowBytes = size * 4;
  const raw = Buffer.alloc((rowBytes + 1) * size);

  // Mark: a centered "B" approximation using a vertical bar + two arcs (rough)
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.32;

  for (let y = 0; y < size; y++) {
    raw[y * (rowBytes + 1)] = 0; // filter byte
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);

      // ring mark
      const inRing = d <= r && d >= r - Math.max(1, size * 0.08);
      // vertical bar to one side of the ring
      const inBar = Math.abs(x - (cx - r * 0.2)) < Math.max(1, size * 0.08) && Math.abs(dy) < r * 0.7;
      const isMark = inRing || inBar;

      const c = isMark ? MARK : BRAND;
      const off = y * (rowBytes + 1) + 1 + x * 4;
      raw[off] = c.r;
      raw[off + 1] = c.g;
      raw[off + 2] = c.b;
      raw[off + 3] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = deflateSync(raw);

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const sizes = [16, 32, 48, 128];
for (const size of sizes) {
  const png = makePng(size);
  const path = resolve(outDir, `icon-${size}.png`);
  writeFileSync(path, png);
  console.log(`wrote ${path} (${png.length} bytes)`);
}
