/**
 * Import PropertyRadar site navigation (idempotent: clears + re-inserts for the site).
 * Run: npx tsx scripts/migrations/propertyradar/import-nav.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' }); dotenv.config({ path: '.env.local', override: true }); if (process.env.PR_DATABASE_URL) process.env.DATABASE_URL = process.env.PR_DATABASE_URL;

const WEBSITE_ID = parseInt(process.env.PR_WEBSITE_ID || '433', 10);

const ITEMS: Array<{ label: string; href: string; isButton?: boolean }> = [
  { label: 'Who We Serve', href: '/built-for' },
  { label: 'Features', href: '/features' },
  { label: 'Lead Gen Plays', href: '/plays' },
  { label: 'Coverage', href: '/coverage' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Blog', href: '/blog' },
  { label: 'Login', href: '/login' },
  { label: 'Try it Free', href: '/register', isButton: true },
];

async function run() {
  const { db } = await import('../../../lib/db');
  const { eq } = await import('drizzle-orm');
  const { siteNavigation } = await import('../../../lib/db/schema');

  await db.delete(siteNavigation).where(eq(siteNavigation.websiteId, WEBSITE_ID));
  let i = 0;
  for (const it of ITEMS) {
    await db.insert(siteNavigation).values({
      websiteId: WEBSITE_ID, label: it.label, href: it.href,
      sortOrder: i++, isButton: it.isButton ?? false, draft: false,
    });
  }
  console.log(`[import-nav] Set ${ITEMS.length} nav items for website ${WEBSITE_ID}`);
}
run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
