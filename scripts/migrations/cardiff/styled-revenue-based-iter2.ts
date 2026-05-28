/**
 * Iter 2 (post 828, revenue-based-business-loans): Restyle sec-5,
 * "What to Expect When Applying for a Revenue-Based Loan."
 *
 * In iter 1 we rebuilt the hero. sec-5 is now the worst-looking section
 * below the fold: a 4-step process where 3 of the 4 H3 headings lost
 * their body paragraphs during migration, leaving a stack of orphan
 * subheads with no copy at all. (Reads like a TOC, not a section.)
 *
 * Replace sec-5 sub-blocks with:
 *   1. Centered H2 + orange underline (matches iter-1 / equipment iter-3)
 *   2. A single html-render block carrying a 4-up numbered "step" card
 *      grid on a soft blue-tinted background. Body copy is restored from
 *      cardiff.co's published page.
 *
 * Layout: 2x2 on desktop, stacks on mobile. Each card has a big circular
 * step number, title, and copy. Brand palette only — deep blue
 * (#1c3370 / #25418b), green (#5ac96f), orange (#ef6632) accents.
 *
 * Idempotent: rewrites sec-5 in place on every run (always sets the same
 * 3 sub-blocks: header, divider, html-render).
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 828;
const TARGET_BLOCK_ID = 'sec-5';

const STEPS_HTML = `
<style>
  .cd-rb-steps { max-width: 1140px; margin: 0 auto; }
  .cd-rb-steps__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 760px; margin: 0 auto 48px auto; }
  .cd-rb-steps__grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; }
  .cd-rb-steps__card { position: relative; background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 32px 30px 30px 30px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-rb-steps__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-rb-steps__num { width: 56px; height: 56px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 800; font-size: 1.35rem; letter-spacing: -0.01em; }
  .cd-rb-steps__card:nth-child(2) .cd-rb-steps__num { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-rb-steps__card:nth-child(3) .cd-rb-steps__num { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-rb-steps__card:nth-child(4) .cd-rb-steps__num { background: linear-gradient(135deg, #ffb798 0%, #ef6632 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.24); }
  .cd-rb-steps__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.25rem; font-weight: 800; color: #1c3370; margin: 0 0 12px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-rb-steps__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.975rem; line-height: 1.7; color: #525f7f; margin: 0; }
  .cd-rb-steps__closer { margin: 48px auto 0 auto; max-width: 820px; text-align: center; padding: 28px 32px; background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(90,201,111,0.06) 100%); border-radius: 12px; border: 1px solid #e6ecf5; }
  .cd-rb-steps__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #25418b; margin: 0; font-weight: 500; }
  @media (max-width: 760px) {
    .cd-rb-steps__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-rb-steps__card { padding: 26px 22px; }
    .cd-rb-steps__closer { padding: 22px 20px; }
  }
</style>
<div class="cd-rb-steps">
  <p class="cd-rb-steps__intro" data-field="intro">{{intro}}</p>
  <div class="cd-rb-steps__grid">
    <div class="cd-rb-steps__card">
      <div class="cd-rb-steps__num" data-field="num1">{{num1}}</div>
      <h3 class="cd-rb-steps__card-title" data-field="card1Title">{{card1Title}}</h3>
      <p class="cd-rb-steps__card-desc" data-field="card1Desc">{{card1Desc}}</p>
    </div>
    <div class="cd-rb-steps__card">
      <div class="cd-rb-steps__num" data-field="num2">{{num2}}</div>
      <h3 class="cd-rb-steps__card-title" data-field="card2Title">{{card2Title}}</h3>
      <p class="cd-rb-steps__card-desc" data-field="card2Desc">{{card2Desc}}</p>
    </div>
    <div class="cd-rb-steps__card">
      <div class="cd-rb-steps__num" data-field="num3">{{num3}}</div>
      <h3 class="cd-rb-steps__card-title" data-field="card3Title">{{card3Title}}</h3>
      <p class="cd-rb-steps__card-desc" data-field="card3Desc">{{card3Desc}}</p>
    </div>
    <div class="cd-rb-steps__card">
      <div class="cd-rb-steps__num" data-field="num4">{{num4}}</div>
      <h3 class="cd-rb-steps__card-title" data-field="card4Title">{{card4Title}}</h3>
      <p class="cd-rb-steps__card-desc" data-field="card4Desc">{{card4Desc}}</p>
    </div>
  </div>
  <div class="cd-rb-steps__closer">
    <p class="cd-rb-steps__closer-text" data-field="closer">{{closer}}</p>
  </div>
</div>
`.trim();

const STEPS_DEFAULTS = {
  intro: "Applying for a revenue-based loan with Cardiff is fast, straightforward, and built around the realities of running a small business. Here's what to expect at every step.",
  num1: '1',
  card1Title: 'Application Process',
  card1Desc: 'Our application requires only basic information about you and your business — revenue history, business bank statements (often connected securely through Plaid), and your most recent tax return. No mountains of paperwork.',
  num2: '2',
  card2Title: 'Loan Amount and Terms',
  card2Desc: 'Approved amounts are based on your monthly revenue and cash flow, not just credit score. Terms are sized to what your business can comfortably service so repayment never strains operations.',
  num3: '3',
  card3Title: 'Flexible Repayment',
  card3Desc: 'Repayments scale with your daily or weekly revenue, so you pay more in strong periods and less when things slow down. Your cash flow stays predictable through every season.',
  num4: '4',
  card4Title: 'Fast Access to Capital',
  card4Desc: 'Most applicants receive a same-day decision, with funds typically deposited within 24-72 hours of approval. When opportunity (or an unexpected expense) shows up, you have working capital ready.',
  closer: 'From application to funded — usually in days, not weeks — so you can focus on running and growing your business.',
} as const;

const stepsBlock = {
  id: 'sec-5-steps',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: STEPS_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: STEPS_DEFAULTS.intro },
    { name: 'num1', label: 'Step 1 — number', type: 'text', default: STEPS_DEFAULTS.num1 },
    { name: 'card1Title', label: 'Step 1 — title', type: 'text', default: STEPS_DEFAULTS.card1Title },
    { name: 'card1Desc', label: 'Step 1 — description', type: 'textarea', default: STEPS_DEFAULTS.card1Desc },
    { name: 'num2', label: 'Step 2 — number', type: 'text', default: STEPS_DEFAULTS.num2 },
    { name: 'card2Title', label: 'Step 2 — title', type: 'text', default: STEPS_DEFAULTS.card2Title },
    { name: 'card2Desc', label: 'Step 2 — description', type: 'textarea', default: STEPS_DEFAULTS.card2Desc },
    { name: 'num3', label: 'Step 3 — number', type: 'text', default: STEPS_DEFAULTS.num3 },
    { name: 'card3Title', label: 'Step 3 — title', type: 'text', default: STEPS_DEFAULTS.card3Title },
    { name: 'card3Desc', label: 'Step 3 — description', type: 'textarea', default: STEPS_DEFAULTS.card3Desc },
    { name: 'num4', label: 'Step 4 — number', type: 'text', default: STEPS_DEFAULTS.num4 },
    { name: 'card4Title', label: 'Step 4 — title', type: 'text', default: STEPS_DEFAULTS.card4Title },
    { name: 'card4Desc', label: 'Step 4 — description', type: 'textarea', default: STEPS_DEFAULTS.card4Desc },
    { name: 'closer', label: 'Closing summary', type: 'textarea', default: STEPS_DEFAULTS.closer },
  ],
  values: { ...STEPS_DEFAULTS },
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

  // Widen so the 2-col card grid breathes.
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
    id: 'sec-5-title',
    order: 1,
    level: 2,
    content: 'What to Expect When Applying for a Revenue-Based Loan',
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
  sec.blocks = [headerBlock, dividerBlock, stepsBlock];

  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-5 -> styled 4-step "What to Expect" grid.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
