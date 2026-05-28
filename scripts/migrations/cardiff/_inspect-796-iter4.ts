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
  console.log(`Total top-level blocks: ${content.blocks.length}`);
  content.blocks.forEach((b: any, i: number) => {
    const childCount = Array.isArray(b.blocks) ? b.blocks.length : 0;
    const hasHtmlRender = Array.isArray(b.blocks) && b.blocks.some((c: any) => c.type === 'html-render');
    const types = Array.isArray(b.blocks) ? b.blocks.map((c: any) => c.type).join(',') : '';
    console.log(`[${i}] id=${b.id} type=${b.type} children=${childCount} hasHtmlRender=${hasHtmlRender} types=[${types}]`);
  });
  // Dump suspected unstyled sections
  for (let i = 0; i < content.blocks.length; i++) {
    const b = content.blocks[i];
    if (!Array.isArray(b.blocks)) continue;
    const hasHtmlRender = b.blocks.some((c: any) => c.type === 'html-render');
    if (!hasHtmlRender && b.blocks.length > 0) {
      console.log(`\n===== UNSTYLED block[${i}] id=${b.id} =====`);
      console.log(JSON.stringify(b, null, 2).slice(0, 3500));
    }
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
