import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const WEBSITE_ID = 142;

async function fix() {
  const { db } = await import('../../../lib/db');
  const { siteBranding } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  await db.update(siteBranding).set({
    primaryColor: '#1A1629',
    secondaryColor: '#362E4F',
    accentColor: '#6BE8E8',
    backgroundColor: '#FFFFFF',
    textColor: '#1A1629',
    navBackground: '#FFFFFF',
    navTextColor: '#1A1629',
    navTemplate: 'minimal',
  }).where(eq(siteBranding.websiteId, WEBSITE_ID));

  console.log('Site branding updated to light theme');
  process.exit(0);
}
fix().catch(err => { console.error(err); process.exit(1); });
