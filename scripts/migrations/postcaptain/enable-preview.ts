import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const WEBSITE_ID = 144;

async function enablePreview() {
  const { db } = await import('../../../lib/db');
  const { clientWebsites, posts } = await import('../../../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  await db.update(clientWebsites).set({ publicAccess: true }).where(eq(clientWebsites.id, WEBSITE_ID));
  await db.update(posts).set({ published: true }).where(and(eq(posts.websiteId, WEBSITE_ID), eq(posts.slug, 'home')));

  console.log('Public access enabled + home page published');
  process.exit(0);
}

enablePreview().catch(err => { console.error(err); process.exit(1); });
