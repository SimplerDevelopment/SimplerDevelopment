/**
 * Annual Letter iter 8 — Style the "Why Cardiff?" band (sec-8) on post 794.
 *
 * After iters 1-7, sec-8 is still a bare H2 + orange divider + 3 wall-of-text
 * paragraphs (~602 chars total) about momentum, reimagined lending, and the
 * closing "ready to move" tagline. This is the single largest remaining
 * unstyled chunk on post 794 (sec-3/sec-4/sec-7 are similar but smaller).
 *
 * Iter 8 keeps the centered iter-1 H2 + orange-underline header pattern,
 * preserves sec-8-title + sec-8-div, and replaces the unstyled p tail
 * (sec-8-p-2..p-4) with a single html-render block driven by
 * data-repeat="reasons" — 3 brand-rotating icon cards (deep blue / orange /
 * green) + a closing tagline strip pulled from p-4.
 *
 * Pattern lifted from styled-equipment-leasing-iter3 (icon-card grid) and
 * styled-annual-letter-iter7 (data-repeat usage). 3-up on desktop, stacks on
 * mobile. Material Icons only — no emojis. Brand palette only.
 *
 * Idempotent: rewrites sec-8.blocks tail wholesale (preserves the original
 * iter-1 header + divider); safe to re-run.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

const POST_ID = 794;
const TARGET_BLOCK_ID = 'sec-8';

const REASONS_HTML = `
<style>
  .cdal8 { max-width: 1140px; margin: 0 auto; }
  .cdal8__intro { text-align: center; color: #25418b; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.4rem; line-height: 1.45; font-weight: 700; margin: 0 auto 44px auto; letter-spacing: -0.005em; max-width: 760px; }
  .cdal8__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 26px; }
  .cdal8__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 14px; padding: 34px 30px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; border-top: 4px solid #1c3370; }
  .cdal8__card:hover { transform: translateY(-4px); box-shadow: 0 20px 48px rgba(28,51,112,0.14); }
  .cdal8__card:nth-child(2) { border-top-color: #ef6632; }
  .cdal8__card:nth-child(3) { border-top-color: #5ac96f; }
  .cdal8__icon { width: 58px; height: 58px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 20px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cdal8__card:nth-child(2) .cdal8__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cdal8__card:nth-child(3) .cdal8__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cdal8__icon .material-icons { font-size: 30px; }
  .cdal8__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.25rem; font-weight: 800; color: #1c3370; margin: 0 0 12px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cdal8__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9875rem; line-height: 1.75; color: #525f7f; margin: 0; }
  .cdal8__closer { margin: 44px auto 0 auto; max-width: 820px; text-align: center; padding: 26px 32px; background: linear-gradient(135deg, rgba(28,51,112,0.05) 0%, rgba(90,201,111,0.08) 100%); border-radius: 14px; border: 1px solid #e6ecf5; }
  .cdal8__closer-text { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.2rem; line-height: 1.45; color: #1c3370; margin: 0; font-weight: 700; letter-spacing: -0.005em; }
  @media (max-width: 980px) {
    .cdal8__grid { grid-template-columns: 1fr; gap: 20px; }
    .cdal8__card { padding: 28px 24px; }
    .cdal8__intro { font-size: 1.2rem; }
    .cdal8__closer { padding: 22px 22px; }
    .cdal8__closer-text { font-size: 1.08rem; }
  }
</style>
<div class="cdal8">
  <p class="cdal8__intro" data-field="intro">{{intro}}</p>
  <div class="cdal8__grid">
    <div class="cdal8__card" data-repeat="reasons">
      <div class="cdal8__icon"><span class="material-icons" data-field="icon">{{reasons.icon}}</span></div>
      <h3 class="cdal8__title" data-field="title">{{reasons.title}}</h3>
      <p class="cdal8__desc" data-field="desc">{{reasons.desc}}</p>
    </div>
  </div>
  <div class="cdal8__closer">
    <p class="cdal8__closer-text" data-field="closer">{{closer}}</p>
  </div>
</div>
`.trim();

const REASONS_DEFAULTS = {
  intro: "Cardiff is built for entrepreneurs who can't afford to wait.",
  reasons: [
    {
      icon: 'rocket_launch',
      title: 'Momentum Matters',
      desc: "You aren't just chasing numbers — you're building teams, launching products, signing leases, and growing your reach. Every day lost to outdated underwriting is a missed opportunity.",
    },
    {
      icon: 'auto_awesome',
      title: 'Lending, Reimagined',
      desc: "We've reimagined alternative business lending for entrepreneurs and business owners who can't afford delays. Whether you're considering a business loan for expansion, navigating merchant financing options, or researching unsecured business loans to cover a gap, Cardiff offers the clarity, speed, and confidence you need.",
    },
    {
      icon: 'verified',
      title: 'Clarity & Confidence',
      desc: "No guesswork, no buried fees, no surprise hurdles. Cardiff gives you a clear path from application to funding so you can make decisions with confidence and keep your business moving forward.",
    },
  ],
  closer: "When you're ready to move, Cardiff makes it possible.",
};

const reasonsBlock = {
  id: 'sec-8-reasons',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: REASONS_HTML,
  fields: [
    { name: 'intro', label: 'Intro tagline', type: 'textarea', default: REASONS_DEFAULTS.intro },
    {
      name: 'reasons',
      label: 'Reason cards',
      type: 'array',
      itemFields: [
        { name: 'icon', type: 'text', label: 'Material icon name' },
        { name: 'title', type: 'text', label: 'Reason title' },
        { name: 'desc', type: 'textarea', label: 'Reason description' },
      ],
    },
    { name: 'closer', label: 'Closing tagline', type: 'textarea', default: REASONS_DEFAULTS.closer },
  ],
  values: { ...REASONS_DEFAULTS },
};

const TAIL_IDS = new Set([
  'sec-8-p-2',
  'sec-8-p-3',
  'sec-8-p-4',
  // re-running this script:
  'sec-8-reasons',
]);

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

  // Soft band background to set this differentiator strip apart from neighbors.
  sec.maxWidth = '1200px';
  sec.style = {
    ...(sec.style || {}),
    backgroundColor: '#f6f9fc',
    paddingTop: '80px',
    paddingBottom: '80px',
    paddingLeft: '24px',
    paddingRight: '24px',
  };

  const kept = (sec.blocks || []).filter((b: any) => !TAIL_IDS.has(b?.id));
  sec.blocks = [...kept, reasonsBlock];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: sec-8 -> replaced bare p-tail with styled 3-card "Why Cardiff?" reasons grid + closer.`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
