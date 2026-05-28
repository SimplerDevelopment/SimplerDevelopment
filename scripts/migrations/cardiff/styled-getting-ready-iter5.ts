/**
 * Iter 5: On post 803 (Getting Ready for a Loan), sec-2 currently ends with
 * three bare gray paragraphs (sec-2-p-4, sec-2-p-5, sec-2-p-6) that explain
 * WHY Cardiff built the checklist — the largest remaining unstyled chunk on
 * the page after iters 1-4. We replace those three text sub-blocks with a
 * single html-render block carrying a 3-up icon-card grid (same visual
 * pattern as scripts/migrations/cardiff/styled-equipment-leasing-iter3.ts),
 * using `data-repeat="cards"` and `{{cards.field}}` interpolation so each
 * card is editable in the portal.
 *
 * The opening heading, intro, and checklist (sec-2-list-3-iter2) stay put;
 * we only rewrite the trailing wall-of-text.
 *
 * Idempotent: re-running detects an existing html-render block with id
 *   `sec-2-why-cards` and rewrites it; if the 3 stale text blocks are still
 *   present they are stripped on every run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 803;
const TARGET_SECTION_ID = 'sec-2';
const NEW_BLOCK_ID = 'sec-2-why-cards';
const STALE_TEXT_IDS = new Set(['sec-2-p-4', 'sec-2-p-5', 'sec-2-p-6']);

const WHY_HTML = `
<style>
  .cd-gr-why { max-width: 1140px; margin: 32px auto 0 auto; }
  .cd-gr-why__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-gr-why__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 32px 28px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-gr-why__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-gr-why__icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-gr-why__card:nth-child(2) .cd-gr-why__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-gr-why__card:nth-child(3) .cd-gr-why__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-gr-why__icon .material-icons { font-size: 30px; }
  .cd-gr-why__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.25rem; font-weight: 800; color: #1c3370; margin: 0 0 12px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-gr-why__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.975rem; line-height: 1.7; color: #525f7f; margin: 0; }
  @media (max-width: 980px) {
    .cd-gr-why__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-gr-why__card { padding: 26px 22px; }
  }
</style>
<link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet" />
<div class="cd-gr-why">
  <div class="cd-gr-why__grid" data-repeat="cards">
    <div class="cd-gr-why__card">
      <div class="cd-gr-why__icon"><span class="material-icons" data-field="icon">{{cards.icon}}</span></div>
      <h3 class="cd-gr-why__card-title" data-field="title">{{cards.title}}</h3>
      <p class="cd-gr-why__card-desc" data-field="description">{{cards.description}}</p>
    </div>
  </div>
</div>
`.trim();

const WHY_DEFAULTS = {
  cards: [
    {
      icon: 'lightbulb',
      title: 'Great advice, easy to follow',
      description: 'This is all great advice. Keep reading for more advice and to learn more about what makes a strong small business loan application.',
    },
    {
      icon: 'schedule',
      title: 'Simpler than it seems',
      description: 'Applying for a small business loan is not as complicated as it seems and it doesn’t need to take up a ton of your time. With many online lenders, the application is as easy as it can be.',
    },
    {
      icon: 'fact_check',
      title: 'A checklist to keep you ready',
      description: 'Because we want you to be 100% ready to apply, we came up with a checklist of items and qualifications you may need to have ready — so you don’t waste time with any back and forth.',
    },
  ],
} as const;

const whyCardsBlock = {
  id: NEW_BLOCK_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  order: 5,
  html: WHY_HTML,
  fields: [
    {
      name: 'cards',
      label: 'Why-prepare cards',
      type: 'repeater',
      fields: [
        { name: 'icon', label: 'Material icon name', type: 'text' },
        { name: 'title', label: 'Card title', type: 'text' },
        { name: 'description', label: 'Card description', type: 'textarea' },
      ],
    },
  ],
  values: { cards: WHY_DEFAULTS.cards.map((c) => ({ ...c })) },
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
  const idx = parsed.blocks.findIndex((b: any) => b?.id === TARGET_SECTION_ID);
  if (idx === -1) {
    console.error(`Post ${POST_ID}: no block with id=${TARGET_SECTION_ID}; aborting`);
    process.exit(1);
  }
  const sec = parsed.blocks[idx];
  if (sec.type !== 'section') {
    console.error(`Post ${POST_ID}: ${TARGET_SECTION_ID} is not a section (was ${sec.type}); aborting`);
    process.exit(1);
  }
  if (!Array.isArray(sec.blocks)) sec.blocks = [];

  // Widen the section so the 3-up grid breathes (was 880px for the prior text column).
  sec.maxWidth = '1200px';

  // Strip any stale trailing text paragraphs and any prior copy of this block, then append fresh.
  const kept = sec.blocks.filter((b: any) => {
    if (b?.id === NEW_BLOCK_ID) return false;
    if (b?.type === 'text' && STALE_TEXT_IDS.has(b?.id)) return false;
    return true;
  });

  // Re-number `order` on kept blocks so the new card grid lands cleanly at the end.
  kept.forEach((b: any, i: number) => {
    b.order = i + 1;
  });
  whyCardsBlock.order = kept.length + 1;
  sec.blocks = [...kept, whyCardsBlock];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: replaced sec-2 trailing paragraphs (${[...STALE_TEXT_IDS].join(', ')}) with html-render block ${NEW_BLOCK_ID} (3-up icon-card grid).`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
