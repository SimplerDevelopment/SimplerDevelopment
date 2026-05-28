/**
 * Cardiff.co's signature "Apply Now" header button is GREEN, not orange.
 * Update brandingProfile.buttonStyle so the nav button and all primary CTAs
 * inherit the correct brand-primary green.
 *
 * Orange (#ef6632) remains a secondary accent color used by the hero eyebrow,
 * "Learn More" arrows, and product-card highlights — that's correct.
 */
import { db } from '../../../lib/db';
import { clientWebsites } from '../../../lib/db/schema/sites';
import { brandingProfiles } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

async function main() {
  const [site] = await db.select().from(clientWebsites).where(eq(clientWebsites.subdomain, 'cardiff-main')).limit(1);
  if (!site || !site.brandingProfileId) throw new Error('cardiff-main site not found');
  const [bp] = await db.select().from(brandingProfiles).where(eq(brandingProfiles.id, site.brandingProfileId)).limit(1);
  const newBtnStyle = {
    ...(bp.buttonStyle as Record<string, string>),
    primaryBg: '#5ac96f',
    primaryText: '#ffffff',
    primaryHoverBg: '#4ab35d',
    borderRadius: '4px',
  };
  await db.update(brandingProfiles).set({
    buttonStyle: newBtnStyle,
    updatedAt: new Date(),
  }).where(eq(brandingProfiles.id, site.brandingProfileId));
  console.log(`Updated branding profile ${site.brandingProfileId}: primary button now green (#5ac96f)`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
