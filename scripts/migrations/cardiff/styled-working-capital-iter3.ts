/**
 * Iter 3: Restyle the "What does it take to qualify for working capital
 * financing?" section on post 837 (working-capital). This is sec-3 — currently
 * a long stack of H4 + paragraph pairs (5 requirements) with no visual
 * structure.
 *
 * Cardiff.co's qualifications block reads as discrete criteria, but the port
 * shows them as a wall of text. We replace sec-3 sub-blocks with:
 *   1. Centered H2 + orange underline (same pattern as iter2)
 *   2. Lead intro paragraph
 *   3. A single html-render block carrying a 5-up icon card grid with a
 *      light-blue tinted backdrop, using `data-repeat` for the cards.
 *
 * Layout: 3 cards top row, 2 cards bottom row (auto-fit grid), each card has
 * a circular icon chip (Material Icons), title, and copy. Brand palette only —
 * deep blue (#1c3370 / #25418b), green (#5ac96f), orange (#ef6632) accents,
 * no emojis.
 *
 * Idempotent: re-running detects existing html-render block at id
 *   `sec-3-qualify` and rewrites it; safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 837;
const TARGET_BLOCK_ID = 'sec-3';

const QUALIFY_HTML = `
<style>
  .cd-wc-qualify { max-width: 1140px; margin: 0 auto; }
  .cd-wc-qualify__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 760px; margin: 0 auto 48px auto; }
  .cd-wc-qualify__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-wc-qualify__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 32px 28px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-wc-qualify__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-wc-qualify__icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-wc-qualify__card:nth-child(2) .cd-wc-qualify__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-wc-qualify__card:nth-child(4) .cd-wc-qualify__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
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
    <div class="cd-wc-qualify__card">
      <div class="cd-wc-qualify__icon"><span class="material-icons" data-field="icon1">{{icon1}}</span></div>
      <h3 class="cd-wc-qualify__card-title" data-field="card1Title">{{card1Title}}</h3>
      <p class="cd-wc-qualify__card-desc" data-field="card1Desc">{{card1Desc}}</p>
    </div>
    <div class="cd-wc-qualify__card">
      <div class="cd-wc-qualify__icon"><span class="material-icons" data-field="icon2">{{icon2}}</span></div>
      <h3 class="cd-wc-qualify__card-title" data-field="card2Title">{{card2Title}}</h3>
      <p class="cd-wc-qualify__card-desc" data-field="card2Desc">{{card2Desc}}</p>
    </div>
    <div class="cd-wc-qualify__card">
      <div class="cd-wc-qualify__icon"><span class="material-icons" data-field="icon3">{{icon3}}</span></div>
      <h3 class="cd-wc-qualify__card-title" data-field="card3Title">{{card3Title}}</h3>
      <p class="cd-wc-qualify__card-desc" data-field="card3Desc">{{card3Desc}}</p>
    </div>
    <div class="cd-wc-qualify__card">
      <div class="cd-wc-qualify__icon"><span class="material-icons" data-field="icon4">{{icon4}}</span></div>
      <h3 class="cd-wc-qualify__card-title" data-field="card4Title">{{card4Title}}</h3>
      <p class="cd-wc-qualify__card-desc" data-field="card4Desc">{{card4Desc}}</p>
    </div>
    <div class="cd-wc-qualify__card">
      <div class="cd-wc-qualify__icon"><span class="material-icons" data-field="icon5">{{icon5}}</span></div>
      <h3 class="cd-wc-qualify__card-title" data-field="card5Title">{{card5Title}}</h3>
      <p class="cd-wc-qualify__card-desc" data-field="card5Desc">{{card5Desc}}</p>
    </div>
  </div>
</div>
`.trim();

const QUALIFY_DEFAULTS = {
  intro: "Many businesses qualify for working capital lending — you only need evidence that you have a business and the loan will be paid. At Cardiff, our requirements look like this:",
  icon1: 'credit_score',
  card1Title: 'Credit Score',
  card1Desc: "Personal credit scores aren’t as important as other commercial factors. A good rule: if your score is over 500, you’re in the clear.",
  icon2: 'schedule',
  card2Title: 'Time in Business',
  card2Desc: 'We look for at least 6 months of time in business.',
  icon3: 'trending_up',
  card3Title: 'Revenue',
  card3Desc: '$20,000 per month, or $240,000 in annual sales, with a minimum of three deposits per month.',
  icon4: 'public',
  card4Title: 'US Citizenship',
  card4Desc: 'US citizenship isn’t required. Cardiff only requires that the business owner be a legal resident.',
  icon5: 'verified_user',
  card5Title: 'Ownership',
  card5Desc: 'Any owner can execute the contract regardless of their ownership percentage.',
} as const;

const qualifyBlock = {
  id: 'sec-3-qualify',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: QUALIFY_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: QUALIFY_DEFAULTS.intro },
    { name: 'icon1', label: 'Card 1 — icon', type: 'text', default: QUALIFY_DEFAULTS.icon1 },
    { name: 'card1Title', label: 'Card 1 — title', type: 'text', default: QUALIFY_DEFAULTS.card1Title },
    { name: 'card1Desc', label: 'Card 1 — description', type: 'textarea', default: QUALIFY_DEFAULTS.card1Desc },
    { name: 'icon2', label: 'Card 2 — icon', type: 'text', default: QUALIFY_DEFAULTS.icon2 },
    { name: 'card2Title', label: 'Card 2 — title', type: 'text', default: QUALIFY_DEFAULTS.card2Title },
    { name: 'card2Desc', label: 'Card 2 — description', type: 'textarea', default: QUALIFY_DEFAULTS.card2Desc },
    { name: 'icon3', label: 'Card 3 — icon', type: 'text', default: QUALIFY_DEFAULTS.icon3 },
    { name: 'card3Title', label: 'Card 3 — title', type: 'text', default: QUALIFY_DEFAULTS.card3Title },
    { name: 'card3Desc', label: 'Card 3 — description', type: 'textarea', default: QUALIFY_DEFAULTS.card3Desc },
    { name: 'icon4', label: 'Card 4 — icon', type: 'text', default: QUALIFY_DEFAULTS.icon4 },
    { name: 'card4Title', label: 'Card 4 — title', type: 'text', default: QUALIFY_DEFAULTS.card4Title },
    { name: 'card4Desc', label: 'Card 4 — description', type: 'textarea', default: QUALIFY_DEFAULTS.card4Desc },
    { name: 'icon5', label: 'Card 5 — icon', type: 'text', default: QUALIFY_DEFAULTS.icon5 },
    { name: 'card5Title', label: 'Card 5 — title', type: 'text', default: QUALIFY_DEFAULTS.card5Title },
    { name: 'card5Desc', label: 'Card 5 — description', type: 'textarea', default: QUALIFY_DEFAULTS.card5Desc },
  ],
  values: { ...QUALIFY_DEFAULTS },
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

  const idx = parsed.blocks.findIndex((b: any) => b?.id === TARGET_BLOCK_ID);
  if (idx === -1) {
    console.error(`Post ${POST_ID}: no block with id=${TARGET_BLOCK_ID}; aborting`);
    process.exit(1);
  }
  const sec = parsed.blocks[idx];
  if (sec.type !== 'section') {
    console.error(`Post ${POST_ID}: block ${TARGET_BLOCK_ID} is not a section (was ${sec.type}); aborting`);
    process.exit(1);
  }

  // Widen so the 3-col card grid breathes.
  sec.maxWidth = '1200px';
  // Soft blue-tinted background to set this band apart from neighbors.
  sec.style = {
    ...(sec.style || {}),
    backgroundColor: '#f6f9fc',
    paddingTop: '80px',
    paddingBottom: '80px',
    paddingLeft: '24px',
    paddingRight: '24px',
  };

  const headerBlock = {
    type: 'heading' as const,
    id: 'sec-3-title',
    order: 1,
    level: 2,
    content: 'What does it take to qualify for working capital financing?',
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
    id: 'sec-3-div',
    order: 2,
    content: '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  sec.blocks = [headerBlock, dividerBlock, qualifyBlock];

  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-3 -> styled 5-card "Qualify for working capital" grid.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
