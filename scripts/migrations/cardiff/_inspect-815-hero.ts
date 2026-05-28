import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');
  const [p] = await db.select().from(posts).where(eq(posts.id, 815));
  const content = JSON.parse(p.content);
  // Print hero + sec-1 in detail
  console.log('--- hero block ---');
  console.log(JSON.stringify(content.blocks[0], null, 2).slice(0, 2500));
  console.log('\n--- sec-1 block ---');
  console.log(JSON.stringify(content.blocks[1], null, 2).slice(0, 2500));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
