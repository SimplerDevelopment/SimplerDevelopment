/**
 * Iter 1: Industries hub (post id 818).
 *
 * Biggest visual gap vs cardiff.co/industries/: the original has three
 * full-width "industry strip" sections sandwiched between the hero and
 * the final CTA — Trucking / Dental Practice / Restaurants — each a
 * two-column row (industry name in deep blue on the left, descriptive
 * paragraph on the right) with alternating white / light-gray section
 * backgrounds. The port currently has ONLY a hero + final-cta, so the
 * entire industries body is missing.
 *
 * Fix: insert ONE html-render `industries-strips` block at index 1
 * (between hero-industries and final-cta) that renders all three rows
 * via data-repeat="rows" with the original copy. Same data-repeat /
 * namespaced placeholder pattern as styled-business-loans-iter1.ts.
 *
 * Idempotent: if a previous run already inserted `industries-strips`,
 * we just re-write the block in place.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 818;
const BLOCK_ID = 'industries-strips';

const INDUSTRIES_HTML = `
<style>
  .cd-ind { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; }
  .cd-ind__row { display: block; padding: 64px 24px; }
  .cd-ind__row:nth-of-type(odd)  { background: #ffffff; }
  .cd-ind__row:nth-of-type(even) { background: #f2f5f9; }
  .cd-ind__inner { max-width: 1100px; margin: 0 auto; display: grid; grid-template-columns: minmax(220px, 320px) 1fr; gap: 48px; align-items: center; }
  .cd-ind__name { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 2rem; font-weight: 800; color: #1c3370; letter-spacing: -0.01em; margin: 0; line-height: 1.1; }
  .cd-ind__name a { color: inherit; text-decoration: none; transition: color 0.18s ease; }
  .cd-ind__name a:hover { color: #ef6632; }
  .cd-ind__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1rem; line-height: 1.75; color: #4a5772; margin: 0; }
  @media (max-width: 760px) {
    .cd-ind__row { padding: 40px 20px; }
    .cd-ind__inner { grid-template-columns: 1fr; gap: 16px; }
    .cd-ind__name { font-size: 1.5rem; }
  }
</style>
<section class="cd-ind">
  <div class="cd-ind__row" data-repeat="rows">
    <div class="cd-ind__inner">
      <h2 class="cd-ind__name" data-field="name"><a href="{{rows.url}}">{{rows.name}}</a></h2>
      <p class="cd-ind__desc" data-field="description">{{rows.description}}</p>
    </div>
  </div>
</section>
`.trim();

const industriesBlock = {
  id: BLOCK_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  html: INDUSTRIES_HTML,
  fields: [
    {
      name: 'rows',
      label: 'Industry rows',
      type: 'array' as const,
      itemFields: [
        { name: 'name', label: 'Industry name', type: 'text' as const },
        { name: 'description', label: 'Description', type: 'textarea' as const },
        { name: 'url', label: 'Link', type: 'url' as const, default: '#' },
      ],
    },
  ],
  values: {
    rows: [
      {
        name: 'Trucking',
        description:
          "As one of the top 10 most funded industries at Cardiff, truck transportation loans average $65,000 in approved loan amounts. We know how hard it is for truck drivers to maintain their routes and balance the business side of their freight service.",
        url: 'https://cardiff.co/industries/trucking/',
      },
      {
        name: 'Dental Practice',
        description:
          "According to the Bureau of Labor Statistics, the average dentist earns more than $150,000 a year. It's a salary that will go far in most places, but it doesn't mean it will cover all of the costs of opening and running a practice. That's why more dentists and other health care professionals are turning to small business loans to fund their practices.",
        url: 'https://cardiff.co/industries/dental-practice/',
      },
      {
        name: 'Restaurants',
        description:
          'At Cardiff, restaurants are among our top 5 funded industries. Our average restaurant approval is $95,000. Rates and terms depend heavily on the budget, credit, revenue, and needs of the business owner.',
        url: 'https://cardiff.co/industries/restaurants/',
      },
    ],
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

  const existingIdx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === BLOCK_ID);
  if (existingIdx >= 0) {
    parsed.blocks[existingIdx] = industriesBlock;
    console.log(`Replaced existing ${BLOCK_ID} at index ${existingIdx} (re-run).`);
  } else {
    // Expect [hero-industries, final-cta]; insert strips between them.
    const heroId = parsed.blocks[0]?.id;
    const ctaId = parsed.blocks[parsed.blocks.length - 1]?.id;
    if (heroId !== 'hero-industries' || ctaId !== 'final-cta') {
      console.error(
        `Post ${POST_ID}: expected hero-industries at [0] and final-cta at last index; got [${heroId}, ..., ${ctaId}]; aborting`,
      );
      process.exit(1);
    }
    parsed.blocks.splice(parsed.blocks.length - 1, 0, industriesBlock);
  }

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: inserted ${BLOCK_ID}. New block count: ${parsed.blocks.length}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
