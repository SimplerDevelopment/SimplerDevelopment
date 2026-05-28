/**
 * Annual Letter iter 6 — Style the "Better Business Credit Options Without
 * the Guesswork" section (sec-6) on post 794. After iters 1-5 this is the
 * single largest remaining unstyled section by char count (~2.2k), with
 * three substantive credit-benefit paragraphs rendered as bare text below
 * an already-styled centered H2 + orange underline.
 *
 * Iter 6 replaces sec-6 sub-blocks with:
 *   1. Centered H2 + orange underline (same pattern as iters 1-5).
 *   2. A single html-render block carrying a 3-up benefit card grid driven
 *      by data-repeat="benefits" — icon chip + title + description per
 *      card, with brand-rotating accent colors (blue / orange / green).
 *      Pattern lifted from styled-equipment-leasing-iter3, converted to a
 *      data-repeat array so editors can add/remove benefits without
 *      re-scaffolding HTML.
 *   3. A closer gradient panel that re-states the "we evolve with you"
 *      promise as a callout instead of a third bare paragraph.
 *
 * Brand: #1c3370 / #25418b deep blue, #5ac96f green, #ef6632 orange,
 * Raleway + Open Sans. Material Icons only — no emojis.
 *
 * Idempotent: re-running rewrites sec-6.blocks wholesale; safe to re-run.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

const POST_ID = 794;
const TARGET_BLOCK_ID = 'sec-6';

const BENEFITS_HTML = `
<style>
  .cdal6 { max-width: 1140px; margin: 0 auto; }
  .cdal6__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 780px; margin: 0 auto 44px auto; }
  .cdal6__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cdal6__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 14px; padding: 34px 28px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; border-top: 4px solid #1c3370; }
  .cdal6__card:hover { transform: translateY(-4px); box-shadow: 0 20px 48px rgba(28,51,112,0.14); }
  .cdal6__card:nth-child(2) { border-top-color: #ef6632; }
  .cdal6__card:nth-child(3) { border-top-color: #5ac96f; }
  .cdal6__icon { width: 58px; height: 58px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 20px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cdal6__card:nth-child(2) .cdal6__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cdal6__card:nth-child(3) .cdal6__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cdal6__icon .material-icons { font-size: 30px; }
  .cdal6__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.2rem; font-weight: 800; color: #1c3370; margin: 0 0 12px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cdal6__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.975rem; line-height: 1.7; color: #525f7f; margin: 0; }
  .cdal6__closer { margin: 44px auto 0 auto; max-width: 820px; text-align: center; padding: 28px 32px; background: linear-gradient(135deg, rgba(28,51,112,0.05) 0%, rgba(90,201,111,0.08) 100%); border-radius: 12px; border: 1px solid #e6ecf5; }
  .cdal6__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #25418b; margin: 0; font-weight: 500; }
  @media (max-width: 980px) {
    .cdal6__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 640px) {
    .cdal6__grid { grid-template-columns: 1fr; gap: 18px; }
    .cdal6__card { padding: 28px 24px; }
    .cdal6__closer { padding: 22px 20px; }
  }
</style>
<div class="cdal6">
  <p class="cdal6__intro" data-field="intro">{{intro}}</p>
  <div class="cdal6__grid">
    <div class="cdal6__card" data-repeat="benefits">
      <div class="cdal6__icon"><span class="material-icons" data-field="icon">{{benefits.icon}}</span></div>
      <h3 class="cdal6__title" data-field="title">{{benefits.title}}</h3>
      <p class="cdal6__desc" data-field="desc">{{benefits.desc}}</p>
    </div>
  </div>
  <div class="cdal6__closer">
    <p class="cdal6__closer-text" data-field="closer">{{closer}}</p>
  </div>
</div>
`.trim();

const BENEFITS_DEFAULTS = {
  intro:
    "Unlike conventional lenders that prioritize your credit score above all else, Cardiff considers the full picture — revenue trends, business potential, and overall financial health — so more businesses qualify for the credit they actually need.",
  benefits: [
    {
      icon: 'insights',
      title: 'The Full Financial Picture',
      desc: "We look beyond your credit score to revenue trends, business potential, and overall financial health. That means more business credit options for companies that traditional banks overlook.",
    },
    {
      icon: 'bolt',
      title: 'Same-Day Funding',
      desc: "Need to get a business loan quickly? Our streamlined process makes it easy to apply and get approved. Many of our clients receive funds the same day — lending built for the realities of running a business, not banking protocol.",
    },
    {
      icon: 'trending_up',
      title: 'Financing That Grows With You',
      desc: "From short-term cash flow loans to longer-term growth funding, Cardiff offers guidance every step of the way. You're building something, and we're proud to help finance it.",
    },
  ],
  closer:
    "And when your needs evolve? Cardiff evolves with you — every stage, every season, every next step.",
};

const benefitsBlock = {
  id: 'sec-6-benefits',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: BENEFITS_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: BENEFITS_DEFAULTS.intro },
    {
      name: 'benefits',
      label: 'Benefit cards',
      type: 'array',
      itemFields: [
        { name: 'icon', type: 'text', label: 'Material icon name' },
        { name: 'title', type: 'text', label: 'Benefit title' },
        { name: 'desc', type: 'textarea', label: 'Benefit description' },
      ],
    },
    { name: 'closer', label: 'Closing line', type: 'textarea', default: BENEFITS_DEFAULTS.closer },
  ],
  values: { ...BENEFITS_DEFAULTS },
};

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

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
    console.error(
      `Post ${POST_ID}: block ${TARGET_BLOCK_ID} is not a section (was ${sec.type}); aborting`
    );
    process.exit(1);
  }

  // Widen + light tint so the 3-card grid reads as a discrete benefits band.
  sec.maxWidth = '1240px';
  sec.style = {
    ...(sec.style || {}),
    backgroundColor: '#f6f9fc',
    paddingTop: '88px',
    paddingBottom: '88px',
    paddingLeft: '24px',
    paddingRight: '24px',
  };

  const headerBlock = {
    type: 'heading' as const,
    id: 'sec-6-title',
    order: 1,
    level: 2,
    content: 'Better Business Credit Options Without the Guesswork',
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
    id: 'sec-6-div',
    order: 2,
    content:
      '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };

  sec.blocks = [headerBlock, dividerBlock, benefitsBlock];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: sec-6 -> styled 3-card "Better Business Credit Options" benefit grid.`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
