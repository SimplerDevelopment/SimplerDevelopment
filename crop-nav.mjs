import sharp from 'sharp';
const [,, inPath, outPath] = process.argv;
await sharp(inPath).extract({ left: 0, top: 0, width: 1440, height: 200 }).toFile(outPath);
console.log('cropped', outPath);
