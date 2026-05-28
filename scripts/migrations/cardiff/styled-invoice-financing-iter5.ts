/**
 * Iter 5 — Business Invoice Financing (post 798), sec-6
 * "Why Cardiff is the Right Partner for Invoice Financing".
 *
 * sec-6 is currently a flat stack: intro paragraph + 5 H3 + paragraph
 * pairs (Fast Funding Without Collateral / Clear, Upfront Pricing /
 * Industry-Specific Guidance / Funding That Grows With You / Early
 * Repayment Savings). No visual structure, reads as a wall of text.
 *
 * Mirrors the styled-equipment-leasing-iter3.ts pattern exactly:
 *   1. Centered H2 + orange underline divider (matches iter1-4 header).
 *   2. A single html-render block carrying a 5-up icon card grid
 *      (3 cards top row, 2 cards bottom centered via auto-fit grid)
 *      on a soft blue tint, with intro lead above and closing summary
 *      callout below.
 *
 * Each card has a circular icon chip (Material Icons), title, and copy.
 * Card 2 swaps the deep-blue chip for orange (#ef6632); card 4 swaps for
 * green (#5ac96f) to break up the visual rhythm.
 *
 * Brand palette only — deep blue (#1c3370 / #25418b), green (#5ac96f),
 * orange (#ef6632) accents — Material Icons, no emojis.
 *
 * Idempotent: re-running detects sec-6 and rewrites its children;
 * safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 798;
const TARGET_BLOCK_ID = 'sec-6';

const WHY_HTML = `
<style>
  .cd-if6-why { max-width: 1140px; margin: 0 auto; }
  .cd-if6-why__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 760px; margin: 0 auto 48px auto; }
  .cd-if6-why__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-if6-why__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 32px 28px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-if6-why__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-if6-why__icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-if6-why__card:nth-child(2) .cd-if6-why__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-if6-why__card:nth-child(4) .cd-if6-why__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-if6-why__icon .material-icons { font-size: 30px; }
  .cd-if6-why__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.25rem; font-weight: 800; color: #1c3370; margin: 0 0 12px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-if6-why__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.975rem; line-height: 1.7; color: #525f7f; margin: 0; }
  .cd-if6-why__closer { margin: 48px auto 0 auto; max-width: 820px; text-align: center; padding: 28px 32px; background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(239,102,50,0.06) 100%); border-radius: 12px; border: 1px solid #e6ecf5; }
  .cd-if6-why__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #25418b; margin: 0; font-weight: 500; }
  @media (max-width: 980px) {
    .cd-if6-why__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 620px) {
    .cd-if6-why__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-if6-why__card { padding: 26px 22px; }
    .cd-if6-why__closer { padding: 22px 20px; }
  }
</style>
<div class="cd-if6-why">
  <p class="cd-if6-why__intro" data-field="intro">{{intro}}</p>
  <div class="cd-if6-why__grid">
    <div class="cd-if6-why__card">
      <div class="cd-if6-why__icon"><span class="material-icons" data-field="icon1">{{icon1}}</span></div>
      <h3 class="cd-if6-why__card-title" data-field="card1Title">{{card1Title}}</h3>
      <p class="cd-if6-why__card-desc" data-field="card1Desc">{{card1Desc}}</p>
    </div>
    <div class="cd-if6-why__card">
      <div class="cd-if6-why__icon"><span class="material-icons" data-field="icon2">{{icon2}}</span></div>
      <h3 class="cd-if6-why__card-title" data-field="card2Title">{{card2Title}}</h3>
      <p class="cd-if6-why__card-desc" data-field="card2Desc">{{card2Desc}}</p>
    </div>
    <div class="cd-if6-why__card">
      <div class="cd-if6-why__icon"><span class="material-icons" data-field="icon3">{{icon3}}</span></div>
      <h3 class="cd-if6-why__card-title" data-field="card3Title">{{card3Title}}</h3>
      <p class="cd-if6-why__card-desc" data-field="card3Desc">{{card3Desc}}</p>
    </div>
    <div class="cd-if6-why__card">
      <div class="cd-if6-why__icon"><span class="material-icons" data-field="icon4">{{icon4}}</span></div>
      <h3 class="cd-if6-why__card-title" data-field="card4Title">{{card4Title}}</h3>
      <p class="cd-if6-why__card-desc" data-field="card4Desc">{{card4Desc}}</p>
    </div>
    <div class="cd-if6-why__card">
      <div class="cd-if6-why__icon"><span class="material-icons" data-field="icon5">{{icon5}}</span></div>
      <h3 class="cd-if6-why__card-title" data-field="card5Title">{{card5Title}}</h3>
      <p class="cd-if6-why__card-desc" data-field="card5Desc">{{card5Desc}}</p>
    </div>
  </div>
  <div class="cd-if6-why__closer">
    <p class="cd-if6-why__closer-text" data-field="closer">{{closer}}</p>
  </div>
</div>
`.trim();

const WHY_DEFAULTS = {
  intro:
    'Your business deserves a financing solution that adapts to your cash flow cycle. Cardiff’s invoice financing offers both the flexibility you need and a superior lending partner with solutions to meet all your funding needs.',
  icon1: 'bolt',
  card1Title: 'Fast Funding Without Collateral',
  card1Desc:
    'Cardiff advances up to 100% of your verified invoice value, often with same-day funding and no collateral required. Funding terms align with your receivables cycle so you cover expenses before they’re overdue without tying up other assets.',
  icon2: 'price_check',
  card2Title: 'Clear, Upfront Pricing',
  card2Desc:
    'Surprise fees and hidden charges are not part of our business model. Cardiff provides transparent pricing so you know exactly what you’ll owe when an invoice is paid — and can decide before you apply whether financing a specific invoice will be profitable.',
  icon3: 'support_agent',
  card3Title: 'Industry-Specific Guidance',
  card3Desc:
    'Cardiff’s advisors work with businesses in manufacturing, staffing, transportation, healthcare, and other sectors. They understand the cash flow challenges in your industry and help structure funding solutions to fit your specific needs.',
  icon4: 'trending_up',
  card4Title: 'Funding That Grows With You',
  card4Desc:
    'Submit multiple invoices and increase your funding capacity as your business expands. The more invoices you generate, the more funding you can access — making it easier to take on larger contracts or more clients without cash flow strain.',
  icon5: 'savings',
  card5Title: 'Early Repayment Savings',
  card5Desc:
    'If your customer pays sooner than expected, you can settle your financing early without interest charges. This lowers the total cost of funding and gives you more flexibility managing expenses — rewarding faster payments rather than penalizing them.',
  closer:
    'When you partner with Cardiff for invoice financing, you get more than capital — you get a funding partner built around how your business actually runs.',
} as const;

const whyBlock = {
  id: 'sec-6-why',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: WHY_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: WHY_DEFAULTS.intro },
    { name: 'icon1', label: 'Card 1 — icon', type: 'text', default: WHY_DEFAULTS.icon1 },
    { name: 'card1Title', label: 'Card 1 — title', type: 'text', default: WHY_DEFAULTS.card1Title },
    { name: 'card1Desc', label: 'Card 1 — description', type: 'textarea', default: WHY_DEFAULTS.card1Desc },
    { name: 'icon2', label: 'Card 2 — icon', type: 'text', default: WHY_DEFAULTS.icon2 },
    { name: 'card2Title', label: 'Card 2 — title', type: 'text', default: WHY_DEFAULTS.card2Title },
    { name: 'card2Desc', label: 'Card 2 — description', type: 'textarea', default: WHY_DEFAULTS.card2Desc },
    { name: 'icon3', label: 'Card 3 — icon', type: 'text', default: WHY_DEFAULTS.icon3 },
    { name: 'card3Title', label: 'Card 3 — title', type: 'text', default: WHY_DEFAULTS.card3Title },
    { name: 'card3Desc', label: 'Card 3 — description', type: 'textarea', default: WHY_DEFAULTS.card3Desc },
    { name: 'icon4', label: 'Card 4 — icon', type: 'text', default: WHY_DEFAULTS.icon4 },
    { name: 'card4Title', label: 'Card 4 — title', type: 'text', default: WHY_DEFAULTS.card4Title },
    { name: 'card4Desc', label: 'Card 4 — description', type: 'textarea', default: WHY_DEFAULTS.card4Desc },
    { name: 'icon5', label: 'Card 5 — icon', type: 'text', default: WHY_DEFAULTS.icon5 },
    { name: 'card5Title', label: 'Card 5 — title', type: 'text', default: WHY_DEFAULTS.card5Title },
    { name: 'card5Desc', label: 'Card 5 — description', type: 'textarea', default: WHY_DEFAULTS.card5Desc },
    { name: 'closer', label: 'Closing summary', type: 'textarea', default: WHY_DEFAULTS.closer },
  ],
  values: { ...WHY_DEFAULTS },
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
    id: 'sec-6-title',
    order: 1,
    level: 2,
    content: 'Why Cardiff is the Right Partner for Invoice Financing',
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
    id: 'sec-6-div',
    order: 2,
    content:
      '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  sec.blocks = [headerBlock, dividerBlock, whyBlock];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-6 -> styled 5-card "Why Cardiff is the Right Partner" grid.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
