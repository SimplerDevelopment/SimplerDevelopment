/**
 * Iter 2: Learn Articles hub (post id 819) — replace the over-built hero
 * with a minimal centered band that matches the original.
 *
 * Original cardiff.co Learn Articles hero is a single deep-blue band with
 * just the H1 + supporting tagline — no Apply Now / Talk to a Specialist
 * CTAs. Iter 1 left the bloated hero in place.
 *
 * Fix: replace block 0 (`hero-learn-articles`, currently a `section` with
 * heading + text + columns/buttons) with a minimal `html-render` block
 * (`hero-learn-articles-min`) that renders only the H1 + tagline on the
 * same deep-blue gradient at a modest height.
 *
 * Idempotent: if `hero-learn-articles-min` is already at index 0, we
 * re-write it in place; otherwise we replace whatever is at index 0
 * (expected: `hero-learn-articles`).
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 819;
const NEW_BLOCK_ID = 'hero-learn-articles-min';
const OLD_BLOCK_ID = 'hero-learn-articles';

const HERO_HTML = `
<style>
  .cd-la-hero {
    background-image: radial-gradient(ellipse at 60% 0%, rgba(56,92,192,0.45) 0%, transparent 65%), linear-gradient(135deg, #1c3370 0%, #25418b 60%, #385cc0 100%);
    padding: 80px 24px;
    text-align: center;
  }
  .cd-la-hero__h1 {
    font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 2.75rem;
    font-weight: 800;
    color: #ffffff;
    letter-spacing: -0.02em;
    line-height: 1.12;
    margin: 0 auto 18px auto;
    max-width: 1080px;
    text-shadow: 0 2px 16px rgba(0,0,0,0.32);
  }
  .cd-la-hero__sub {
    font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 1.0625rem;
    line-height: 1.6;
    color: rgba(255,255,255,0.85);
    margin: 0 auto;
    max-width: 680px;
  }
  @media (max-width: 760px) {
    .cd-la-hero { padding: 56px 20px; }
    .cd-la-hero__h1 { font-size: 1.875rem; }
    .cd-la-hero__sub { font-size: 1rem; }
  }
</style>
<section class="cd-la-hero">
  <h1 class="cd-la-hero__h1" data-field="title">{{title}}</h1>
  <p class="cd-la-hero__sub" data-field="tagline">{{tagline}}</p>
</section>
`.trim();

const heroBlock = {
  id: NEW_BLOCK_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  html: HERO_HTML,
  fields: [
    { name: 'title', label: 'Hero title', type: 'text' as const },
    { name: 'tagline', label: 'Hero tagline', type: 'text' as const },
  ],
  values: {
    title: 'Business Loan Articles',
    tagline:
      'Find working capital funding and fast unsecured business loans for your company. Learn how to secure cash flow lending for business expansion.',
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
