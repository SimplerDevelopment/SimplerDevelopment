import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const WEBSITE_ID = 145;

async function importNav() {
  const { db } = await import('../../../lib/db');
  const { siteNavigation } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  // Clear existing nav for this site
  await db.delete(siteNavigation).where(eq(siteNavigation.websiteId, WEBSITE_ID));

  const navItems = [
    { label: 'Home', href: '/', sortOrder: 0 },
    { label: 'Services', href: '/#services-section', sortOrder: 1 },
    { label: 'Resources', href: '/#resources-section', sortOrder: 2 },
    { label: 'Contact', href: '/#contact-section', sortOrder: 3 },
    { label: 'Book a Consultation', href: 'https://noraanger.com/ola/services/phone-consultation-1', sortOrder: 4, isButton: true, openInNewTab: true },
  ];

  for (const item of navItems) {
    await db.insert(siteNavigation).values({
      websiteId: WEBSITE_ID,
      label: item.label,
      href: item.href,
      sortOrder: item.sortOrder,
      isButton: item.isButton ?? false,
      openInNewTab: item.openInNewTab ?? false,
    });
  }

  console.log(`Navigation created: ${navItems.length} items`);
  console.log('\n=== NAVIGATION IMPORT COMPLETE ===');
  process.exit(0);
}

importNav().catch(err => { console.error(err); process.exit(1); });
