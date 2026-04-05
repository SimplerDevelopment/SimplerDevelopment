import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

async function check() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');
  const [post] = await db.select().from(posts).where(eq(posts.id, 296)).limit(1);
  const data = JSON.parse(post!.content);
  for (const block of data.blocks) {
    console.log(`${block.type}:${block.id}`);
    if (block.type === 'section' && block.blocks) {
      for (const child of block.blocks) {
        console.log(`  ${child.type}:${child.id}`);
        if (child.type === 'columns' && child.columns) {
          for (const col of child.columns) {
            console.log(`    col:${col.id} (${col.blocks?.length || 0} blocks)`);
            for (const nested of col.blocks || []) {
              console.log(`      ${nested.type}:${nested.id}`);
            }
          }
        }
      }
    }
  }
  process.exit(0);
}
check().catch(err => { console.error(err); process.exit(1); });
