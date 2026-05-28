/**
 * Iter 3 — business-loans (post 800).
 *
 * Replace sec-8 ("Why Choose a Cardiff Loan for Small Businesses?") — currently
 * a long stack of 7 H3 + paragraph pairs with no visual structure — with a
 * styled 7-card icon grid (3+3+1 auto-fit), intro paragraph, and closing
 * summary band. Same pattern as styled-equipment-leasing-iter3.ts.
 *
 * Idempotent: detects sec-8 by id and rewrites its sub-blocks; safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 800;
const TARGET_BLOCK_ID = 'sec-8';

const WHY_HTML = `
<style>
  .cd-bl-why { max-width: 1180px; margin: 0 auto; }
  .cd-bl-why__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 780px; margin: 0 auto 48px auto; }
  .cd-bl-why__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-bl-why__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 32px 28px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-bl-why__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-bl-why__icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-bl-why__card:nth-child(2) .cd-bl-why__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-bl-why__card:nth-child(4) .cd-bl-why__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-bl-why__card:nth-child(6) .cd-bl-why__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-bl-why__card:nth-child(7) .cd-bl-why__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-bl-why__icon .material-icons { font-size: 30px; }
  .cd-bl-why__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.25rem; font-weight: 800; color: #1c3370; margin: 0 0 12px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-bl-why__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.975rem; line-height: 1.7; color: #525f7f; margin: 0; }
  .cd-bl-why__closer { margin: 48px auto 0 auto; max-width: 860px; text-align: center; padding: 28px 32px; background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(239,102,50,0.06) 100%); border-radius: 12px; border: 1px solid #e6ecf5; }
  .cd-bl-why__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #25418b; margin: 0; font-weight: 500; }
  @media (max-width: 980px) {
    .cd-bl-why__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 620px) {
    .cd-bl-why__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-bl-why__card { padding: 26px 22px; }
    .cd-bl-why__closer { padding: 22px 20px; }
  }
</style>
<div class="cd-bl-why">
  <p class="cd-bl-why__intro" data-field="intro">{{intro}}</p>
  <div class="cd-bl-why__grid">
    <div class="cd-bl-why__card">
      <div class="cd-bl-why__icon"><span class="material-icons" data-field="icon1">{{icon1}}</span></div>
      <h3 class="cd-bl-why__card-title" data-field="card1Title">{{card1Title}}</h3>
      <p class="cd-bl-why__card-desc" data-field="card1Desc">{{card1Desc}}</p>
    </div>
    <div class="cd-bl-why__card">
      <div class="cd-bl-why__icon"><span class="material-icons" data-field="icon2">{{icon2}}</span></div>
      <h3 class="cd-bl-why__card-title" data-field="card2Title">{{card2Title}}</h3>
      <p class="cd-bl-why__card-desc" data-field="card2Desc">{{card2Desc}}</p>
    </div>
    <div class="cd-bl-why__card">
      <div class="cd-bl-why__icon"><span class="material-icons" data-field="icon3">{{icon3}}</span></div>
      <h3 class="cd-bl-why__card-title" data-field="card3Title">{{card3Title}}</h3>
      <p class="cd-bl-why__card-desc" data-field="card3Desc">{{card3Desc}}</p>
    </div>
    <div class="cd-bl-why__card">
      <div class="cd-bl-why__icon"><span class="material-icons" data-field="icon4">{{icon4}}</span></div>
      <h3 class="cd-bl-why__card-title" data-field="card4Title">{{card4Title}}</h3>
      <p class="cd-bl-why__card-desc" data-field="card4Desc">{{card4Desc}}</p>
    </div>
    <div class="cd-bl-why__card">
      <div class="cd-bl-why__icon"><span class="material-icons" data-field="icon5">{{icon5}}</span></div>
      <h3 class="cd-bl-why__card-title" data-field="card5Title">{{card5Title}}</h3>
      <p class="cd-bl-why__card-desc" data-field="card5Desc">{{card5Desc}}</p>
    </div>
    <div class="cd-bl-why__card">
      <div class="cd-bl-why__icon"><span class="material-icons" data-field="icon6">{{icon6}}</span></div>
      <h3 class="cd-bl-why__card-title" data-field="card6Title">{{card6Title}}</h3>
      <p class="cd-bl-why__card-desc" data-field="card6Desc">{{card6Desc}}</p>
    </div>
    <div class="cd-bl-why__card">
      <div class="cd-bl-why__icon"><span class="material-icons" data-field="icon7">{{icon7}}</span></div>
      <h3 class="cd-bl-why__card-title" data-field="card7Title">{{card7Title}}</h3>
      <p class="cd-bl-why__card-desc" data-field="card7Desc">{{card7Desc}}</p>
    </div>
  </div>
  <div class="cd-bl-why__closer">
    <p class="cd-bl-why__closer-text" data-field="closer">{{closer}}</p>
  </div>
</div>
`.trim();

const WHY_DEFAULTS = {
  intro: "Cardiff is not just in the business of lending money. It’s in the business of helping small businesses grow. That means:",
  icon1: 'thumb_up',
  card1Title: 'No Unnecessary Rejections',
  card1Desc: 'We assess your real potential, not just your credit. At Cardiff, a low credit score isn’t an automatic dealbreaker because a number doesn’t define your ability to succeed. We take a broader view, looking at your revenue, time in business, and cash flow to see what’s possible.',
  icon2: 'bolt',
  card2Title: 'No Long Waits',
  card2Desc: 'You get a fast decision so you can act now. When opportunities (or emergencies) hit, you don’t have time to chase paperwork or wait weeks for approval. Cardiff’s application is streamlined and digital — it takes just minutes, and you’ll typically receive a funding decision as fast as same day.',
  icon3: 'tune',
  card3Title: 'No Rigid Terms',
  card3Desc: 'Every business has its own rhythm. Whether your revenue is seasonal, project-based, or steady month to month, Cardiff offers repayment options that align with your cash flow, not the other way around.',
  icon4: 'support_agent',
  card4Title: 'Personalized Support',
  card4Desc: 'Our team knows small businesses. When you reach out, you’ll talk to a real person who understands your industry, listens to your goals, and helps you find the right financing solution.',
  icon5: 'autorenew',
  card5Title: 'Ongoing Access to Capital',
  card5Desc: 'With revolving credit options, the funds you repay become available again. That means you can reuse your line of credit to cover payroll, buy equipment, or take advantage of growth opportunities without having to reapply from scratch each time.',
  icon6: 'visibility',
  card6Title: 'Transparent Terms',
  card6Desc: 'We believe funding should fuel momentum, not create confusion. Cardiff keeps business loans for small businesses simple with clear terms, straightforward rates, and no buried fine print.',
  icon7: 'trending_up',
  card7Title: 'Solutions That Grow With You',
  card7Desc: 'As your business expands, so can your access to capital. Our financing isn’t one-size-fits-all. Whether you need $10K to bridge a gap or $250K to scale up operations, we have financing options that evolve with your needs because your goals don’t stand still.',
  closer: 'If you’ve been looking for a small business loan that won’t drag you down, Cardiff delivers capital that matches your pace and supports your long-term momentum.',
} as const;

const whyBlock = {
  id: 'sec-8-why',
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
    { name: 'icon6', label: 'Card 6 — icon', type: 'text', default: WHY_DEFAULTS.icon6 },
    { name: 'card6Title', label: 'Card 6 — title', type: 'text', default: WHY_DEFAULTS.card6Title },
    { name: 'card6Desc', label: 'Card 6 — description', type: 'textarea', default: WHY_DEFAULTS.card6Desc },
    { name: 'icon7', label: 'Card 7 — icon', type: 'text', default: WHY_DEFAULTS.icon7 },
    { name: 'card7Title', label: 'Card 7 — title', type: 'text', default: WHY_DEFAULTS.card7Title },
    { name: 'card7Desc', label: 'Card 7 — description', type: 'textarea', default: WHY_DEFAULTS.card7Desc },
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
    content: 'Why Choose a Cardiff Loan for Small Businesses?',
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
  sec.blocks = [headerBlock, dividerBlock, whyBlock];

  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-8 -> styled 7-card "Why Choose a Cardiff Loan" grid.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
