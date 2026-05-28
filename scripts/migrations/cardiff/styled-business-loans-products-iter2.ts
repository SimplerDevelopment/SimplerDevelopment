/**
 * Iter 2: Business Loan Products page (post id 799).
 *
 * Two gaps vs cardiff.co/business-loans/products/:
 *   1. The hero is over-built: deep-blue band with H1 + subtitle + two
 *      buttons ("Apply Now" / "Talk to a Specialist"). The original
 *      cardiff.co hero is a single deep-blue band with just the H1
 *      "Business Loan Products" — no subtitle, no buttons.
 *   2. The page ends with a "Ready to borrow better?" CTA band that
 *      cardiff.co's products page does not have. The original page
 *      ends right after the two product rows.
 *
 * Fix:
 *   - Replace block 0 (`hero-business-loans-products`) with a minimal
 *     `html-render` block (`hero-business-loans-products-min`) that
 *     renders just the H1 on the same deep-blue gradient.
 *   - Drop the trailing `final-cta` block.
 *
 * Idempotent:
 *   - If `hero-business-loans-products-min` is already at index 0, we
 *     re-write it in place.
 *   - If `hero-business-loans-products` is at index 0 (iter 1 output),
 *     we swap it for the minimal hero.
 *   - We always drop a trailing `final-cta` if present; if it is not,
 *     we leave the tail alone.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 799;
const NEW_BLOCK_ID = 'hero-business-loans-products-min';
const OLD_BLOCK_ID = 'hero-business-loans-products';
const TRAILING_CTA_ID = 'final-cta';

const HERO_HTML = `
<style>
  .cd-blp-hero {
    background-image: radial-gradient(ellipse at 60% 0%, rgba(56,92,192,0.45) 0%, transparent 65%), linear-gradient(135deg, #1c3370 0%, #25418b 60%, #385cc0 100%);
    padding: 80px 24px;
    text-align: center;
  }
  .cd-blp-hero__h1 {
    font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 2.5rem;
    font-weight: 800;
    color: #ffffff;
    letter-spacing: -0.01em;
    line-height: 1.15;
    margin: 0 auto;
    max-width: 1080px;
    text-shadow: 0 2px 16px rgba(0,0,0,0.32);
  }
  @media (max-width: 760px) {
    .cd-blp-hero { padding: 56px 20px; }
    .cd-blp-hero__h1 { font-size: 1.75rem; }
  }
</style>
<section class="cd-blp-hero">
  <h1 class="cd-blp-hero__h1" data-field="title">{{title}}</h1>
</section>
`.trim();

const heroBlock = {
  id: NEW_BLOCK_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  html: HERO_HTML,
  fields: [
    { name: 'title', label: 'Hero title', type: 'text' as const },
  ],
  values: {
    title: 'Business Loan Products',
  },
};

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

  // 1) Replace hero at index 0.
  const first = parsed.blocks[0];
  const firstId = first?.id;
  if (firstId === NEW_BLOCK_ID) {
    parsed.blocks[0] = heroBlock;
    console.log(`Re-wrote existing ${NEW_BLOCK_ID} at index 0 (re-run).`);
  } else if (firstId === OLD_BLOCK_ID) {
    parsed.blocks[0] = heroBlock;
    console.log(`Replaced ${OLD_BLOCK_ID} with ${NEW_BLOCK_ID} at index 0.`);
  } else {
    console.error(
      `Post ${POST_ID}: expected ${OLD_BLOCK_ID} or ${NEW_BLOCK_ID} at index 0; got [${firstId}]; aborting`,
    );
    process.exit(1);
  }

  // 2) Drop trailing final-cta if present.
  const last = parsed.blocks[parsed.blocks.length - 1];
  if (last?.id === TRAILING_CTA_ID) {
    parsed.blocks.pop();
    console.log(`Removed trailing ${TRAILING_CTA_ID} block.`);
  } else {
    console.log(`No trailing ${TRAILING_CTA_ID} found (already removed).`);
  }

  // Re-number `order` so the renderer keeps blocks sequential.
  parsed.blocks.forEach((b: { order?: number }, i: number) => {
    b.order = i + 1;
  });

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}. Block count: ${parsed.blocks.length}, block 0 id: ${parsed.blocks[0].id}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
