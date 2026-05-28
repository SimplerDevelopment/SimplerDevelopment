/**
 * Site-wide: change the cardiff-main branding profile's nav header from
 * white-on-black to cardiff.co's signature dark-blue-on-white. Affects every
 * page of the site.
 */
import { db } from '../../../lib/db';
import { clientWebsites } from '../../../lib/db/schema/sites';
import { brandingProfiles } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

async function main() {
  const [site] = await db.select().from(clientWebsites).where(eq(clientWebsites.subdomain, 'cardiff-main')).limit(1);
  if (!site || !site.brandingProfileId) throw new Error('cardiff-main site or branding profile not found');
  await db.update(brandingProfiles).set({
    navBackground: '#1c3370',
    navTextColor: '#ffffff',
    updatedAt: new Date(),
  }).where(eq(brandingProfiles.id, site.brandingProfileId));
  console.log(`Updated branding profile ${site.brandingProfileId}: navBackground=#1c3370, navTextColor=#ffffff`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
