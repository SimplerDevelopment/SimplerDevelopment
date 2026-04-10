import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const WEBSITE_ID = 145;

async function enablePreview() {
  const { db } = await import('../../../lib/db');
  const { clientWebsites, posts } = await import('../../../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  await db.update(clientWebsites)
    .set({ publicAccess: true })
    .where(eq(clientWebsites.id, WEBSITE_ID));
  console.log('Public access enabled');

  await db.update(posts)
    .set({ published: true })
    .where(and(eq(posts.websiteId, WEBSITE_ID), eq(posts.slug, 'home')));
  console.log('Home page published');

  console.log('\nPreview at: http://localhost:3000/sites/delco-counseling-therapy-delco-counseling-website.simplerdevelopment.com/home');
  process.exit(0);
}

enablePreview().catch(err => { console.error(err); process.exit(1); });
