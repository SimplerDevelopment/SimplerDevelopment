import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');
  const [p] = await db.select().from(posts).where(eq(posts.id, 803));
  const content = JSON.parse(p.content);
  const sec3 = content.blocks.find((b: any) => b.id === 'sec-3');
  console.log('SEC-3 RAW:');
  console.log(JSON.stringify(sec3, null, 2));
  console.log('\n\nSEC-1 RAW:');
  const sec1 = content.blocks.find((b: any) => b.id === 'sec-1');
  console.log(JSON.stringify(sec1, null, 2));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
