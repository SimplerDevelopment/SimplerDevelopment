import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

async function main() {
  const [row] = await db.select().from(posts).where(eq(posts.id, 829)).limit(1);
  if (!row) { console.log('not found'); process.exit(1); }
  const c = JSON.parse(row.content);
  const targets = ['sec-2', 'sec-4', 'sec-6', 'sec-7'];
  for (const id of targets) {
    const b = c.blocks.find((x: any) => x.id === id);
    if (!b) continue;
    console.log(`\n===== ${id} (${b.type}) =====`);
    console.log('maxWidth:', b.maxWidth);
    console.log('sub-block count:', b.blocks?.length);
    b.blocks?.forEach((sb: any, i: number) => {
      const txt = sb.content || sb.title || '';
      const preview = typeof txt === 'string' ? txt.replace(/<[^>]+>/g, '').slice(0, 120) : '';
      console.log(`  [${i}] type=${sb.type} level=${sb.level ?? '-'} | ${preview}`);
    });
  }
  process.exit(0);
}
main();
