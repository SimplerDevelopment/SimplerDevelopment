import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts, clientWebsites, siteNavigation, postTypes, brandingProfiles } = await import('../../../lib/db/schema');
  const { eq, sql } = await import('drizzle-orm');
  const WS = 405;
  const counts = await db.select({
    postType: posts.postType,
    count: sql<number>`count(*)::int`,
  }).from(posts).where(eq(posts.websiteId, WS)).groupBy(posts.postType);
  const ws = await db.select().from(clientWebsites).where(eq(clientWebsites.id, WS)).limit(1);
  const nav = await db.select({ count: sql<number>`count(*)::int` }).from(siteNavigation).where(eq(siteNavigation.websiteId, WS));
  const types = await db.select().from(postTypes).where(eq(postTypes.websiteId, WS));
  const brand = await db.select().from(brandingProfiles).where(eq(brandingProfiles.clientId, ws[0].clientId)).limit(1);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Cardiff migration summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Website id=${WS} | subdomain=${ws[0].subdomain} | publicAccess=${ws[0].publicAccess}`);
  console.log(`Branding profile id=${brand[0]?.id} | primary=${brand[0]?.primaryColor} | accent=${brand[0]?.accentColor}`);
  console.log(`Custom post types: ${types.map(t => t.slug).join(', ') || 'none'}`);
  console.log(`Navigation entries: ${nav[0].count}`);
  console.log(`\nPosts by type:`);
  let total = 0;
  for (const c of counts) { console.log(`  ${c.postType.padEnd(8)}: ${c.count}`); total += c.count; }
  console.log(`  ${''.padEnd(8)}  ────`);
  console.log(`  TOTAL    : ${total}`);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
