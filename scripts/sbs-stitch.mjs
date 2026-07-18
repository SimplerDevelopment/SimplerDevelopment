import sharp from 'sharp';
import fs from 'fs';

const [,, aPath, bPath, outPath, labelA, labelB] = process.argv;

const [a, b] = await Promise.all([
  sharp(aPath).toBuffer({ resolveWithObject: true }),
  sharp(bPath).toBuffer({ resolveWithObject: true }),
]);

const gap = 24;
const labelH = 40;
const totalW = a.info.width + b.info.width + gap;
const totalH = Math.max(a.info.height, b.info.height) + labelH;

const svgLabel = (text, x, w) => `
  <svg width="${totalW}" height="${totalH}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${x}" y="0" width="${w}" height="${labelH}" fill="#C46A3D"/>
    <text x="${x + 16}" y="26" font-family="system-ui" font-size="14" font-weight="700" fill="#fff" letter-spacing="3">${text}</text>
  </svg>
`;

const composite = await sharp({
  create: {
    width: totalW,
    height: totalH,
    channels: 4,
    background: { r: 26, g: 26, b: 26, alpha: 1 },
  },
})
  .composite([
    { input: Buffer.from(svgLabel(`A — ${labelA || 'LOCAL'}`, 0, a.info.width)), top: 0, left: 0 },
    { input: a.data, top: labelH, left: 0 },
    { input: Buffer.from(svgLabel(`B — ${labelB || 'TARGET'}`, a.info.width + gap, b.info.width)), top: 0, left: 0 },
    { input: b.data, top: labelH, left: a.info.width + gap },
  ])
  .png()
  .toFile(outPath);

console.log('saved', outPath, composite.width + 'x' + composite.height);
