/**
 * Iter 3: Restyle the "How Auto Repair Loans Can Grow Your Business"
 * section on post 805 (industries-auto-repair). This is sec-3 — currently
 * a centered H2 + orange underline + intro paragraphs followed by three
 * H4 + paragraph loan-product pairs (Short-Term, Line of Credit, SBA)
 * stacked vertically with no structure.
 *
 * Same pattern as styled-equipment-leasing-iter3.ts: centered H2 + divider
 * (kept as native blocks), then a single html-render carrying a 3-up
 * icon-card grid on a light-blue band. Each card = circular brand-gradient
 * icon chip + product title + short description.
 *
 * Brand-only palette — deep blue (#1c3370 / #25418b), green (#5ac96f),
 * orange (#ef6632). Material Icons (no emojis). Raleway + Open Sans.
 *
 * Idempotent: re-running detects the existing html-render block at id
 * `sec-3-products` (and the heading/divider it pairs with) and rewrites
 * the section in place. Safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 805;
const TARGET_BLOCK_ID = 'sec-3';

const PRODUCTS_HTML = `
<style>
  .cd-ar-prod { max-width: 1140px; margin: 0 auto; }
  .cd-ar-prod__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 780px; margin: 0 auto 48px auto; }
  .cd-ar-prod__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-ar-prod__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 32px 28px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-ar-prod__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-ar-prod__icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-ar-prod__card:nth-child(2) .cd-ar-prod__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-ar-prod__card:nth-child(3) .cd-ar-prod__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-ar-prod__icon .material-icons { font-size: 30px; }
  .cd-ar-prod__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.25rem; font-weight: 800; color: #1c3370; margin: 0 0 12px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-ar-prod__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.975rem; line-height: 1.7; color: #525f7f; margin: 0; }
  .cd-ar-prod__closer { margin: 48px auto 0 auto; max-width: 820px; text-align: center; padding: 28px 32px; background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(239,102,50,0.06) 100%); border-radius: 12px; border: 1px solid #e6ecf5; }
  .cd-ar-prod__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #25418b; margin: 0; font-weight: 500; }
  @media (max-width: 980px) {
    .cd-ar-prod__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 620px) {
    .cd-ar-prod__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-ar-prod__card { padding: 26px 22px; }
    .cd-ar-prod__closer { padding: 22px 20px; }
  }
</style>
<div class="cd-ar-prod">
  <p class="cd-ar-prod__intro" data-field="intro">{{intro}}</p>
  <div class="cd-ar-prod__grid">
    <div class="cd-ar-prod__card">
      <div class="cd-ar-prod__icon"><span class="material-icons" data-field="icon1">{{icon1}}</span></div>
      <h3 class="cd-ar-prod__card-title" data-field="card1Title">{{card1Title}}</h3>
      <p class="cd-ar-prod__card-desc" data-field="card1Desc">{{card1Desc}}</p>
    </div>
    <div class="cd-ar-prod__card">
      <div class="cd-ar-prod__icon"><span class="material-icons" data-field="icon2">{{icon2}}</span></div>
      <h3 class="cd-ar-prod__card-title" data-field="card2Title">{{card2Title}}</h3>
      <p class="cd-ar-prod__card-desc" data-field="card2Desc">{{card2Desc}}</p>
    </div>
    <div class="cd-ar-prod__card">
      <div class="cd-ar-prod__icon"><span class="material-icons" data-field="icon3">{{icon3}}</span></div>
      <h3 class="cd-ar-prod__card-title" data-field="card3Title">{{card3Title}}</h3>
      <p class="cd-ar-prod__card-desc" data-field="card3Desc">{{card3Desc}}</p>
    </div>
  </div>
  <div class="cd-ar-prod__closer">
    <p class="cd-ar-prod__closer-text" data-field="closer">{{closer}}</p>
  </div>
</div>
`.trim();

const PRODUCTS_DEFAULTS = {
  intro:
    "You’ve done the legwork to make sure you can hang with the best in the business — now choose the funding product that fits how and when your shop spends and earns. Cardiff offers three core options so you can stop worrying about how to pay for new equipment and personnel, and focus on making the most of them.",
  icon1: 'bolt',
  card1Title: 'Short-Term Loans',
  card1Desc:
    'Ideal for rapid growth and short-term cash flow needs for expansion. A fast lump sum you can deploy now and pay back on a tight schedule as the revenue comes in.',
  icon2: 'sync_alt',
  card2Title: 'Business Line of Credit',
  card2Desc:
    'If you face recurring cash flow problems due to delays in payment or seasonal funding issues, a revolving line of credit gives you on-demand access without re-applying.',
  icon3: 'account_balance',
  card3Title: 'Small Business Administration Loans',
  card3Desc:
    'If you’re not in a hurry for financing and you’re looking for a longer repayment term, an SBA loan can pair lower payments with capital sized for a multi-year plan.',
  closer:
    'Not sure which product fits? A Cardiff loan advisor will match your goal — working capital, equipment, or long-term expansion — to the right structure in one short call.',
} as const;

const productsBlock = {
  id: 'sec-3-products',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: PRODUCTS_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: PRODUCTS_DEFAULTS.intro },
    { name: 'icon1', label: 'Card 1 — icon', type: 'text', default: PRODUCTS_DEFAULTS.icon1 },
    { name: 'card1Title', label: 'Card 1 — title', type: 'text', default: PRODUCTS_DEFAULTS.card1Title },
    { name: 'card1Desc', label: 'Card 1 — description', type: 'textarea', default: PRODUCTS_DEFAULTS.card1Desc },
    { name: 'icon2', label: 'Card 2 — icon', type: 'text', default: PRODUCTS_DEFAULTS.icon2 },
    { name: 'card2Title', label: 'Card 2 — title', type: 'text', default: PRODUCTS_DEFAULTS.card2Title },
    { name: 'card2Desc', label: 'Card 2 — description', type: 'textarea', default: PRODUCTS_DEFAULTS.card2Desc },
    { name: 'icon3', label: 'Card 3 — icon', type: 'text', default: PRODUCTS_DEFAULTS.icon3 },
    { name: 'card3Title', label: 'Card 3 — title', type: 'text', default: PRODUCTS_DEFAULTS.card3Title },
    { name: 'card3Desc', label: 'Card 3 — description', type: 'textarea', default: PRODUCTS_DEFAULTS.card3Desc },
    { name: 'closer', label: 'Closing summary', type: 'textarea', default: PRODUCTS_DEFAULTS.closer },
  ],
  values: { ...PRODUCTS_DEFAULTS },
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

  sec.maxWidth = '1200px';
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
    content: 'How Auto Repair Loans Can Grow Your Business',
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
    content:
      '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  sec.blocks = [headerBlock, dividerBlock, productsBlock];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-3 -> styled 3-card "How Auto Repair Loans Can Grow Your Business" grid.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
