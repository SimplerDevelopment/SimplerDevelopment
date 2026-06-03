import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';
const [row] = await db.select().from(posts).where(eq(posts.id, 797)).limit(1);
if (!row) { console.log('NOT FOUND'); process.exit(1); }
const c = JSON.parse(row.content);
console.log('title:', row.title, 'slug:', row.slug);
console.log('=== top blocks ===');
for (const b of c.blocks || []) {
  console.log('-', b.id, b.type, 'maxW=' + (b.maxWidth || '-'), 'bg=' + (b.style?.backgroundColor || '-'));
  if (Array.isArray(b.blocks)) {
    for (const sub of b.blocks) {
      const preview = (sub.content?.slice?.(0,90) || sub.html?.slice?.(0,90) || '').replace(/\s+/g, ' ');
      console.log('     child:', sub.id, sub.type, preview);
    }
  }
}
process.exit(0);
