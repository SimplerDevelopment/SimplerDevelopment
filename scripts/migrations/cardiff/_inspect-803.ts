import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');
  const [p] = await db.select().from(posts).where(eq(posts.id, 803));
  const content = JSON.parse(p.content);
  const sec2 = content.blocks.find((b: any) => b.id === 'sec-2');
  const grid = sec2.blocks.find((b: any) => b.id === 'sec-2-grid-3');
  console.log('sec-2-grid-3 keys:', Object.keys(grid));
  console.log(JSON.stringify(grid, null, 2));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
