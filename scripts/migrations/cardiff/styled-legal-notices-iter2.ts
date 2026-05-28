/**
 * Legal Notices (post id 822) — iteration 2.
 *
 * Iter-1 rebuilt the hero band. Two remaining gaps vs cardiff.co/legal-notices/:
 *   1. The page still has a `final-cta` block ("Ready to borrow better?") at
 *      the bottom. The original legal-notices page has NO final CTA — it's
 *      pure body text and stops. Remove the block.
 *   2. The body section (id `sec-1`) currently uses a soft slate tint
 *      (#f6f9fc). The original is pure white. Set backgroundColor to #ffffff.
 *
 * Idempotent: drops any block with id `final-cta` (any count) and clamps the
 * `sec-1` section's style.backgroundColor to #ffffff. Re-runnable.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const POST_ID = 822;
  const CTA_BLOCK_ID = 'final-cta';
  const BODY_SECTION_ID = 'sec-1';
  const TARGET_BG = '#ffffff';

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

  const beforeCount = parsed.blocks.length;
  const removed = parsed.blocks.filter(
    (b: { id?: string }) => b?.id === CTA_BLOCK_ID,
  ).length;
  parsed.blocks = parsed.blocks.filter(
    (b: { id?: string }) => b?.id !== CTA_BLOCK_ID,
  );

  const secIdx = parsed.blocks.findIndex(
    (b: { id?: string }) => b?.id === BODY_SECTION_ID,
  );
  let bgChanged: string | null = null;
  if (secIdx >= 0) {
    const sec = parsed.blocks[secIdx];
    sec.style = sec.style ?? {};
    const prev = sec.style.backgroundColor;
    if (prev !== TARGET_BG) {
      sec.style.backgroundColor = TARGET_BG;
      bgChanged = `${prev ?? '(unset)'} -> ${TARGET_BG}`;
    }
  } else {
    console.warn(
      `Post ${POST_ID}: no '${BODY_SECTION_ID}' section block found; bg not changed`,
    );
  }

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));

  console.log(
    `Updated post ${POST_ID}: removed ${removed} '${CTA_BLOCK_ID}' block(s) (was ${beforeCount}, now ${parsed.blocks.length}); body bg: ${bgChanged ?? 'already ' + TARGET_BG}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
