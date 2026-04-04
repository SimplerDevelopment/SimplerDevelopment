import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env' });

async function importNavigation() {
  const { db } = await import('../../../lib/db');
  const { siteNavigation } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const idsPath = path.join(__dirname, 'ids.json');
  if (!fs.existsSync(idsPath)) {
    console.error('ids.json not found. Run setup-client.ts first.');
    process.exit(1);
  }
  const { websiteId } = JSON.parse(fs.readFileSync(idsPath, 'utf-8'));

  // Clear existing nav for this website
  await db.delete(siteNavigation).where(eq(siteNavigation.websiteId, websiteId));
  console.log('Cleared existing navigation');

  const navItems = [
    { label: 'Home', href: '/', sortOrder: 0 },
    { label: 'Product', href: '/product', sortOrder: 1 },
    { label: 'Solutions', href: '/solutions', sortOrder: 2 },
    { label: 'Insights', href: '/insights', sortOrder: 3 },
    { label: 'Ethical AI', href: '/ethical-ai', sortOrder: 4 },
    { label: 'Partners', href: '/partners', sortOrder: 5 },
    { label: 'About Us', href: '/about-us', sortOrder: 6 },
    { label: 'Careers', href: '/careers', sortOrder: 7 },
    { label: 'Contact Us', href: '/contact-us', sortOrder: 8, isButton: true },
  ];

  for (const item of navItems) {
    await db.insert(siteNavigation).values({
      websiteId,
      label: item.label,
      href: item.href,
      sortOrder: item.sortOrder,
      openInNewTab: false,
      isButton: item.isButton ?? false,
    });
  }

  console.log(`Navigation created: ${navItems.length} items`);
}

importNavigation()
  .then(() => {
    console.log('Navigation import complete');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Navigation import failed:', err);
    process.exit(1);
  });
