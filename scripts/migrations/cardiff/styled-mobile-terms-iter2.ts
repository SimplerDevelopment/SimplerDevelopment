/**
 * Mobile Terms (post id 825) — iteration 2.
 *
 * Iter 1 rebuilt the hero band. Remaining gap: body section background is
 * light gray (#f6f9fc); cardiff.co/mobile-terms-and-conditions/ uses pure
 * white. Legal pages on cardiff.co also don't carry a final CTA — drop the
 * trailing `final-cta` block so the page ends naturally after the terms body.
 *
 * Idempotent:
 *   - Body section bg → '#ffffff' (only mutates non-hero, non-final-cta
 *     section blocks; safe to re-run).
 *   - Removes any block with id 'final-cta'; subsequent runs are no-ops.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const POST_ID = 825;
  const HERO_ID = 'hero-mobile-terms-and-conditions';
  const FINAL_CTA_ID = 'final-cta';

  const [row] = await db.select().from(posts).where(eq(posts.id, POST_ID)).limit(1);
  if (!row) {
    console.error(`Post ${POST_ID} not found`);
    process.exit(1);
  }
  const parsed = JSON.parse(row.content);
  if (!Array.isArray(parsed.blocks)) {
    console.error(`Post ${POST_ID}: content.blocks is not an array`);
    process.exit(1);
  }

  let recoloredCount = 0;
  for (const b of parsed.blocks) {
    if (!b || typeof b !== 'object') continue;
    if (b.id === HERO_ID || b.id === FINAL_CTA_ID) continue;
    if (b.type !== 'section') continue;
    const style = (b.style ??= {});
    if (style.backgroundColor !== '#ffffff') {
      style.backgroundColor = '#ffffff';
      recoloredCount++;
    }
  }

  const beforeLen = parsed.blocks.length;
  parsed.blocks = parsed.blocks.filter((b: { id?: string }) => b?.id !== FINAL_CTA_ID);
  const droppedCount = beforeLen - parsed.blocks.length;

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));

  console.log(
    `Updated post ${POST_ID}: recolored ${recoloredCount} section(s) → #ffffff; dropped ${droppedCount} final-cta block(s). Block count: ${parsed.blocks.length}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
