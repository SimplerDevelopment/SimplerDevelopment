import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

async function main() {
  // contact-us hero
  const [contact] = await db.select().from(posts).where(eq(posts.id, 801)).limit(1);
  if (contact) {
    const parsed = JSON.parse(contact.content);
    const hero = parsed.blocks.find((b: { id?: string }) => b.id?.startsWith('hero'));
    console.log('=== CONTACT-US HERO BLOCK ===');
    console.log('id:', hero?.id, 'type:', hero?.type);
    if (hero?.html) console.log('html (first 4000):', hero.html.slice(0, 4000));
    else console.log('block:', JSON.stringify(hero, null, 2).slice(0, 2000));
  }
  // learn-articles pagination
  const [la] = await db.select().from(posts).where(eq(posts.id, 819)).limit(1);
  if (la) {
    const parsed = JSON.parse(la.content);
    console.log('\n=== LEARN-ARTICLES BLOCKS ===');
    parsed.blocks.forEach((b: { id?: string; type?: string }, i: number) => {
      console.log(`  [${i}] type=${b.type}  id=${b.id}`);
    });
    const flat = JSON.stringify(parsed);
    const hits = ['data-loop', 'pagination', 'paginat', 'older', 'newer', 'page=', '?page', 'Older Entries'];
    console.log('\nPagination-ish hits:');
    for (const h of hits) {
      const n = flat.split(h).length - 1;
      if (n > 0) console.log(`  "${h}" → ${n}x`);
    }
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
