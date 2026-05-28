/**
 * The cardiff.co header logo is a text-styled "cardiff" mark rendered as
 * raw text, not a logo image. Clear logoUrl so SiteNavClient falls back to
 * rendering site.name styled with the brand's headingFont (Raleway).
 */
import { db } from '../../../lib/db';
import { clientWebsites } from '../../../lib/db/schema/sites';
import { brandingProfiles } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

async function main() {
  const [site] = await db.select().from(clientWebsites).where(eq(clientWebsites.subdomain, 'cardiff-main')).limit(1);
  if (!site || !site.brandingProfileId) throw new Error('cardiff-main site not found');
  await db.update(brandingProfiles).set({
    logoUrl: null,
    logoText: 'cardiff',
    updatedAt: new Date(),
  }).where(eq(brandingProfiles.id, site.brandingProfileId));
  // SiteNavClient renders site.name when logoUrl is null, not logoText —
  // so also rename the website itself to match cardiff.co's "cardiff" mark.
  await db.update(clientWebsites).set({
    name: 'cardiff',
    updatedAt: new Date(),
  }).where(eq(clientWebsites.id, site.id));
  console.log(`Updated branding profile ${site.brandingProfileId}: cleared logoUrl, set name='cardiff'`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
