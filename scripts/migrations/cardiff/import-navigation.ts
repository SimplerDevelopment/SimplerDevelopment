/**
 * Cardiff migration — Site navigation
 *
 * Mirrors cardiff.co's main nav structure as site_navigation entries.
 * Idempotent — clears existing nav and recreates from this canonical list.
 *
 * Run:  npx tsx scripts/migrations/cardiff/import-navigation.ts
 */

import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

interface NavItem {
  label: string;
  href: string;
  isButton?: boolean;
  children?: NavItem[];
}

const NAV: NavItem[] = [
  {
    label: 'Business Loans',
    href: '/business-loans',
    children: [
      { label: 'Business Credit Cards', href: '/business-cards' },
      { label: 'Business Loans', href: '/business-loans' },
      { label: 'Equipment Financing', href: '/equipment-leasing' },
      { label: 'Lines of Credit', href: '/line-of-credit' },
      { label: 'Merchant Cash Advance (MCA)', href: '/merchant-cash-advance' },
      { label: 'SBA Loans', href: '/sba-loans' },
      { label: 'How to Qualify', href: '/how-to-qualify' },
    ],
  },
  {
    label: 'Industries',
    href: '/industries',
    children: [
      { label: 'Auto Repair', href: '/industries-auto-repair' },
      { label: 'Construction', href: '/industries-construction' },
      { label: 'Contracting', href: '/industries-contracting' },
      { label: 'Dental Practice', href: '/industries-dental-practice' },
      { label: 'Excavation', href: '/industries-excavation' },
      { label: 'Hospitality', href: '/industries-hospitality' },
      { label: 'Landscaping', href: '/industries-landscaping' },
      { label: 'Masonry', href: '/industries-masonry' },
      { label: 'Medical', href: '/industries-medical' },
      { label: 'Plumbing', href: '/industries-plumbing' },
      { label: 'Restaurants', href: '/industries-restaurants' },
      { label: 'Retail', href: '/industries-retail' },
      { label: 'Trucking', href: '/industries-trucking' },
    ],
  },
  {
    label: 'Resources',
    href: '/learn',
    children: [
      { label: 'Articles', href: '/learn-articles' },
      { label: 'Getting Ready', href: '/getting-ready' },
      { label: 'How to Qualify', href: '/how-to-qualify' },
      { label: 'Reports', href: '/learn' },
      { label: 'Using Your Loan', href: '/using-your-loan' },
      { label: 'FAQ', href: '/learn-faq' },
    ],
  },
  { label: 'About', href: '/about' },
  { label: 'Newsroom', href: '/newsroom' },
  { label: 'Contact Us', href: '/contact-us' },
  { label: 'Apply Now', href: 'https://cardiff.co/business/apply', isButton: true },
];

async function main() {
  const { db } = await import('../../../lib/db');
  const { siteNavigation } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const state = JSON.parse(readFileSync(join(process.cwd(), 'scripts/migrations/cardiff/.state/ids.json'), 'utf-8'));

  // Wipe existing nav
  await db.delete(siteNavigation).where(eq(siteNavigation.websiteId, state.websiteId));

  let parentSort = 0;
  for (const item of NAV) {
    const [parent] = await db.insert(siteNavigation).values({
      websiteId: state.websiteId,
      label: item.label,
      href: item.href,
      sortOrder: parentSort++,
      isButton: !!item.isButton,
    }).returning();
    console.log(`+ ${item.label}`);

    if (item.children) {
      let childSort = 0;
      for (const c of item.children) {
        await db.insert(siteNavigation).values({
          websiteId: state.websiteId,
          label: c.label,
          href: c.href,
          parentId: parent.id,
          sortOrder: childSort++,
        });
        console.log(`    ↳ ${c.label}`);
      }
    }
  }

  console.log(`\n✅ navigation imported for website id=${state.websiteId}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
