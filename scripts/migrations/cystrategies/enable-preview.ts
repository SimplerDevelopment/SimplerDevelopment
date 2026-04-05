import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

async function enable() {
  const { db } = await import('../../../lib/db');
  const { clientWebsites, posts } = await import('../../../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  await db.update(clientWebsites).set({ publicAccess: true }).where(eq(clientWebsites.id, 142));
  await db.update(posts).set({ published: true }).where(and(eq(posts.websiteId, 142), eq(posts.slug, 'home')));
  console.log('Public access enabled, home page published');
  process.exit(0);
}
enable().catch(err => { console.error(err); process.exit(1); });
