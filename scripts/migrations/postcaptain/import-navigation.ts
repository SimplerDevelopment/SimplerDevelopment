import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const WEBSITE_ID = 144;

async function importNavigation() {
  const { db } = await import('../../../lib/db');
  const { siteNavigation } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  // Clear existing nav for this site
  await db.delete(siteNavigation).where(eq(siteNavigation.websiteId, WEBSITE_ID));

  // Top-level nav items matching the original site structure
  const navItems = [
    // Services dropdown parent
    { label: 'Services', href: '#', sortOrder: 1 },
    // Solutions dropdown parent
    { label: 'Solutions', href: '#', sortOrder: 2 },
    // Why Post Captain dropdown parent
    { label: 'Why Post Captain', href: '/why-post-captain', sortOrder: 3 },
    // Contact CTA button
    { label: 'Contact', href: '/contact', sortOrder: 4, isButton: true },
  ];

  const parentIds: Record<string, number> = {};

  for (const item of navItems) {
    const [created] = await db.insert(siteNavigation).values({
      websiteId: WEBSITE_ID,
      label: item.label,
      href: item.href,
      sortOrder: item.sortOrder,
      isButton: item.isButton || false,
    }).returning();
    parentIds[item.label] = created.id;
    console.log(`Nav: ${item.label} (ID ${created.id})`);
  }

  // Services children
  const serviceItems = [
    { label: 'Implementations', href: '/service/implementations', icon: 'rocket_launch', description: 'Collaborative Slate implementations' },
    { label: 'Projects', href: '/service/projects', icon: 'conversion_path', description: 'Bring big ideas to life in Slate' },
    { label: 'Support', href: '/service/support', icon: 'handshake', description: 'Expert Slate support on demand' },
    { label: 'Portals', href: '/service/portals', icon: 'web', description: 'Personal and purposeful experiences' },
    { label: 'Audits', href: '/service/audits', icon: 'fact_check', description: 'Get more from your Slate instance' },
  ];

  for (let i = 0; i < serviceItems.length; i++) {
    const item = serviceItems[i];
    await db.insert(siteNavigation).values({
      websiteId: WEBSITE_ID,
      label: item.label,
      href: item.href,
      parentId: parentIds['Services'],
      sortOrder: i,
      icon: item.icon,
      description: item.description,
      columnGroup: 0,
    });
  }
  console.log(`  + ${serviceItems.length} service sub-items`);

  // Solutions children
  const solutionItems = [
    { label: 'Admissions', href: '/solution/admissions', icon: 'school', description: 'Streamline your enrollment funnel' },
    { label: 'Student Success', href: '/solution/student-success', icon: 'trending_up', description: 'Build proactive support systems' },
    { label: 'Advancement', href: '/solution/advancement', icon: 'volunteer_activism', description: 'Strengthen donor engagement' },
  ];

  for (let i = 0; i < solutionItems.length; i++) {
    const item = solutionItems[i];
    await db.insert(siteNavigation).values({
      websiteId: WEBSITE_ID,
      label: item.label,
      href: item.href,
      parentId: parentIds['Solutions'],
      sortOrder: i,
      icon: item.icon,
      description: item.description,
      columnGroup: 0,
    });
  }
  console.log(`  + ${solutionItems.length} solution sub-items`);

  console.log('\n=== NAVIGATION IMPORT COMPLETE ===');
  process.exit(0);
}

importNavigation().catch(err => { console.error(err); process.exit(1); });
