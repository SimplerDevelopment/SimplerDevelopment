import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

async function main() {
  const [row] = await db.select().from(posts).where(eq(posts.id, 793)).limit(1);
  if (!row) throw new Error('Post 793 not found');
  const parsed = JSON.parse(row.content);
  console.log(`Home has ${parsed.blocks.length} top-level blocks:`);
  parsed.blocks.forEach((b: { id?: string; type?: string; blocks?: unknown[] }, i: number) => {
    const children = Array.isArray(b.blocks) ? b.blocks.length : 0;
    console.log(`  [${i}] type=${b.type}  id=${b.id ?? '(no id)'}  children=${children}`);
  });
  // Look for any block referencing posts or articles
  const flat = JSON.stringify(parsed);
  const articleHints = ['data-loop', 'posts-loop', 'articles', 'recent-posts', 'blog', 'newsroom'];
  console.log('\nArticle-ish hints:');
  for (const h of articleHints) {
    const count = flat.split(h).length - 1;
    if (count > 0) console.log(`  "${h}" appears ${count}x`);
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
