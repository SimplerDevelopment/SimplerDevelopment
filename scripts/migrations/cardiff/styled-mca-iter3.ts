/**
 * Merchant Cash Advance page (post 824) — iter3.
 *
 * Biggest remaining unstyled section: sec-8 "Key Benefits of Cardiff's
 * Business Cash Advance Options" — a long stack of 4 H3 + paragraph pairs
 * (Same-Day Decisions / No Collateral / High Approval Rates / Custom
 * Repayment) wrapped by an intro and a closer. cardiff.co presents these as
 * a visually distinct benefits band; our port renders them as a flat text
 * column with no chrome.
 *
 * This rewrites sec-8 sub-blocks with:
 *   1. Centered H2 + orange underline (same pattern as iter2 / equipment iter3)
 *   2. A single html-render block carrying a 4-up icon card grid on a light
 *      blue-tinted backdrop, with a closing summary line.
 *
 * Layout: 4-col grid on desktop (1140px container), 2-col at 980px, 1-col at
 * 620px. Each card has a circular gradient icon chip (Material Icons), title,
 * and copy. Brand palette: deep blue (#1c3370 / #25418b), green (#5ac96f),
 * orange (#ef6632) — no emojis (Material Icons only).
 *
 * Field convention: this html-render uses bare {{field}} (NOT inside a
 * data-repeat loop), so unnamespaced fields resolve correctly.
 *
 * Idempotent: re-running detects the existing `sec-8-benefits` html-render
 * child block and refreshes html/values; if missing, replaces sec-8.blocks
 * wholesale from the original sec-8 (section type asserted).
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 824;
const TARGET_BLOCK_ID = 'sec-8';

const BENEFITS_HTML = `
<style>
  .cd-mca-benefits { max-width: 1140px; margin: 0 auto; }
  .cd-mca-benefits__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 820px; margin: 0 auto 48px auto; }
  .cd-mca-benefits__grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 22px; }
  .cd-mca-benefits__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 14px; padding: 32px 26px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-mca-benefits__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-mca-benefits__icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 20px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-mca-benefits__card:nth-child(2) .cd-mca-benefits__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-mca-benefits__card:nth-child(3) .cd-mca-benefits__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-mca-benefits__card:nth-child(4) .cd-mca-benefits__icon { background: linear-gradient(135deg, #ffb798 0%, #ef6632 100%); box-shadow: 0 8px 18px rgba(255,183,152,0.40); }
  .cd-mca-benefits__icon .material-icons { font-size: 30px; }
  .cd-mca-benefits__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.1875rem; font-weight: 800; color: #1c3370; margin: 0 0 12px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-mca-benefits__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.95rem; line-height: 1.7; color: #525f7f; margin: 0; }
  .cd-mca-benefits__closer { margin: 48px auto 0 auto; max-width: 860px; text-align: center; padding: 28px 32px; background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(239,102,50,0.06) 100%); border-radius: 12px; border: 1px solid #e6ecf5; }
  .cd-mca-benefits__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #25418b; margin: 0; font-weight: 500; }
  @media (max-width: 1100px) {
    .cd-mca-benefits__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 620px) {
    .cd-mca-benefits__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-mca-benefits__card { padding: 26px 22px; }
    .cd-mca-benefits__closer { padding: 22px 20px; }
  }
</style>
<div class="cd-mca-benefits">
  <p class="cd-mca-benefits__intro" data-field="intro">{{intro}}</p>
  <div class="cd-mca-benefits__grid">
    <div class="cd-mca-benefits__card">
      <div class="cd-mca-benefits__icon"><span class="material-icons" data-field="icon1">{{icon1}}</span></div>
      <h3 class="cd-mca-benefits__card-title" data-field="card1Title">{{card1Title}}</h3>
      <p class="cd-mca-benefits__card-desc" data-field="card1Desc">{{card1Desc}}</p>
    </div>
    <div class="cd-mca-benefits__card">
      <div class="cd-mca-benefits__icon"><span class="material-icons" data-field="icon2">{{icon2}}</span></div>
      <h3 class="cd-mca-benefits__card-title" data-field="card2Title">{{card2Title}}</h3>
      <p class="cd-mca-benefits__card-desc" data-field="card2Desc">{{card2Desc}}</p>
    </div>
    <div class="cd-mca-benefits__card">
      <div class="cd-mca-benefits__icon"><span class="material-icons" data-field="icon3">{{icon3}}</span></div>
      <h3 class="cd-mca-benefits__card-title" data-field="card3Title">{{card3Title}}</h3>
      <p class="cd-mca-benefits__card-desc" data-field="card3Desc">{{card3Desc}}</p>
    </div>
    <div class="cd-mca-benefits__card">
      <div class="cd-mca-benefits__icon"><span class="material-icons" data-field="icon4">{{icon4}}</span></div>
      <h3 class="cd-mca-benefits__card-title" data-field="card4Title">{{card4Title}}</h3>
      <p class="cd-mca-benefits__card-desc" data-field="card4Desc">{{card4Desc}}</p>
    </div>
  </div>
  <div class="cd-mca-benefits__closer">
    <p class="cd-mca-benefits__closer-text" data-field="closer">{{closer}}</p>
  </div>
</div>
`.trim();

const BENEFITS_DEFAULTS = {
  intro: "When timing is key, a merchant cash advance is always a top funding choice. However, not all lenders provide the same application and approval experience. The lender you choose can mean the difference between getting the funding you need today or not at all. When you apply for an MCA through Cardiff, you get more than fast funding:",
  icon1: 'bolt',
  card1Title: 'Same-Day Decisions and Fast Funding',
  card1Desc: 'With a simple online merchant cash advance application, you will know if Cardiff approves your loan in minutes. Many clients receive capital as fast as same day.',
  icon2: 'lock_open',
  card2Title: 'No Collateral Required',
  card2Desc: 'Cardiff’s MCAs are unsecured, meaning you don’t need to pledge an asset to secure your funding. You get the capital you need without risking your business or personal assets.',
  icon3: 'verified',
  card3Title: 'High Approval Rates',
  card3Desc: 'We work with businesses of all sizes and credit histories. If you have been in business for six months or more, can illustrate strong cash flow, and have a plan for using MCA funds, you could qualify for an MCA for a small business.',
  icon4: 'tune',
  card4Title: 'Custom Repayment',
  card4Desc: 'A consistent repayment schedule has advantages, but making the same loan payment when your business income slumps can be challenging. MCA payments are a fixed percentage of your sales. When sales are slow, your payment goes down, helping you maintain healthy cash flow.',
  closer: 'If you need a small business cash advance loan that works with your operations—not against them—Cardiff can help you move forward with confidence.',
} as const;

const benefitsBlock = {
  id: 'sec-8-benefits',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: BENEFITS_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: BENEFITS_DEFAULTS.intro },
    { name: 'icon1', label: 'Card 1 — icon', type: 'text', default: BENEFITS_DEFAULTS.icon1 },
    { name: 'card1Title', label: 'Card 1 — title', type: 'text', default: BENEFITS_DEFAULTS.card1Title },
    { name: 'card1Desc', label: 'Card 1 — description', type: 'textarea', default: BENEFITS_DEFAULTS.card1Desc },
    { name: 'icon2', label: 'Card 2 — icon', type: 'text', default: BENEFITS_DEFAULTS.icon2 },
    { name: 'card2Title', label: 'Card 2 — title', type: 'text', default: BENEFITS_DEFAULTS.card2Title },
    { name: 'card2Desc', label: 'Card 2 — description', type: 'textarea', default: BENEFITS_DEFAULTS.card2Desc },
    { name: 'icon3', label: 'Card 3 — icon', type: 'text', default: BENEFITS_DEFAULTS.icon3 },
    { name: 'card3Title', label: 'Card 3 — title', type: 'text', default: BENEFITS_DEFAULTS.card3Title },
    { name: 'card3Desc', label: 'Card 3 — description', type: 'textarea', default: BENEFITS_DEFAULTS.card3Desc },
    { name: 'icon4', label: 'Card 4 — icon', type: 'text', default: BENEFITS_DEFAULTS.icon4 },
    { name: 'card4Title', label: 'Card 4 — title', type: 'text', default: BENEFITS_DEFAULTS.card4Title },
    { name: 'card4Desc', label: 'Card 4 — description', type: 'textarea', default: BENEFITS_DEFAULTS.card4Desc },
    { name: 'closer', label: 'Closing summary', type: 'textarea', default: BENEFITS_DEFAULTS.closer },
  ],
  values: { ...BENEFITS_DEFAULTS },
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

  // Widen so the 4-col card grid breathes.
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
    id: 'sec-8-title',
    order: 1,
    level: 2,
    content: 'Key Benefits of Cardiff’s Business Cash Advance Options',
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
    id: 'sec-8-div',
    order: 2,
    content: '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  sec.blocks = [headerBlock, dividerBlock, benefitsBlock];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-8 -> styled 4-card "Key Benefits" grid (${parsed.blocks.length} top-level blocks).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
