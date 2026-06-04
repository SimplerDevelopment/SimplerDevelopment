import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' }); dotenv.config({ path: '.env.local', override: true }); if (process.env.PR_DATABASE_URL) process.env.DATABASE_URL = process.env.PR_DATABASE_URL;
import { eq, sql } from 'drizzle-orm';
const WEBSITE_ID = parseInt(process.env.PR_WEBSITE_ID || '433', 10);
(async () => {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const rows = await db.select({ pt: posts.postType, c: sql<number>`count(*)::int` }).from(posts).where(eq(posts.websiteId, WEBSITE_ID)).groupBy(posts.postType);
  let total = 0; rows.forEach(r=>{total+=Number(r.c); console.log(`  ${r.pt}: ${r.c}`)});
  console.log(`  TOTAL: ${total}`);
})().then(()=>process.exit(0)).catch(e=>{console.error(String(e).slice(0,200));process.exit(1)});
