/**
 * Import Relayer site navigation (idempotent: clears + re-inserts for the site).
 * Mirrors userelayer.com's nav (Login + Request a briefing) plus the expansion pages.
 * Run: npx tsx scripts/migrations/relayer/import-nav.ts
 */
import { WEBSITE_ID } from './_shared';

const ITEMS: Array<{ label: string; href: string; isButton?: boolean; openInNewTab?: boolean }> = [
  { label: 'Platform', href: '/platform' },
  { label: 'Solutions', href: '/solutions' },
  { label: 'About', href: '/about' },
  { label: 'Blog', href: '/blog' },
  { label: 'Login', href: 'https://app.userelayer.com/', openInNewTab: true },
  { label: 'Request a briefing', href: '/contact', isButton: true },
];

async function run() {
  if (!WEBSITE_ID) throw new Error('WEBSITE_ID not resolved — run setup-client.ts first.');
  const { db } = await import('../../../lib/db');
  const { eq } = await import('drizzle-orm');
  const { siteNavigation } = await import('../../../lib/db/schema');

  await db.delete(siteNavigation).where(eq(siteNavigation.websiteId, WEBSITE_ID));
  let i = 0;
  for (const it of ITEMS) {
    await db.insert(siteNavigation).values({
      websiteId: WEBSITE_ID, label: it.label, href: it.href,
      sortOrder: i++, isButton: it.isButton ?? false, openInNewTab: it.openInNewTab ?? false, draft: false,
    });
  }
  console.log(`[import-nav] Set ${ITEMS.length} nav items for website ${WEBSITE_ID}`);
}
run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
