import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

async function main() {
  const [row] = await db.select().from(posts).where(eq(posts.id, 829)).limit(1);
  if (!row) { console.log('not found'); process.exit(1); }
  console.log('title:', row.title);
  console.log('slug:', row.slug);
  const c = JSON.parse(row.content);
  console.log('block count:', c.blocks?.length);
  c.blocks?.forEach((b: any, i: number) => {
    console.log(`[${i}] id=${b.id} type=${b.type} width=${b.width ?? '-'}`);
  });
  console.log('\n--- FULL BLOCKS ---');
  console.log(JSON.stringify(c.blocks, null, 2));
  process.exit(0);
}
main();
