import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');
  const [row] = await db.select().from(posts).where(eq(posts.id, 795)).limit(1);
  const parsed = JSON.parse(row.content);
  const blocks = parsed.blocks;
  console.log('count:', blocks.length);
  blocks.forEach((b: any, i: number) => {
    const html = b?.html ?? '';
    const preview = String(html).replace(/\s+/g, ' ').slice(0, 220);
    console.log(`\n[${i}] type=${b?.type} id=${b?.id} order=${b?.order}`);
    if (b?.type === 'html-render') {
      console.log(`    html-len=${html.length} preview=${preview}`);
    } else {
      console.log(`    keys=${Object.keys(b).join(',')}`);
      console.log(`    full=${JSON.stringify(b).slice(0, 400)}`);
    }
  });
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
