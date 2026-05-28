import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

interface Block { id?: string; type?: string; blocks?: Block[]; html?: string; values?: Record<string, unknown>; }
function walk(node: Block, fn: (b: Block) => void) { fn(node); if (Array.isArray(node.blocks)) for (const c of node.blocks) walk(c, fn); }

const [row] = await db.select().from(posts).where(eq(posts.id, 817)).limit(1);
if (!row) throw new Error('post 817 not found');
const parsed = JSON.parse(row.content);
walk(parsed, (b) => {
  if (b.id === 'sec-qual-render' || b.id === 'sec-2-options') {
    console.log('===', b.id, '===');
    console.log('html:');
    console.log(b.html);
    console.log('\nvalues:');
    console.log(JSON.stringify(b.values, null, 2));
  }
});
process.exit(0);
