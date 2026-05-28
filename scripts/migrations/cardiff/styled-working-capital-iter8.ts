/**
 * Iter 8 — Working Capital page (post 837).
 *
 * Polish: refactor `sec-3-qualify` (the 5-card "What does it take to qualify"
 * grid) from 16 hard-coded fields (intro + 5x icon/title/desc) into the
 * cleaner `data-repeat="cards"` array pattern that sec-2-kinds / sec-1b
 * already use. Same visual output, but content editors can now add / remove
 * / reorder qualification criteria in the portal without code changes.
 *
 * Mirrors scripts/migrations/cardiff/styled-equipment-leasing-iter3.ts'
 * card-grid CSS, but uses `data-repeat="cards"` with `{{cards.icon}}`,
 * `{{cards.title}}`, `{{cards.body}}` placeholders.
 *
 * Brand: #1c3370 / #25418b headings, #5ac96f / #ef6632 / #ffb798 accents,
 * Raleway titles, Open Sans body. nth-child gradient rotation across cards
 * so a list of 3, 4, 5, or 6 items all read well.
 *
 * Idempotent: detects existing `sec-3-qualify` html-render and rewrites it.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 837;
const SECTION_ID = 'sec-3';
const TARGET_BLOCK_ID = 'sec-3-qualify';

const QUALIFY_HTML = `
<style>
  .cd-wc-qualify { max-width: 1140px; margin: 0 auto; }
  .cd-wc-qualify__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 760px; margin: 0 auto 48px auto; }
  .cd-wc-qualify__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-wc-qualify__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 32px 28px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-wc-qualify__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-wc-qualify__icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-wc-qualify__card:nth-child(3n+2) .cd-wc-qualify__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-wc-qualify__card:nth-child(3n+3) .cd-wc-qualify__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-wc-qualify__icon .material-icons { font-size: 30px; }
  .cd-wc-qualify__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.25rem; font-weight: 800; color: #1c3370; margin: 0 0 12px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-wc-qualify__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.975rem; line-height: 1.7; color: #525f7f; margin: 0; }
  @media (max-width: 980px) {
    .cd-wc-qualify__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 620px) {
    .cd-wc-qualify__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-wc-qualify__card { padding: 26px 22px; }
  }
</style>
<div class="cd-wc-qualify">
  <p class="cd-wc-qualify__intro" data-field="intro">{{intro}}</p>
  <div class="cd-wc-qualify__grid">
    <div class="cd-wc-qualify__card" data-repeat="cards">
      <div class="cd-wc-qualify__icon"><span class="material-icons" data-field="icon">{{cards.icon}}</span></div>
      <h3 class="cd-wc-qualify__card-title" data-field="title">{{cards.title}}</h3>
      <p class="cd-wc-qualify__card-desc" data-field="body">{{cards.body}}</p>
    </div>
  </div>
</div>
`.trim();

const QUALIFY_DEFAULTS = {
  intro:
    'Many businesses qualify for working capital lending — you only need evidence that you have a business and the loan will be paid. At Cardiff, our requirements look like this:',
  cards: [
    {
      icon: 'credit_score',
      title: 'Credit Score',
      body:
        'Personal credit scores aren’t as important as other commercial factors. A good rule: if your score is over 500, you’re in the clear.',
    },
    {
      icon: 'schedule',
      title: 'Time in Business',
      body: 'We look for at least 6 months of time in business.',
    },
    {
      icon: 'trending_up',
      title: 'Revenue',
      body:
        '$20,000 per month, or $240,000 in annual sales, with a minimum of three deposits per month.',
    },
    {
      icon: 'public',
      title: 'US Citizenship',
      body:
        'US citizenship isn’t required. Cardiff only requires that the business owner be a legal resident.',
    },
    {
      icon: 'verified_user',
      title: 'Ownership',
      body: 'Any owner can execute the contract regardless of their ownership percentage.',
    },
  ],
} as const;

const qualifyBlock = {
  id: TARGET_BLOCK_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: QUALIFY_HTML,
  fields: [
    {
      name: 'intro',
      label: 'Intro paragraph',
      type: 'textarea',
      default: QUALIFY_DEFAULTS.intro,
    },
    {
      name: 'cards',
      label: 'Qualification criteria',
      type: 'array',
      itemFields: [
        { name: 'icon', label: 'Material icon name', type: 'text' },
        { name: 'title', label: 'Card title', type: 'text' },
        { name: 'body', label: 'Card body', type: 'textarea' },
      ],
    },
  ],
  values: {
    intro: QUALIFY_DEFAULTS.intro,
    cards: QUALIFY_DEFAULTS.cards.map((c) => ({ ...c })),
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

  const secIdx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === SECTION_ID);
  if (secIdx === -1) {
    console.error(`Post ${POST_ID}: section ${SECTION_ID} not found; aborting`);
    process.exit(1);
  }
  const sec = parsed.blocks[secIdx];
  if (sec.type !== 'section' || !Array.isArray(sec.blocks)) {
    console.error(`Post ${POST_ID}: block ${SECTION_ID} is not a section with blocks[]; aborting`);
    process.exit(1);
  }

  const childIdx = sec.blocks.findIndex((b: { id?: string }) => b?.id === TARGET_BLOCK_ID);
  if (childIdx === -1) {
    console.error(
      `Post ${POST_ID}: ${TARGET_BLOCK_ID} not found inside ${SECTION_ID}; aborting`,
    );
    process.exit(1);
  }
  const existing = sec.blocks[childIdx];
  if (existing?.type !== 'html-render') {
    console.error(
      `Post ${POST_ID}: ${TARGET_BLOCK_ID} is not html-render (was ${existing?.type}); aborting`,
    );
    process.exit(1);
  }

  // Preserve any author overrides for intro that already exist (cards array
  // is intentionally re-seeded — schema shape changed from 5x flat fields).
  const existingIntro =
    typeof existing.values?.intro === 'string' && existing.values.intro.trim().length > 0
      ? existing.values.intro
      : QUALIFY_DEFAULTS.intro;
  qualifyBlock.values.intro = existingIntro;

  sec.blocks[childIdx] = qualifyBlock;

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: refactored ${TARGET_BLOCK_ID} to data-repeat="cards" (5 items).`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
