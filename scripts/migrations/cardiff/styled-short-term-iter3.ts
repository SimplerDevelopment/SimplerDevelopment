/**
 * Iter 3 (post 830 — short-term-working-capital-loans):
 * Restyle sec-2 "What Makes Cardiff Term Loans Different?".
 *
 * Source state: a centered H2 plus a long stack of 5 H3+paragraph pairs
 * with two short lead-in paragraphs above. Visually flat — same problem
 * the equipment-leasing iter3 reference solved on post 802 sec-8.
 *
 * Restyle: keep the H2 + orange divider as native blocks, then collapse
 * the intro lead-in + the 5 features into one html-render block backed
 * by a `features` array (data-repeat) so the editor can add/remove
 * features without script changes. Cards use brand palette only
 * (#1c3370 / #25418b / #5ac96f / #ef6632), Raleway titles, Open Sans
 * body, Material Icons (no emojis).
 *
 * Idempotent: detects existing `sec-2-features` html-render block and
 * rewrites it in place; otherwise replaces sec-2 children with header
 * + divider + features block. Safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 830;
const TARGET_BLOCK_ID = 'sec-2';
const FEATURES_BLOCK_ID = 'sec-2-features';

const FEATURES_HTML = `
<style>
  .cd-st-feat { max-width: 1140px; margin: 0 auto; }
  .cd-st-feat__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 760px; margin: 0 auto 48px auto; }
  .cd-st-feat__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-st-feat__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 32px 28px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-st-feat__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-st-feat__icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-st-feat__card:nth-child(2) .cd-st-feat__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-st-feat__card:nth-child(4) .cd-st-feat__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-st-feat__icon .material-icons { font-size: 30px; }
  .cd-st-feat__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.25rem; font-weight: 800; color: #1c3370; margin: 0 0 12px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-st-feat__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.975rem; line-height: 1.7; color: #525f7f; margin: 0; }
  .cd-st-feat__cue { margin: 48px auto 0 auto; max-width: 820px; text-align: center; padding: 22px 28px; background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(239,102,50,0.06) 100%); border-radius: 12px; border: 1px solid #e6ecf5; }
  .cd-st-feat__cue-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #25418b; margin: 0; font-weight: 500; }
  @media (max-width: 980px) {
    .cd-st-feat__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 620px) {
    .cd-st-feat__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-st-feat__card { padding: 26px 22px; }
    .cd-st-feat__cue { padding: 20px 18px; }
  }
</style>
<div class="cd-st-feat">
  <p class="cd-st-feat__intro" data-field="intro">{{intro}}</p>
  <div class="cd-st-feat__grid">
    <div class="cd-st-feat__card" data-repeat="features">
      <div class="cd-st-feat__icon"><span class="material-icons">{{features.icon}}</span></div>
      <h3 class="cd-st-feat__card-title">{{features.title}}</h3>
      <p class="cd-st-feat__card-desc">{{features.desc}}</p>
    </div>
  </div>
  <div class="cd-st-feat__cue">
    <p class="cd-st-feat__cue-text" data-field="cue">{{cue}}</p>
  </div>
</div>
`.trim();

const INTRO_DEFAULT =
  "Many business lenders offer funding products with rigid requirements that don’t fit many small businesses. Their applications are long, approvals are slow, and the repayment terms are one-size-fits-all. At Cardiff, we know your time is valuable and your business isn’t generic — that’s why we built short-term funding options that work for businesses at various stages of growth.";

const CUE_DEFAULT = "Here’s how our term loan aligns with your unique needs.";

const FEATURES_DEFAULT = [
  {
    icon: 'bolt',
    title: 'Fast Funding When You Need It Most',
    desc: "At Cardiff, you don’t have weeks to wait for your loan approval. Our streamlined application process allows you to get a business loan quickly, often with same-day decisions and funding.",
  },
  {
    icon: 'schedule',
    title: 'Designed for Short-Term Needs',
    desc: "Whether you’re preparing for a seasonal surge or stabilizing from a dip, the structure of our short-term business loans aligns with your revenue cycles. We don’t lock you into lengthy obligations that outlast your need.",
  },
  {
    icon: 'tune',
    title: 'Flexible Use of Funds',
    desc: 'You stay in control. Use the funds for working capital, inventory, payroll, renovations, or even to fund growth opportunities. Our financing works across industries, from retail to restaurants, and contractors to clinics.',
  },
  {
    icon: 'visibility',
    title: 'Transparent Terms',
    desc: "We clearly outline the terms of every Cardiff loan. There are no hidden surprises in the fine print or shrouded in industry jargon. You’ll always know the total cost and repayment schedule before you sign.",
  },
  {
    icon: 'handshake',
    title: 'Fair Repayment',
    desc: 'Financially responsible decisions should never come with a penalty. Cardiff provides interest-free early payoff options for qualified businesses, so you can clear your loan when the timing is right.',
  },
];

const featuresBlock = {
  id: FEATURES_BLOCK_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: FEATURES_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: INTRO_DEFAULT },
    {
      name: 'features',
      label: 'Feature cards',
      type: 'array',
      itemFields: [
        { name: 'icon', label: 'Material icon name', type: 'text' },
        { name: 'title', label: 'Card title', type: 'text' },
        { name: 'desc', label: 'Card description', type: 'textarea' },
      ],
    },
    { name: 'cue', label: 'Closing cue line', type: 'textarea', default: CUE_DEFAULT },
  ],
  values: {
    intro: INTRO_DEFAULT,
    features: FEATURES_DEFAULT,
    cue: CUE_DEFAULT,
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
    id: 'sec-2-title',
    order: 1,
    level: 2,
    content: 'What Makes Cardiff Term Loans Different?',
    alignment: 'center' as const,
    style: {
      color: '#1c3370',
      fontFamily: 'Raleway, -apple-system, BlinkMacSystemFont, sans-serif',
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
    content:
      '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };

  // Preserve existing values if a features block already exists (idempotent edits).
  const existing = (sec.blocks || []).find((b: any) => b?.id === FEATURES_BLOCK_ID);
  const nextFeaturesBlock = existing
    ? { ...featuresBlock, values: { ...featuresBlock.values, ...(existing.values || {}) } }
    : featuresBlock;

  sec.blocks = [headerBlock, dividerBlock, nextFeaturesBlock];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-2 -> styled 5-card "What Makes Cardiff Term Loans Different?" grid.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
