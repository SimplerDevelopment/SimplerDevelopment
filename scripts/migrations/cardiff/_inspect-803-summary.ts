import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');
  const [p] = await db.select().from(posts).where(eq(posts.id, 803));
  const content = JSON.parse(p.content);
  console.log('Total top-level blocks:', content.blocks.length);
  for (const b of content.blocks) {
    const id = b.id || '(no-id)';
    const type = b.type;
    const childCount = Array.isArray(b.blocks) ? b.blocks.length : 0;
    let preview = '';
    if (b.content) preview = String(b.content).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 80);
    console.log(`\n=== ${id} | type=${type} | children=${childCount} | ${preview}`);
    if (Array.isArray(b.blocks)) {
      for (const cb of b.blocks) {
        const cid = cb.id || '(no-id)';
        const ctype = cb.type;
        let cprev = '';
        if (cb.content) cprev = String(cb.content).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 110);
        else if (cb.html) cprev = '[html-render]';
        else if (Array.isArray(cb.items)) cprev = `items(${cb.items.length})`;
        else if (Array.isArray(cb.cards)) cprev = `cards(${cb.cards.length})`;
        console.log(`    > ${cid} | type=${ctype} | ${cprev}`);
      }
    }
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
