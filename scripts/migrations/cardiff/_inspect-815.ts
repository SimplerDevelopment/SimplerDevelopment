import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');
  const [p] = await db.select().from(posts).where(eq(posts.id, 815));
  if (!p) { console.error('not found'); process.exit(1); }
  console.log('slug:', p.slug, 'title:', p.title, 'published:', p.published);
  const content = JSON.parse(p.content);
  console.log('block count:', content.blocks.length);
  for (let i = 0; i < content.blocks.length; i++) {
    const b = content.blocks[i];
    const summary: string[] = [];
    if (b.title) summary.push(`title="${String(b.title).slice(0,60)}"`);
    if (b.headline) summary.push(`headline="${String(b.headline).slice(0,60)}"`);
    if (b.text) summary.push(`text="${String(b.text).slice(0,60)}"`);
    if (b.html) summary.push(`html-len=${String(b.html).length}`);
    console.log(`[${i}] type=${b.type} id=${b.id || '-'} ${summary.join(' ')}`);
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
