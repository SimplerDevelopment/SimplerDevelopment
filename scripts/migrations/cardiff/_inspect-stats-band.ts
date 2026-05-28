import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

async function main() {
  const [row] = await db.select().from(posts).where(eq(posts.id, 793)).limit(1);
  if (!row) throw new Error('Post 793 not found');
  const parsed = JSON.parse(row.content);
  const stats = parsed.blocks?.find((b: { id?: string }) => b.id === 'stats-band');
  console.log('stats-band block:');
  console.log(JSON.stringify(stats, null, 2));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
