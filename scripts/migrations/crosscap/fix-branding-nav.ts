import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env' });

async function fixBranding() {
  const { db } = await import('../../../lib/db');
  const { brandingProfiles } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'ids.json'), 'utf-8'));

  await db.update(brandingProfiles).set({
    navTemplate: 'transparent',
    navBackground: 'transparent',
    navTextColor: '#ffffff',
  }).where(eq(brandingProfiles.id, ids.brandingProfileId));

  console.log('Branding updated: navTemplate=transparent');
  process.exit(0);
}

fixBranding().catch(e => { console.error(e); process.exit(1); });
