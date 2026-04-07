import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env' });

async function importNavigation() {
  const { db } = await import('../../../lib/db');
  const { siteNavigation } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'ids.json'), 'utf-8'));
  const websiteId = ids.websiteId;

  if (!websiteId) {
    console.error('No websiteId found in ids.json. Run setup-client first.');
    process.exit(1);
  }

  // Clear existing nav for this site
  await db.delete(siteNavigation).where(eq(siteNavigation.websiteId, websiteId));
  console.log('Cleared existing navigation');

  // Schema uses `href` not `url`, no `visible` column, has `isButton` and `openInNewTab`
  const navItems = [
    {
      label: 'Services',
      href: '/services/investments-planning',
      sortOrder: 1,
      children: [
        { label: 'Investments & Planning', href: '/services/investments-planning', sortOrder: 1 },
        { label: 'Family Business', href: '/services/family-business', sortOrder: 2 },
        { label: 'Divorce Financial Planning', href: '/services/divorce', sortOrder: 3 },
        { label: 'Cryptocurrency Education', href: '/services/cryptocurrency', sortOrder: 4 },
      ],
    },
    { label: 'Our Process', href: '/process', sortOrder: 2 },
    { label: 'About Us', href: '/about', sortOrder: 3 },
    { label: 'Insights', href: '/insights', sortOrder: 4 },
    { label: 'Free Portfolio Risk Analysis', href: '/schedule', sortOrder: 5 },
    { label: 'Fidelity Login', href: 'https://digital.fidelity.com/prgw/digital/login/full-page?AuthRedUrl=https://digital.fidelity.com/ftgw/digital/portfolio/summary', sortOrder: 6, openInNewTab: true },
    { label: 'Schedule a Call', href: '/schedule', sortOrder: 7, isButton: true },
  ];

  for (const item of navItems) {
    const [parent] = await db.insert(siteNavigation).values({
      websiteId,
      label: item.label,
      href: item.href,
      sortOrder: item.sortOrder,
      openInNewTab: ('openInNewTab' in item && item.openInNewTab) || false,
      isButton: ('isButton' in item && item.isButton) || false,
    }).returning();
    console.log(`Nav item created: ${item.label} (ID ${parent.id})`);

    if ('children' in item && item.children) {
      for (const child of item.children) {
        await db.insert(siteNavigation).values({
          websiteId,
          parentId: parent.id,
          label: child.label,
          href: child.href,
          sortOrder: child.sortOrder,
        });
        console.log(`  Child nav: ${child.label}`);
      }
    }
  }

  console.log('\n=== NAVIGATION IMPORT COMPLETE ===');
  process.exit(0);
}

importNavigation().catch(err => { console.error(err); process.exit(1); });
