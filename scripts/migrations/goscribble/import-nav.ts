/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars -- one-off migration tooling */
import * as dotenv from 'dotenv';
import * as fs from 'fs'; import * as path from 'path';
dotenv.config({ path: '.env' });
import { BRAND } from './_brand';

/** Top navigation for the Scribble site, mirroring goscribble.ai's header. Idempotent (clears + re-inserts). */
async function main() {
  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'ids.json'), 'utf8'));
  const websiteId: number = ids.websiteId;
  const { db } = await import('../../../lib/db');
  const { siteNavigation } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const items = [
    { label: 'Product', href: '/home', sortOrder: 0, isButton: false, openInNewTab: false },
    { label: 'For Agencies', href: '/for-agencies', sortOrder: 1, isButton: false, openInNewTab: false },
    { label: 'For Clinicians', href: '/for-clinicians', sortOrder: 2, isButton: false, openInNewTab: false },
    { label: 'Integrations', href: '/integrations', sortOrder: 3, isButton: false, openInNewTab: false },
    { label: 'Resources', href: '/resources', sortOrder: 4, isButton: false, openInNewTab: false },
    { label: 'Company', href: '/about', sortOrder: 5, isButton: false, openInNewTab: false },
    { label: 'Book a Demo', href: BRAND.demoUrl, sortOrder: 6, isButton: true, openInNewTab: true },
  ];

  await db.delete(siteNavigation).where(eq(siteNavigation.websiteId, websiteId));
  for (const it of items) {
    await db.insert(siteNavigation).values({ websiteId, ...it });
  }
  console.log(`Nav rebuilt for website ${websiteId}: ${items.length} items`);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
