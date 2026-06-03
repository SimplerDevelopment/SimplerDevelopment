/**
 * Create custom post types for PropertyRadar collections (idempotent by slug).
 * blog uses the built-in 'blog' postType. plays/lists/coverage need custom types
 * so html-render loop feeds can filter by postType and items render at /<slug>.
 * Run: npx tsx scripts/migrations/propertyradar/import-posttypes.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' }); dotenv.config({ path: '.env.local', override: true }); if (process.env.PR_DATABASE_URL) process.env.DATABASE_URL = process.env.PR_DATABASE_URL;

const WEBSITE_ID = parseInt(process.env.PR_WEBSITE_ID || '433', 10);
const TYPES = [
  { name: 'Lead Gen Play', slug: 'play', description: 'Industry-specific lead generation playbooks', icon: 'lightbulb' },
  { name: 'Property List', slug: 'list', description: 'Curated property list types and definitions', icon: 'list_alt' },
  { name: 'Coverage Area', slug: 'coverage', description: 'State and county data coverage', icon: 'map' },
];

async function run() {
  const { db } = await import('../../../lib/db');
  const { eq, and } = await import('drizzle-orm');
  const { postTypes } = await import('../../../lib/db/schema');
  for (const t of TYPES) {
    const existing = await db.select().from(postTypes).where(and(eq(postTypes.websiteId, WEBSITE_ID), eq(postTypes.slug, t.slug))).limit(1);
    if (existing.length > 0) {
      console.log(`  [postType] exists: ${t.slug} (id=${existing[0].id})`);
      continue;
    }
    const [created] = await db.insert(postTypes).values({
      websiteId: WEBSITE_ID, name: t.name, slug: t.slug, description: t.description, icon: t.icon, active: true,
    }).returning();
    console.log(`  [postType] created: ${t.slug} (id=${created.id})`);
  }
}
run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
