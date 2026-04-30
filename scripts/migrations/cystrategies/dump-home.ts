import * as dotenv from 'dotenv';
import * as fs from 'fs';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

const WEBSITE_ID = 142;
const OUT = process.env.OUT || '/tmp/cystrategies-home-current.json';

async function dump() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  const [row] = await db
    .select()
    .from(posts)
    .where(and(eq(posts.websiteId, WEBSITE_ID), eq(posts.slug, 'home')))
    .limit(1);

  if (!row) {
    console.log('No row');
    process.exit(0);
  }
  const parsed = JSON.parse(row.content);
  fs.writeFileSync(OUT, JSON.stringify(parsed, null, 2));
  console.log(`Wrote ${OUT} (${row.content.length} bytes -> pretty)`);
  process.exit(0);
}
dump().catch((e) => {
  console.error(e);
  process.exit(1);
});
