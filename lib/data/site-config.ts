import { db } from '@/lib/db';
import { clientWebsites, storeSettings } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getBrandingByWebsiteId, brandingToCssVars } from '@/lib/branding';
import { getNavigation } from '@/lib/data/navigation';

export async function getSiteConfig(siteId: number) {
  const [site] = await db
    .select({
      id: clientWebsites.id,
      name: clientWebsites.name,
      domain: clientWebsites.domain,
      subdomain: clientWebsites.subdomain,
      description: clientWebsites.description,
      customLayout: clientWebsites.customLayout,
    })
    .from(clientWebsites)
    .where(and(eq(clientWebsites.id, siteId), eq(clientWebsites.active, true)))
    .limit(1);

  if (!site) return null;

  const [branding, navigation, store] = await Promise.all([
    getBrandingByWebsiteId(siteId),
    getNavigation(siteId),
    db.select({ enabled: storeSettings.enabled })
      .from(storeSettings)
      .where(and(eq(storeSettings.websiteId, siteId), eq(storeSettings.enabled, true)))
      .limit(1)
      .then(rows => rows.length > 0),
  ]);

  return {
    ...site,
    branding,
    cssVars: brandingToCssVars(branding),
    navigation,
    storeEnabled: store,
  };
}
