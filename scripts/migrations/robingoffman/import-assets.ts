// Download every Wix CDN URL referenced by the extracted data, upload to S3,
// insert a media record, and write a wixUrl → localUrl mapping the block
// importers will use to rewrite src attributes.

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env' });

interface AssetMap {
  [wixUrl: string]: {
    mediaId: number;
    localUrl: string;
    width: number | null;
    height: number | null;
    mimeType: string;
  };
}

async function main() {
  const { db } = await import('../../../lib/db');
  const { media } = await import('../../../lib/db/schema');
  const { uploadToS3 } = await import('../../../lib/s3/upload');
  const sharp = (await import('sharp')).default;

  const idsPath = path.join(__dirname, 'data', 'ids.json');
  const ids = JSON.parse(fs.readFileSync(idsPath, 'utf-8')) as { userId: number; clientId: number; websiteId: number; brandingProfileId: number };

  const urls = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'all-images.json'), 'utf-8')) as string[];

  const mapPath = path.join(__dirname, 'data', 'asset-map.json');
  const existingMap: AssetMap = fs.existsSync(mapPath) ? JSON.parse(fs.readFileSync(mapPath, 'utf-8')) : {};

  console.log(`Importing ${urls.length} assets (skip ${Object.keys(existingMap).length} already imported)`);

  let imported = 0;
  let failed = 0;
  for (const wixUrl of urls) {
    if (existingMap[wixUrl]) continue;

    try {
      const res = await fetch(wixUrl, { headers: { 'user-agent': 'Mozilla/5.0 simplerdev-migration' } });
      if (!res.ok) {
        console.error(`  ✗ ${res.status} ${wixUrl}`);
        failed++;
        continue;
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get('content-type') || 'image/jpeg';
      // Derive filename from URL — strip Wix transforms first
      const cleanUrl = wixUrl.replace(/\/v1\/[^?]+/, '').split('?')[0];
      const origName = cleanUrl.split('/').pop() || 'image.jpg';

      let width: number | null = null;
      let height: number | null = null;
      try {
        const meta = await sharp(buffer).metadata();
        width = meta.width || null;
        height = meta.height || null;
      } catch {
        // gifs and webps sometimes fail — non-fatal
      }

      const upload = await uploadToS3(buffer, origName, contentType);

      const [newMedia] = await db.insert(media).values({
        filename: origName,
        storedFilename: upload.storedFilename,
        mimeType: upload.mimeType,
        fileSize: upload.fileSize,
        url: upload.url,
        width,
        height,
        alt: null,
        uploadedBy: ids.userId,
        clientId: ids.clientId,
        websiteId: ids.websiteId,
        brandingProfileId: ids.brandingProfileId || null,
      }).returning();

      existingMap[wixUrl] = {
        mediaId: newMedia.id,
        localUrl: upload.url,
        width,
        height,
        mimeType: upload.mimeType,
      };
      imported++;
      if (imported % 10 === 0) {
        fs.writeFileSync(mapPath, JSON.stringify(existingMap, null, 2));
        console.log(`  ... ${imported} uploaded`);
      }
    } catch (e) {
      console.error(`  ✗ ${(e as Error).message} ${wixUrl}`);
      failed++;
    }
  }

  fs.writeFileSync(mapPath, JSON.stringify(existingMap, null, 2));
  console.log(`\nImported ${imported} new assets, ${failed} failed. Map saved to data/asset-map.json (${Object.keys(existingMap).length} total entries).`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
