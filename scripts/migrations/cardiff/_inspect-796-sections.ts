import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');
  const [p] = await db.select().from(posts).where(eq(posts.id, 796));
  if (!p) { console.error('post 796 not found'); process.exit(1); }
  const content = JSON.parse(p.content);
  for (let i = 1; i <= 8; i++) {
    const b = content.blocks[i];
    console.log(`\n===== block[${i}] id=${b.id} type=${b.type} =====`);
    const dump = JSON.stringify(b, null, 2);
    console.log(dump.slice(0, 1800));
    console.log(`(len=${dump.length})`);
  }
  console.log('\n===== block[9] CTA =====');
  console.log(JSON.stringify(content.blocks[9], null, 2).slice(0, 1500));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
