/**
 * Iter 8 — Convert the home page "Apply Once. Move Fast." mid-cta from a
 * solid blue band to a white-bg section to match cardiff.co's restrained
 * mid-page CTA treatment (the original is white text on white background,
 * not a saturated blue band).
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const HOME_POST_ID = 793;

async function main() {
  const [row] = await db.select().from(posts).where(eq(posts.id, HOME_POST_ID)).limit(1);
  if (!row) throw new Error(`Post ${HOME_POST_ID} not found`);
  const parsed = JSON.parse(row.content);
  const mid = parsed.blocks[10];
  if (mid?.id !== 'mid-cta') throw new Error(`Expected block[10].id === 'mid-cta', got ${mid?.id}`);

  mid.style = { ...(mid.style || {}), backgroundColor: '#ffffff' };
  // Recolor children to be readable on white
  for (const child of (mid.blocks || [])) {
    if (child.id === 'midcta-overline') {
      child.style = { ...(child.style || {}), color: '#ef6632' };
    } else if (child.id === 'midcta-title') {
      child.style = { ...(child.style || {}), color: '#25418b' };
    } else if (child.id === 'midcta-body') {
      child.style = { ...(child.style || {}), color: '#525f7f' };
    }
  }

  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, HOME_POST_ID));
  console.log(`Updated post ${HOME_POST_ID}: mid-cta blue band → white background, recolored text`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
