/**
 * Iter 5: Restyle "Business Loans Designed for Small Business Owners"
 * (sec-5) on post 800 (business-loans). Currently 5 bare text paragraphs
 * stacked in a narrow centered wash — visually identical to sec-4/sec-6
 * and creates the long unscannable block users complained about.
 *
 * The source paragraphs already cluster into four distinct themes:
 *   1. Streamlined lending built for SMB pace
 *   2. Fast approvals / same-day funding
 *   3. Short online application / no paperwork mountain
 *   4. Flexible repayment aligned to revenue cycles
 * Final paragraph is the summary closer.
 *
 * We replace the 5 paragraph sub-blocks with:
 *   - centered H2 + orange underline (existing pattern)
 *   - one html-render: intro line + 4-up icon-card grid + closer band
 *
 * Idempotent: re-running detects existing html-render block at id
 *   `sec-5-features` and rewrites it; safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 800;
const TARGET_BLOCK_ID = 'sec-5';

const FEATURES_HTML = `
<style>
  .cd-bl-feat { max-width: 1140px; margin: 0 auto; }
  .cd-bl-feat__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 760px; margin: 0 auto 48px auto; }
  .cd-bl-feat__grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; }
  .cd-bl-feat__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 32px 28px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-bl-feat__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-bl-feat__icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-bl-feat__card:nth-child(2) .cd-bl-feat__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-bl-feat__card:nth-child(3) .cd-bl-feat__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-bl-feat__card:nth-child(4) .cd-bl-feat__icon { background: linear-gradient(135deg, #ffb798 0%, #ef6632 100%); box-shadow: 0 8px 18px rgba(255,183,152,0.32); }
  .cd-bl-feat__icon .material-icons { font-size: 30px; }
  .cd-bl-feat__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.25rem; font-weight: 800; color: #1c3370; margin: 0 0 12px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-bl-feat__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.975rem; line-height: 1.7; color: #525f7f; margin: 0; }
  .cd-bl-feat__closer { margin: 48px auto 0 auto; max-width: 820px; text-align: center; padding: 28px 32px; background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(239,102,50,0.06) 100%); border-radius: 12px; border: 1px solid #e6ecf5; }
  .cd-bl-feat__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #25418b; margin: 0; font-weight: 500; }
  @media (max-width: 820px) {
    .cd-bl-feat__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-bl-feat__card { padding: 26px 22px; }
    .cd-bl-feat__closer { padding: 22px 20px; }
  }
</style>
<div class="cd-bl-feat">
  <p class="cd-bl-feat__intro" data-field="intro">{{intro}}</p>
  <div class="cd-bl-feat__grid">
    <div class="cd-bl-feat__card">
      <div class="cd-bl-feat__icon"><span class="material-icons" data-field="icon1">{{icon1}}</span></div>
      <h3 class="cd-bl-feat__card-title" data-field="card1Title">{{card1Title}}</h3>
      <p class="cd-bl-feat__card-desc" data-field="card1Desc">{{card1Desc}}</p>
    </div>
    <div class="cd-bl-feat__card">
      <div class="cd-bl-feat__icon"><span class="material-icons" data-field="icon2">{{icon2}}</span></div>
      <h3 class="cd-bl-feat__card-title" data-field="card2Title">{{card2Title}}</h3>
      <p class="cd-bl-feat__card-desc" data-field="card2Desc">{{card2Desc}}</p>
    </div>
    <div class="cd-bl-feat__card">
      <div class="cd-bl-feat__icon"><span class="material-icons" data-field="icon3">{{icon3}}</span></div>
      <h3 class="cd-bl-feat__card-title" data-field="card3Title">{{card3Title}}</h3>
      <p class="cd-bl-feat__card-desc" data-field="card3Desc">{{card3Desc}}</p>
    </div>
    <div class="cd-bl-feat__card">
      <div class="cd-bl-feat__icon"><span class="material-icons" data-field="icon4">{{icon4}}</span></div>
      <h3 class="cd-bl-feat__card-title" data-field="card4Title">{{card4Title}}</h3>
      <p class="cd-bl-feat__card-desc" data-field="card4Desc">{{card4Desc}}</p>
    </div>
  </div>
  <div class="cd-bl-feat__closer">
    <p class="cd-bl-feat__closer-text" data-field="closer">{{closer}}</p>
  </div>
</div>
`.trim();

const FEATURES_DEFAULTS = {
  intro: "As a small business owner, you’ve got enough on your plate. Cardiff offers streamlined, straightforward lending options that don’t slow you down — whether you’re expanding your space, hiring staff, or covering seasonal dips in cash flow.",
  icon1: 'rocket_launch',
  card1Title: 'Built for Small Business Pace',
  card1Desc: 'Our small business loans are built to keep you moving forward — expansion, payroll, inventory, or bridging a quiet stretch. Lending that matches the speed your business actually runs at.',
  icon2: 'bolt',
  card2Title: 'Fast Approvals, Same-Day Funding',
  card2Desc: 'Want to outpace the competition, expand, or order inventory before tourist season? Our dedication to fast approvals means a decision in hours, not weeks — with same-day funding available.',
  icon3: 'edit_document',
  card3Title: 'Short Online Application',
  card3Desc: 'No mountain of paperwork required. Our online form is quick and easy to fill out. We’ll need basic information about you and your business, and we’ll streamline everything else so you can get back to running it.',
  icon4: 'tune',
  card4Title: 'Flexible Repayment Options',
  card4Desc: 'Does your revenue wax and wane seasonally? Common for small businesses. We offer repayment structures that align with your revenue cycles — pay more when business is booming, less during the off-season.',
  closer: 'At Cardiff, our goal is to provide business loans for small businesses that remove friction and fuel momentum.',
} as const;

const featuresBlock = {
  id: 'sec-5-features',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: FEATURES_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: FEATURES_DEFAULTS.intro },
    { name: 'icon1', label: 'Card 1 — icon', type: 'text', default: FEATURES_DEFAULTS.icon1 },
    { name: 'card1Title', label: 'Card 1 — title', type: 'text', default: FEATURES_DEFAULTS.card1Title },
    { name: 'card1Desc', label: 'Card 1 — description', type: 'textarea', default: FEATURES_DEFAULTS.card1Desc },
    { name: 'icon2', label: 'Card 2 — icon', type: 'text', default: FEATURES_DEFAULTS.icon2 },
    { name: 'card2Title', label: 'Card 2 — title', type: 'text', default: FEATURES_DEFAULTS.card2Title },
    { name: 'card2Desc', label: 'Card 2 — description', type: 'textarea', default: FEATURES_DEFAULTS.card2Desc },
    { name: 'icon3', label: 'Card 3 — icon', type: 'text', default: FEATURES_DEFAULTS.icon3 },
    { name: 'card3Title', label: 'Card 3 — title', type: 'text', default: FEATURES_DEFAULTS.card3Title },
    { name: 'card3Desc', label: 'Card 3 — description', type: 'textarea', default: FEATURES_DEFAULTS.card3Desc },
    { name: 'icon4', label: 'Card 4 — icon', type: 'text', default: FEATURES_DEFAULTS.icon4 },
    { name: 'card4Title', label: 'Card 4 — title', type: 'text', default: FEATURES_DEFAULTS.card4Title },
    { name: 'card4Desc', label: 'Card 4 — description', type: 'textarea', default: FEATURES_DEFAULTS.card4Desc },
    { name: 'closer', label: 'Closing summary', type: 'textarea', default: FEATURES_DEFAULTS.closer },
  ],
  values: { ...FEATURES_DEFAULTS },
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

  // Widen so the 2-col card grid breathes; tint background to set apart.
  sec.maxWidth = '1200px';
  sec.style = {
    ...(sec.style || {}),
    backgroundColor: '#ffffff',
    paddingTop: '80px',
    paddingBottom: '80px',
    paddingLeft: '24px',
    paddingRight: '24px',
  };

  const headerBlock = {
    type: 'heading' as const,
    id: 'sec-5-title',
    order: 1,
    level: 2,
    content: 'Business Loans Designed for Small Business Owners',
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
    id: 'sec-5-div',
    order: 2,
    content: '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  sec.blocks = [headerBlock, dividerBlock, featuresBlock];

  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-5 -> styled 4-card "Designed for Small Business Owners" grid.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
