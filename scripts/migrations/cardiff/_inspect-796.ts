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
  console.log('block count:', content.blocks.length);
  for (let i = 0; i < content.blocks.length; i++) {
    const b = content.blocks[i];
    console.log(`[${i}] type=${b.type} id=${b.id || '-'} ${b.type === 'hero' ? `title="${(b.title || b.headline || '').slice(0, 60)}"` : ''}`);
  }
  console.log('---block 0 full---');
  console.log(JSON.stringify(content.blocks[0], null, 2).slice(0, 2000));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
