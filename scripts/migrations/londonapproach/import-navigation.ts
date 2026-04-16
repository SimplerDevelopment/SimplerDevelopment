import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env' });

async function run() {
  const { db } = await import('../../../lib/db');
  const { siteNavigation } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'ids.json'), 'utf-8'));
  const websiteId = ids.websiteId;

  await db.delete(siteNavigation).where(eq(siteNavigation.websiteId, websiteId));
  console.log('Cleared existing navigation');

  const items = [
    { label: 'Services', href: '/services', sortOrder: 0 },
    { label: 'Why LA', href: '/why-la', sortOrder: 1 },
    { label: 'Meet the team', href: '/meet-the-team', sortOrder: 2 },
    { label: 'Testimonials', href: '/testimonials', sortOrder: 3 },
    { label: 'Reach out', href: '/reach-out', sortOrder: 4 },
  ];

  for (const it of items) {
    const [row] = await db.insert(siteNavigation).values({
      websiteId,
      label: it.label,
      href: it.href,
      sortOrder: it.sortOrder,
      openInNewTab: false,
      isButton: it.label === 'Reach out',
    }).returning();
    console.log(`Nav: ${it.label} (ID ${row.id})`);
  }
  console.log('\n=== NAV IMPORT COMPLETE ===');
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
