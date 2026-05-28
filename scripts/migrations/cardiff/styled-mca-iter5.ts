/**
 * Merchant Cash Advance page (post 824) — iter5.
 *
 * Biggest remaining unstyled section: sec-6 "What Is a Merchant Cash Advance?"
 * — 5 bare children (H2 + divider + 3 explainer paragraphs, ~2120 chars).
 * Currently a flat text wall describing (1) what an MCA is + automatic
 * repayment, (2) flexible fixed daily/weekly/monthly repayment schedules,
 * (3) Cardiff's same-day funding application speed.
 *
 * The three paragraphs naturally map to three distinct ideas — definition,
 * flexibility, speed — so we rewrite sec-6.blocks to:
 *   1. Centered H2 + orange underline (same pattern as iter2/iter3/iter4)
 *   2. A single html-render block carrying an intro paragraph + a 3-up icon
 *      card grid (one card per concept) on a light blue-tinted backdrop +
 *      a closing reassurance line.
 *
 * Layout: 3-col grid on desktop (1140px container), stacks to 1-col at 720px.
 * Each card has a circular gradient icon chip (Material Icons), title, and
 * copy. Brand palette: #1c3370 / #25418b deep blue, #5ac96f green,
 * #ef6632 orange, #ffb798 peach — no emojis (Material Icons only).
 * Fonts: Raleway (headings) + Open Sans (body).
 *
 * Field convention: bare {{field}} (NOT inside a data-repeat loop), matching
 * the iter3/iter4 template pattern.
 *
 * Idempotent: re-running detects an existing `sec-6-define` html-render child
 * block and refreshes html/values; if missing, replaces sec-6.blocks wholesale
 * (section type asserted).
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 824;
const TARGET_BLOCK_ID = 'sec-6';

const DEFINE_HTML = `
<style>
  .cd-mca-def { max-width: 1140px; margin: 0 auto; }
  .cd-mca-def__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 820px; margin: 0 auto 48px auto; }
  .cd-mca-def__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-mca-def__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 14px; padding: 34px 28px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-mca-def__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-mca-def__icon { width: 60px; height: 60px; border-radius: 16px; display: flex; align-items: center; justify-content: center; margin: 0 0 22px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-mca-def__card:nth-child(2) .cd-mca-def__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-mca-def__card:nth-child(3) .cd-mca-def__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-mca-def__icon .material-icons { font-size: 32px; }
  .cd-mca-def__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.25rem; font-weight: 800; color: #1c3370; margin: 0 0 14px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-mca-def__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.975rem; line-height: 1.7; color: #525f7f; margin: 0; }
  .cd-mca-def__closer { margin: 48px auto 0 auto; max-width: 860px; text-align: center; padding: 28px 32px; background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(239,102,50,0.06) 100%); border-radius: 12px; border: 1px solid #e6ecf5; }
  .cd-mca-def__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #25418b; margin: 0; font-weight: 500; }
  @media (max-width: 980px) {
    .cd-mca-def__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 720px) {
    .cd-mca-def__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-mca-def__card { padding: 28px 22px; }
    .cd-mca-def__closer { padding: 22px 20px; }
  }
</style>
<div class="cd-mca-def">
  <p class="cd-mca-def__intro" data-field="intro">{{intro}}</p>
  <div class="cd-mca-def__grid">
    <div class="cd-mca-def__card">
      <div class="cd-mca-def__icon"><span class="material-icons" data-field="icon1">{{icon1}}</span></div>
      <h3 class="cd-mca-def__card-title" data-field="card1Title">{{card1Title}}</h3>
      <p class="cd-mca-def__card-desc" data-field="card1Desc">{{card1Desc}}</p>
    </div>
    <div class="cd-mca-def__card">
      <div class="cd-mca-def__icon"><span class="material-icons" data-field="icon2">{{icon2}}</span></div>
      <h3 class="cd-mca-def__card-title" data-field="card2Title">{{card2Title}}</h3>
      <p class="cd-mca-def__card-desc" data-field="card2Desc">{{card2Desc}}</p>
    </div>
    <div class="cd-mca-def__card">
      <div class="cd-mca-def__icon"><span class="material-icons" data-field="icon3">{{icon3}}</span></div>
      <h3 class="cd-mca-def__card-title" data-field="card3Title">{{card3Title}}</h3>
      <p class="cd-mca-def__card-desc" data-field="card3Desc">{{card3Desc}}</p>
    </div>
  </div>
  <div class="cd-mca-def__closer">
    <p class="cd-mca-def__closer-text" data-field="closerNote">{{closerNote}}</p>
  </div>
</div>
`.trim();

const DEFINE_DEFAULTS = {
  intro: "A merchant cash advance is a flexible form of business financing that advances you a lump sum of capital in exchange for a portion of your future credit card earnings or daily sales receipts — built to move at the pace of your business.",
  icon1: 'account_balance_wallet',
  card1Title: 'Lump Sum, Paid From Sales',
  card1Desc: 'You receive a fixed amount of capital up front and repay it through a small portion of your future credit card earnings or daily sales — deducted automatically so you never miss a payment.',
  icon2: 'tune',
  card2Title: 'Repayment That Flexes',
  card2Desc: 'MCA repayment can also take the form of fixed daily, weekly, or monthly payments. Cardiff can tune the schedule so financing fits the rhythm of your revenue cycle, not the other way around.',
  icon3: 'bolt',
  card3Title: 'Same-Day Funding Speed',
  card3Desc: 'With Cardiff’s streamlined online application, you can apply for a merchant cash advance and potentially receive same-day funding — one of the fastest funding options available when you need to move quickly.',
  closerNote: 'When payments adjust with your cash flow, you don’t have to worry about costly payments during a lull in your business’s variable revenue cycles.',
} as const;

const defineBlock = {
  id: 'sec-6-define',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: DEFINE_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: DEFINE_DEFAULTS.intro },
    { name: 'icon1', label: 'Card 1 — icon', type: 'text', default: DEFINE_DEFAULTS.icon1 },
    { name: 'card1Title', label: 'Card 1 — title', type: 'text', default: DEFINE_DEFAULTS.card1Title },
    { name: 'card1Desc', label: 'Card 1 — description', type: 'textarea', default: DEFINE_DEFAULTS.card1Desc },
    { name: 'icon2', label: 'Card 2 — icon', type: 'text', default: DEFINE_DEFAULTS.icon2 },
    { name: 'card2Title', label: 'Card 2 — title', type: 'text', default: DEFINE_DEFAULTS.card2Title },
    { name: 'card2Desc', label: 'Card 2 — description', type: 'textarea', default: DEFINE_DEFAULTS.card2Desc },
    { name: 'icon3', label: 'Card 3 — icon', type: 'text', default: DEFINE_DEFAULTS.icon3 },
    { name: 'card3Title', label: 'Card 3 — title', type: 'text', default: DEFINE_DEFAULTS.card3Title },
    { name: 'card3Desc', label: 'Card 3 — description', type: 'textarea', default: DEFINE_DEFAULTS.card3Desc },
    { name: 'closerNote', label: 'Closer reassurance line', type: 'textarea', default: DEFINE_DEFAULTS.closerNote },
  ],
  values: { ...DEFINE_DEFAULTS },
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
    content: 'What Is a Merchant Cash Advance?',
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
    content: '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  sec.blocks = [headerBlock, dividerBlock, defineBlock];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-6 -> styled 3-card "What Is an MCA?" grid (${parsed.blocks.length} top-level blocks).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
