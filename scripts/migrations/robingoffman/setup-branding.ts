// Patch the branding profile (and site navigation) after assets are imported.
// Runs after setup-client + import-assets so we can write the locally hosted
// logo URL into brandingProfiles.logoUrl and build the top-nav menu.

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env' });

const WIX_LOGO = 'https://static.wixstatic.com/media/1ddcb0_dbacbfef7a794da0a7e793358441e9ab~mv2.webp';

async function main() {
  const { db } = await import('../../../lib/db');
  const { brandingProfiles, siteNavigation } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'ids.json'), 'utf-8'));
  const assetMap = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'asset-map.json'), 'utf-8'));

  const logoLocal = assetMap[WIX_LOGO]?.localUrl;
  if (!logoLocal) {
    console.error('Logo URL not in asset map. Run import-assets first.');
    process.exit(1);
  }

  await db.update(brandingProfiles).set({
    logoUrl: logoLocal,
    logoRectUrl: logoLocal,
    logoSquareUrl: logoLocal,
    logoIconUrl: logoLocal,
  }).where(eq(brandingProfiles.id, ids.brandingProfileId));
  console.log(`Branding profile logos set to ${logoLocal}`);

  // ── Site navigation ───────────────────────────────────────────────
  // Wipe existing and re-create — idempotent.
  await db.delete(siteNavigation).where(eq(siteNavigation.websiteId, ids.websiteId));

  const navItems = [
    { label: 'Work', href: '/', sortOrder: 1 },
    { label: 'About', href: '/about', sortOrder: 2 },
    { label: 'Contact', href: '/contact', sortOrder: 3 },
  ];

  for (const item of navItems) {
    await db.insert(siteNavigation).values({
      websiteId: ids.websiteId,
      label: item.label,
      href: item.href,
      sortOrder: item.sortOrder,
    });
  }
  console.log(`Site navigation set: ${navItems.map(i => i.label).join(', ')}`);

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
