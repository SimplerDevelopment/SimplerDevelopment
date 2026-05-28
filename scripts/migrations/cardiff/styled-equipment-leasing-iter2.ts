/**
 * Iter 2: Restyle the "What's the difference between equipment leasing and
 * equipment financing?" section on post 802 (equipment-leasing).
 *
 * Cardiff.co's original renders this as a centered H2 + orange underline +
 * narrow intro paragraph, followed by TWO side-by-side colored cards labeled
 * "Operating Lease" (deep-blue panel) and "Equipment Finance Agreement"
 * (orange panel) each with their own description copy. The port currently
 * shows the H2/intro plus a separate `Operating Lease` stacked section with
 * generic paragraph copy — no comparison framing, no second column, no
 * colored panels.
 *
 * This iter:
 *   1. Replaces sec-2 sub-blocks with a heading + orange divider + html-render
 *      block carrying the 2-column compare cards. We re-use the same pattern
 *      as styled-how-to-qualify-iter1.ts (html-render with editable fields).
 *   2. Widens sec-2 to 1140px so the cards have breathing room.
 *   3. Removes sec-3 (the redundant standalone "Operating Lease" section)
 *      since its content is now absorbed into the left card of the compare.
 *
 * Idempotent: re-running detects an existing html-render block at id
 *   `sec-2-compare` and rewrites it; sec-3 removal is conditional on it still
 *   being present as a section.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 802;
const TARGET_BLOCK_ID = 'sec-2';
const REDUNDANT_BLOCK_ID = 'sec-3';

const COMPARE_HTML = `
<style>
  .cd-eq-diff { max-width: 1100px; margin: 0 auto; }
  .cd-eq-diff__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; max-width: 780px; margin: 0 auto 48px auto; }
  .cd-eq-diff__intro strong { color: #1c3370; }
  .cd-eq-diff__grid { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; align-items: stretch; }
  .cd-eq-diff__card { padding: 38px 34px; border-radius: 10px; color: #fff; display: flex; flex-direction: column; position: relative; overflow: hidden; box-shadow: 0 18px 44px rgba(28,51,112,0.14); }
  .cd-eq-diff__card--blue { background: linear-gradient(155deg, #25418b 0%, #1c3370 100%); }
  .cd-eq-diff__card--orange { background: linear-gradient(155deg, #ef6632 0%, #d8501e 100%); }
  .cd-eq-diff__eyebrow { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.22em; text-transform: uppercase; color: rgba(255,255,255,0.78); margin: 0 0 10px 0; }
  .cd-eq-diff__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.875rem; font-weight: 800; letter-spacing: -0.01em; color: #fff; margin: 0 0 16px 0; line-height: 1.15; text-transform: uppercase; }
  .cd-eq-diff__underline { width: 48px; height: 3px; background: #ffb798; border-radius: 2px; margin: 0 0 22px 0; }
  .cd-eq-diff__card--orange .cd-eq-diff__underline { background: #ffffff; }
  .cd-eq-diff__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1rem; line-height: 1.7; color: rgba(255,255,255,0.94); margin: 0 0 16px 0; }
  .cd-eq-diff__desc:last-child { margin-bottom: 0; }
  @media (max-width: 820px) {
    .cd-eq-diff__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-eq-diff__card { padding: 28px 24px; }
    .cd-eq-diff__title { font-size: 1.5rem; }
  }
</style>
<div class="cd-eq-diff">
  <p class="cd-eq-diff__intro" data-field="intro">{{intro}}</p>
  <div class="cd-eq-diff__grid">
    <div class="cd-eq-diff__card cd-eq-diff__card--blue">
      <p class="cd-eq-diff__eyebrow" data-field="leftEyebrow">{{leftEyebrow}}</p>
      <h3 class="cd-eq-diff__title" data-field="leftTitle">{{leftTitle}}</h3>
      <div class="cd-eq-diff__underline" aria-hidden="true"></div>
      <p class="cd-eq-diff__desc" data-field="leftDesc">{{leftDesc}}</p>
      <p class="cd-eq-diff__desc" data-field="leftDesc2">{{leftDesc2}}</p>
    </div>
    <div class="cd-eq-diff__card cd-eq-diff__card--orange">
      <p class="cd-eq-diff__eyebrow" data-field="rightEyebrow">{{rightEyebrow}}</p>
      <h3 class="cd-eq-diff__title" data-field="rightTitle">{{rightTitle}}</h3>
      <div class="cd-eq-diff__underline" aria-hidden="true"></div>
      <p class="cd-eq-diff__desc" data-field="rightDesc">{{rightDesc}}</p>
      <p class="cd-eq-diff__desc" data-field="rightDesc2">{{rightDesc2}}</p>
    </div>
  </div>
</div>
`.trim();

const compareBlock = {
  id: 'sec-2-compare',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: COMPARE_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea',
      default: "Equipment leasing lets you use an asset without owning it — at the end of the lease, you can buy, return, or continue to lease. Equipment financing lets you own the equipment outright after a fixed term. Cardiff is flexible on both: choose the program and terms that fit your budget and cash flow." },
    { name: 'leftEyebrow', label: 'Left card — eyebrow', type: 'text', default: 'Use, Don’t Own' },
    { name: 'leftTitle', label: 'Left card — title', type: 'text', default: 'Operating Lease' },
    { name: 'leftDesc', label: 'Left card — description', type: 'textarea',
      default: 'An operating lease lets your business put specialized equipment to work without the burden of ownership. Lease payments are typically lower than loan payments, and the equipment stays off your balance sheet.' },
    { name: 'leftDesc2', label: 'Left card — secondary description', type: 'textarea',
      default: 'At the end of the term you decide what comes next: buy the equipment at fair market value, return it, or roll into a new lease on upgraded gear. Ideal for technology that changes fast or seasonal needs.' },
    { name: 'rightEyebrow', label: 'Right card — eyebrow', type: 'text', default: 'Own It Outright' },
    { name: 'rightTitle', label: 'Right card — title', type: 'text', default: 'Equipment Finance Agreement' },
    { name: 'rightDesc', label: 'Right card — description', type: 'textarea',
      default: 'An equipment finance agreement lets you purchase the equipment your business needs now and pay over a fixed term. You own the asset from day one and build equity with every payment.' },
    { name: 'rightDesc2', label: 'Right card — secondary description', type: 'textarea',
      default: 'Best when you plan to keep the equipment long-term, want depreciation benefits, or are buying assets with a long useful life like trucks, machinery, or kitchen gear.' },
  ],
  values: {
    intro: "Equipment leasing lets you use an asset without owning it — at the end of the lease, you can buy, return, or continue to lease. Equipment financing lets you own the equipment outright after a fixed term. Cardiff is flexible on both: choose the program and terms that fit your budget and cash flow.",
    leftEyebrow: 'Use, Don’t Own',
    leftTitle: 'Operating Lease',
    leftDesc: 'An operating lease lets your business put specialized equipment to work without the burden of ownership. Lease payments are typically lower than loan payments, and the equipment stays off your balance sheet.',
    leftDesc2: 'At the end of the term you decide what comes next: buy the equipment at fair market value, return it, or roll into a new lease on upgraded gear. Ideal for technology that changes fast or seasonal needs.',
    rightEyebrow: 'Own It Outright',
    rightTitle: 'Equipment Finance Agreement',
    rightDesc: 'An equipment finance agreement lets you purchase the equipment your business needs now and pay over a fixed term. You own the asset from day one and build equity with every payment.',
    rightDesc2: 'Best when you plan to keep the equipment long-term, want depreciation benefits, or are buying assets with a long useful life like trucks, machinery, or kitchen gear.',
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

  const sec2Idx = parsed.blocks.findIndex((b: any) => b?.id === TARGET_BLOCK_ID);
  if (sec2Idx === -1) {
    console.error(`Post ${POST_ID}: no block with id=${TARGET_BLOCK_ID}; aborting`);
    process.exit(1);
  }
  const sec2 = parsed.blocks[sec2Idx];
  if (sec2.type !== 'section') {
    console.error(`Post ${POST_ID}: block ${TARGET_BLOCK_ID} is not a section (was ${sec2.type}); aborting`);
    process.exit(1);
  }

  // Widen so the 2-col cards breathe.
  sec2.maxWidth = '1140px';

  const headerBlock = {
    type: 'heading' as const,
    id: 'sec-2-title',
    order: 1,
    level: 2,
    content: 'What’s the difference between equipment leasing and equipment financing?',
    alignment: 'center' as const,
    style: {
      color: '#1c3370',
      fontFamily: "Raleway, -apple-system, BlinkMacSystemFont, sans-serif",
      fontSize: '2.25rem',
      fontWeight: '800',
      letterSpacing: '-0.015em',
      lineHeight: '1.18',
      margin: '0 auto 14px auto',
      maxWidth: '900px',
      textAlign: 'center',
    },
  };
  const dividerBlock = {
    type: 'text' as const,
    id: 'sec-2-div',
    order: 2,
    content: '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  sec2.blocks = [headerBlock, dividerBlock, compareBlock];

  // Remove the redundant sec-3 "Operating Lease" standalone section (now folded
  // into the left compare card). Idempotent: skip if already gone.
  const sec3Idx = parsed.blocks.findIndex((b: any) => b?.id === REDUNDANT_BLOCK_ID);
  let removedSec3 = false;
  if (sec3Idx !== -1 && parsed.blocks[sec3Idx].type === 'section') {
    parsed.blocks.splice(sec3Idx, 1);
    removedSec3 = true;
  }

  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-2 -> 2-col compare cards (Operating Lease | Equipment Finance Agreement)${removedSec3 ? `; removed redundant ${REDUNDANT_BLOCK_ID}` : ''}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
