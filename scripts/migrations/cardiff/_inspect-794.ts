import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');
  const [p] = await db.select().from(posts).where(eq(posts.id, 794));
  if (!p) { console.error('post 794 not found'); process.exit(1); }
  const content = JSON.parse(p.content);
  console.log('block count:', content.blocks.length);
  for (let i = 0; i < content.blocks.length; i++) {
    const b = content.blocks[i];
    const summary: string[] = [];
    if (b.title) summary.push(`title="${String(b.title).slice(0,50)}"`);
    if (b.headline) summary.push(`headline="${String(b.headline).slice(0,50)}"`);
    if (b.html) summary.push(`html=${String(b.html).slice(0,80).replace(/\n/g,' ')}`);
    console.log(`[${i}] type=${b.type} id=${b.id || '-'} ${summary.join(' ')}`);
  }
  // Look for sec-1
  const sec1 = content.blocks.find((b: any) => b.id === 'sec-1');
  if (sec1) {
    console.log('\n--- sec-1 full ---');
    console.log(JSON.stringify(sec1, null, 2));
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
