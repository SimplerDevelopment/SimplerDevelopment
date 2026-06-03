/**
 * Toggle QA visibility for the PropertyRadar site.
 *   npx tsx scripts/migrations/propertyradar/qa-toggle.ts on   [slug]   -> publicAccess + publish (all pages, or one slug)
 *   npx tsx scripts/migrations/propertyradar/qa-toggle.ts off  [slug]   -> revert
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' }); dotenv.config({ path: '.env.local', override: true }); if (process.env.PR_DATABASE_URL) process.env.DATABASE_URL = process.env.PR_DATABASE_URL;

const WEBSITE_ID = parseInt(process.env.PR_WEBSITE_ID || '433', 10);
const mode = process.argv[2] === 'on' ? 'on' : 'off';
const slug = process.argv[3];

async function run() {
  const { db } = await import('../../../lib/db');
  const { eq, and } = await import('drizzle-orm');
  const { clientWebsites, posts } = await import('../../../lib/db/schema');

  await db.update(clientWebsites).set({ publicAccess: mode === 'on' }).where(eq(clientWebsites.id, WEBSITE_ID));
  const where = slug
    ? and(eq(posts.websiteId, WEBSITE_ID), eq(posts.slug, slug))
    : eq(posts.websiteId, WEBSITE_ID);
  const res = await db.update(posts).set({ published: mode === 'on' }).where(where).returning({ id: posts.id });
  console.log(`[qa-toggle] ${mode.toUpperCase()} — publicAccess=${mode === 'on'}, ${res.length} post(s) ${mode === 'on' ? 'published' : 'unpublished'}${slug ? ` (slug=${slug})` : ''}`);
}
run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
