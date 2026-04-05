import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

async function disable() {
  const { db } = await import('../../../lib/db');
  const { clientWebsites, posts } = await import('../../../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  await db.update(clientWebsites).set({ publicAccess: false }).where(eq(clientWebsites.id, 142));
  await db.update(posts).set({ published: false }).where(and(eq(posts.websiteId, 142), eq(posts.slug, 'home')));
  console.log('Public access disabled, home page set to draft');
  process.exit(0);
}
disable().catch(err => { console.error(err); process.exit(1); });
