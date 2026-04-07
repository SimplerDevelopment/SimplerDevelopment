import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env' });

async function fixAssets() {
  const { db } = await import('../../../lib/db');
  const { brandingProfiles } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'ids.json'), 'utf-8'));

  await db.update(brandingProfiles).set({
    logoUrl: '/sites/crosscap/logo-w.svg',
    logoRectUrl: '/sites/crosscap/logo-w.svg',
    faviconUrl: '/sites/crosscap/cropped-favicon.png',
    ogImageUrl: '/sites/crosscap/TEAM_Web-600x400.jpg',
  }).where(eq(brandingProfiles.id, ids.brandingProfileId));

  console.log('Asset URLs updated to /sites/crosscap/');
  process.exit(0);
}

fixAssets().catch(e => { console.error(e); process.exit(1); });
