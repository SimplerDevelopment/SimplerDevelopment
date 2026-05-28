/**
 * Iter 3: Industries hub (post id 818) — remove the final CTA band.
 *
 * Original cardiff.co/industries/ has no closing "Ready to borrow better?"
 * CTA on this hub page — it ends after the industries strips. Our port
 * carried over a `final-cta` block. Strip it to match the original.
 *
 * Idempotent: removes any block with id `final-cta` (and/or type `cta`)
 * from the tail. If none is present (already removed), exits quietly.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 818;
const REMOVE_BLOCK_ID = 'final-cta';

async function main() {
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

  const before = parsed.blocks.length;
  const filtered = parsed.blocks.filter(
    (b: { id?: string }) => b?.id !== REMOVE_BLOCK_ID,
  );
  const removed = before - filtered.length;

  if (removed === 0) {
    console.log(
      `Post ${POST_ID}: no block with id "${REMOVE_BLOCK_ID}" found (already removed). Block count: ${before}.`,
    );
    process.exit(0);
  }

  // Re-sequence order on remaining blocks so the editor stays tidy.
  filtered.forEach((b: { order?: number }, i: number) => {
    if (typeof b.order === 'number') b.order = i;
  });

  parsed.blocks = filtered;

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));

  console.log(
    `Removed ${removed} "${REMOVE_BLOCK_ID}" block from post ${POST_ID}. Block count: ${before} -> ${filtered.length}.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
