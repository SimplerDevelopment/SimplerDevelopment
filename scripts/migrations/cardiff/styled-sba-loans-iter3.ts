/**
 * Iter 3: Replace post 829, block 'sec-1' ("Quick Approvals, No Hard Credit
 * Checks, Zero Obligations." stats band) with an html-render block that
 * renders 3 horizontal pill cards matching cardiff.co's stats layout
 * ($500K / $8 Billion+ / 5 minutes).
 *
 * Current port renders sec-1 as a vertical list of label/value pairs because
 * the source `section` block was a flat heading/paragraph/heading/paragraph
 * stack. Cardiff.co's design is 3 white pill cards in a horizontal row, with
 * a large blue value and a small uppercase orange label below.
 *
 * Same pattern as iter1/iter2: swap a single `section` block for an
 * `html-render` block. Uses `data-repeat="stats"` so the 3 cards are driven
 * from an array of items (so an editor can add/remove pills later).
 *
 * Idempotent: re-running cleanly re-applies the new block over either the
 * original `section` or the previously-applied `html-render`.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const SBA_POST_ID = 829;
const TARGET_BLOCK_ID = 'sec-1';

const SEC1_HTML = `
<style>
  .cd-sba-stats { background: #f6f9fc; padding: 72px 24px 80px 24px; }
  .cd-sba-stats__inner { max-width: 1100px; margin: 0 auto; }
  .cd-sba-stats__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.85rem; font-weight: 800; line-height: 1.2; letter-spacing: -0.015em; color: #25418b; text-align: center; margin: 0 0 16px 0; text-transform: none; }
  .cd-sba-stats__rule { width: 48px; height: 3px; background: #ef6632; border-radius: 2px; margin: 0 auto 44px auto; }
  .cd-sba-stats__grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 22px; }
  .cd-sba-stats__card { background: #ffffff; border: 1px solid #e6ecf3; border-radius: 999px; padding: 26px 28px; text-align: center; box-shadow: 0 6px 18px rgba(28, 51, 112, 0.06); display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 130px; transition: transform 0.18s ease, box-shadow 0.18s ease; }
  .cd-sba-stats__card:hover { transform: translateY(-2px); box-shadow: 0 14px 32px rgba(28, 51, 112, 0.12); }
  .cd-sba-stats__value { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 3rem; font-weight: 800; line-height: 1; color: #1c3370; margin: 0 0 10px 0; letter-spacing: -0.02em; }
  .cd-sba-stats__label { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.72rem; font-weight: 700; line-height: 1.35; color: #ef6632; margin: 0; text-transform: uppercase; letter-spacing: 0.14em; }
  @media (max-width: 900px) {
    .cd-sba-stats__grid { grid-template-columns: 1fr; gap: 14px; }
    .cd-sba-stats__card { border-radius: 18px; min-height: 110px; padding: 22px 24px; }
    .cd-sba-stats__title { font-size: 1.5rem; }
  }
</style>
<section class="cd-sba-stats">
  <div class="cd-sba-stats__inner">
    <h2 class="cd-sba-stats__title" data-field="title">{{title}}</h2>
    <div class="cd-sba-stats__rule"></div>
    <div class="cd-sba-stats__grid">
      <div class="cd-sba-stats__card" data-repeat="stats">
        <div class="cd-sba-stats__value" data-field="value">{{stats.value}}</div>
        <div class="cd-sba-stats__label" data-field="label">{{stats.label}}</div>
      </div>
    </div>
  </div>
</section>
`.trim();

const newSec1Block = {
  id: TARGET_BLOCK_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  order: 2,
  html: SEC1_HTML,
  fields: [
    { name: 'title', label: 'Section title', type: 'text' as const, default: 'Quick Approvals, No Hard Credit Checks, Zero Obligations.' },
    {
      name: 'stats',
      label: 'Stat pills',
      type: 'array' as const,
      itemFields: [
        { name: 'value', label: 'Value', type: 'text' as const },
        { name: 'label', label: 'Label', type: 'text' as const },
      ],
    },
  ],
  values: {
    title: 'Quick Approvals, No Hard Credit Checks, Zero Obligations.',
    stats: [
      { value: '$500K', label: 'Business Financing up to' },
      { value: '$8 Billion+', label: 'Amount Funded to Small Businesses' },
      { value: '5 minutes', label: 'Application Process only takes' },
    ],
  },
};

async function main() {
  const [row] = await db.select().from(posts).where(eq(posts.id, SBA_POST_ID)).limit(1);
  if (!row) {
    console.error(`Post ${SBA_POST_ID} not found`);
    process.exit(1);
  }
  const parsed = JSON.parse(row.content);
  if (!Array.isArray(parsed.blocks)) {
    console.error(`Post ${SBA_POST_ID}: content.blocks is not an array`);
    process.exit(1);
  }
  const idx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === TARGET_BLOCK_ID);
  if (idx === -1) {
    console.error(`Post ${SBA_POST_ID}: no block with id='${TARGET_BLOCK_ID}'; aborting`);
    process.exit(1);
  }
  const existing = parsed.blocks[idx];
  if (existing.type !== 'section' && existing.type !== 'html-render') {
    console.error(`Post ${SBA_POST_ID}: block '${TARGET_BLOCK_ID}' has unexpected type '${existing.type}'; aborting`);
    process.exit(1);
  }
  const wasAlreadyHtmlRender = existing.type === 'html-render';
  parsed.blocks[idx] = newSec1Block;
  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, SBA_POST_ID));
  console.log(
    `Updated post ${SBA_POST_ID}: replaced '${TARGET_BLOCK_ID}' with html-render 3-pill stats` +
      (wasAlreadyHtmlRender ? ' (was already html-render — reapplied)' : ' (was section)') +
      `. Block count: ${parsed.blocks.length}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
