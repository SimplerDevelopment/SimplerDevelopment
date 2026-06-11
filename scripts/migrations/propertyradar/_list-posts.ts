import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' }); dotenv.config({ path: '.env.local', override: true }); if (process.env.PR_DATABASE_URL) process.env.DATABASE_URL = process.env.PR_DATABASE_URL;
import { eq, asc } from 'drizzle-orm';
const WEBSITE_ID = parseInt(process.env.PR_WEBSITE_ID || '433', 10);
(async () => {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const rows = await db.select({ id: posts.id, slug: posts.slug, published: posts.published }).from(posts).where(eq(posts.websiteId, WEBSITE_ID)).orderBy(asc(posts.slug));
  console.log(`TOTAL posts for website 433: ${rows.length}`);
  console.log(rows.map(r=>`${r.published?'P':'d'} ${r.id}\t${r.slug}`).join('\n'));
})().then(()=>process.exit(0)).catch(e=>{console.error(String(e).slice(0,300));process.exit(1)});
