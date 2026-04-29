import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { writeFileSync } from 'node:fs';

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');
  const [post] = await db.select().from(posts).where(eq(posts.id, 302));
  if (!post) {
    console.log('NOT FOUND');
    process.exit(1);
  }
  writeFileSync(
    '.planning/postcaptain-replication/snapshots/post-302-current.json',
    JSON.stringify(post, null, 2)
  );
  console.log('snapshot written');
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
