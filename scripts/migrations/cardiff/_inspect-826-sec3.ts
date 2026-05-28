import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const [row] = await db.select().from(posts).where(eq(posts.id, 826)).limit(1);
if (!row) {
  console.error('no post 826');
  process.exit(1);
}
const parsed = JSON.parse(row.content);
const ids = parsed.blocks.map((b: { id?: string; type?: string }) => `${b.id}:${b.type}`);
console.log('blocks:', ids);
const sec3 = parsed.blocks.find((b: { id?: string }) => b?.id === 'sec-3');
console.log('sec-3:', JSON.stringify(sec3, null, 2).slice(0, 4000));
process.exit(0);
