/**
 * Iter 3: Replace post 804 (how-to-qualify) "Is Cardiff the right lender
 * for my business?" section (sec-4) with an html-render block that matches
 * cardiff.co's actual treatment:
 *
 *  - A single light-bordered white card centered on the page-bg.
 *  - Section heading in deep blue, intro paragraph, then a bulleted list
 *    of loan types — each row prefixed by a green check_circle (inline,
 *    in line with the text — NOT the chip-style card grid that iter 1/2
 *    left in place).
 *  - A small outro paragraph noting non-qualifying industries.
 *
 * Iter 1 fixed the WHAT WE LOOK FOR comparison; iter 2 fixed the hero.
 * The CTA section (sec-3) is still undersized but is a smaller gap than
 * this fully-wrong card grid, so it stays for iter 4+.
 *
 * Idempotent: re-running on the iter3 sec-4 leaves it unchanged.
 *
 * Run: bunx tsx scripts/migrations/cardiff/styled-how-to-qualify-iter3.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

const POST_ID = 804;
const TARGET_BLOCK_ID = 'sec-4';
const NEW_BLOCK_ID = 'sec-4-right-lender-iter3';
const ACCEPTED_PREVIOUS_IDS = ['sec-4', NEW_BLOCK_ID];

const HTML = `
<style>
  .cd-htq-rl { background: #f6f9fc; padding: 80px 24px 80px 24px; }
  .cd-htq-rl__card { max-width: 760px; margin: 0 auto; background: #ffffff; border: 1px solid #e3e9f2; border-radius: 10px; padding: 48px 52px 44px 52px; box-shadow: 0 6px 22px rgba(28,51,112,0.06); }
  .cd-htq-rl__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.875rem; font-weight: 800; color: #25418b; letter-spacing: -0.012em; line-height: 1.2; margin: 0 0 14px 0; text-align: center; }
  .cd-htq-rl__rule { width: 48px; height: 3px; background: #ef6632; border-radius: 2px; margin: 0 auto 24px auto; }
  .cd-htq-rl__intro { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1rem; line-height: 1.7; color: #525f7f; margin: 0 0 22px 0; text-align: center; }
  .cd-htq-rl__list { list-style: none; padding: 0; margin: 0 0 28px 0; }
  .cd-htq-rl__item { display: flex; align-items: flex-start; gap: 12px; padding: 8px 0; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1rem; line-height: 1.6; color: #2d3a55; }
  .cd-htq-rl__item .material-icons { color: #5ac96f; font-size: 22px; flex: 0 0 auto; margin-top: 2px; }
  .cd-htq-rl__outro { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; line-height: 1.65; color: #6b7280; margin: 0; text-align: left; font-style: italic; }
  @media (max-width: 720px) {
    .cd-htq-rl { padding: 56px 16px; }
    .cd-htq-rl__card { padding: 32px 24px; }
    .cd-htq-rl__title { font-size: 1.5rem; }
  }
</style>
<link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons">
<section class="cd-htq-rl">
  <div class="cd-htq-rl__card">
    <h2 class="cd-htq-rl__title" data-field="title">{{title}}</h2>
    <div class="cd-htq-rl__rule"></div>
    <p class="cd-htq-rl__intro" data-field="intro">{{intro}}</p>
    <ul class="cd-htq-rl__list" data-repeat="items">
      <li class="cd-htq-rl__item">
        <span class="material-icons">check_circle</span>
        <span data-field="label">{{items.label}}</span>
      </li>
    </ul>
    <p class="cd-htq-rl__outro" data-field="outro">{{outro}}</p>
  </div>
</section>
`.trim();

const newBlock = {
  id: NEW_BLOCK_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  order: 5,
  html: HTML,
  fields: [
    { name: 'title', label: 'Section title', type: 'text', default: 'Is Cardiff the right lender for my business?' },
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: 'Cardiff works with a wide variety of small businesses. Here are just a few of the types of small business loans that Cardiff specializes in:' },
    {
      name: 'items',
      label: 'Loan types',
      type: 'repeater',
      itemFields: [
        { name: 'label', label: 'Label', type: 'text', default: '' },
      ],
      default: [
        { label: 'Trucking loans (long-haul, short-haul, last mile, interstate or intrastate)' },
        { label: 'Dental Practice loans' },
        { label: 'Contractor loans (electrical, general, roofing, HVAC, plumbing) Restaurant loans' },
        { label: 'Construction loans (excavation, stone cutting, concrete, landscaping, masonry stone and tile, painting, carpentry)' },
        { label: 'Gym loans (crossfit, yoga, pilates, spinning, tanning)' },
      ],
    },
    { name: 'outro', label: 'Outro paragraph', type: 'textarea', default: 'Automotive dealers, financial services firms, law firms, and non-profits typically won’t qualify for a Cardiff business loan.' },
  ],
  values: {
    title: 'Is Cardiff the right lender for my business?',
    intro: 'Cardiff works with a wide variety of small businesses. Here are just a few of the types of small business loans that Cardiff specializes in:',
    items: [
      { label: 'Trucking loans (long-haul, short-haul, last mile, interstate or intrastate)' },
      { label: 'Dental Practice loans' },
      { label: 'Contractor loans (electrical, general, roofing, HVAC, plumbing) Restaurant loans' },
      { label: 'Construction loans (excavation, stone cutting, concrete, landscaping, masonry stone and tile, painting, carpentry)' },
      { label: 'Gym loans (crossfit, yoga, pilates, spinning, tanning)' },
    ],
    outro: 'Automotive dealers, financial services firms, law firms, and non-profits typically won’t qualify for a Cardiff business loan.',
  },
};

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema/cms');
  const { eq } = await import('drizzle-orm');

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
  const idx = parsed.blocks.findIndex(
    (b: { id?: string }) => b && (b.id === TARGET_BLOCK_ID || b.id === NEW_BLOCK_ID),
  );
  if (idx === -1) {
    console.error(`Post ${POST_ID}: no block with id in ${ACCEPTED_PREVIOUS_IDS.join(', ')} to replace`);
    process.exit(1);
  }
  const existing = parsed.blocks[idx];
  if (existing.id === NEW_BLOCK_ID && existing.type === 'html-render') {
    parsed.blocks[idx] = { ...existing, ...newBlock, order: existing.order };
    await db
      .update(posts)
      .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
      .where(eq(posts.id, POST_ID));
    console.log(`Re-applied iter3 right-lender block on post ${POST_ID} (id=${NEW_BLOCK_ID}).`);
    process.exit(0);
  }
  parsed.blocks[idx] = { ...newBlock, order: existing.order ?? 5 };
  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: replaced block ${TARGET_BLOCK_ID} (was type=${existing.type}) with html-render iter3 (bordered card + bulleted list).`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
