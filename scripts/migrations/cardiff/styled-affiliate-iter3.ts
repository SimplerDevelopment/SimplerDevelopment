/**
 * Iter 3 — Affiliate page (post 796): restyle sec-2, the biggest remaining
 * unstyled section (10 stacked children — h2 + 4 raw paragraphs + 2 lone h4s
 * with body copy that ALL read as one mushy wall of text on the live page).
 *
 * Iter 1 handled sec-1 (hero). Iter 2 handled sec-3 (audience grid).
 *
 * sec-2 buries the actual sales story — "you get paid when your referral
 * qualifies, not when they fund" — under a paragraph stack, then introduces
 * "Monetize Your Network In 3 Simple Steps" but never renders those steps as
 * steps. They're just two more h4s + paragraphs at the bottom.
 *
 * Fix: split sec-2 into a clean 3-part structure —
 *   1. Centered H2 + orange underline divider (matches iter1/iter2 pattern)
 *   2. Intro html-render block: short pitch + an inline "WE PAY ON QUALIFICATION"
 *      callout chip in brand orange so the differentiator can't be missed.
 *   3. 3-step numbered process html-render (data-repeat="steps") — same visual
 *      family as restyle-home-process.ts (01/02/03 badges, icon tiles, connector
 *      line at desktop) — so the page finally renders "3 Simple Steps" AS three
 *      steps instead of one heading and a vertical list.
 *
 * Brand palette only: #1c3370, #25418b, #5ac96f, #ef6632, #ffb798.
 * Raleway titles, Open Sans body. Material Icons (no emojis).
 *
 * Idempotent: looks up sec-2 by id, rewrites its blocks + style each run.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

const POST_ID = 796;
const TARGET_SECTION_ID = 'sec-2';

const INTRO_HTML = `
<style>
  .cd-aff-intro { max-width: 880px; margin: 0 auto; text-align: center; }
  .cd-aff-intro__lead { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #525f7f; margin: 0 auto 18px auto; max-width: 720px; }
  .cd-aff-intro__lead strong { color: #1c3370; font-weight: 700; }
  .cd-aff-intro__chip { display: inline-flex; align-items: center; gap: 10px; background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); color: #fff; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 800; font-size: 0.78rem; letter-spacing: 0.18em; text-transform: uppercase; padding: 12px 22px; border-radius: 999px; box-shadow: 0 10px 24px rgba(239,102,50,0.28); margin: 14px 0 8px 0; }
  .cd-aff-intro__chip .material-icons { font-size: 18px; }
  .cd-aff-intro__sub { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1rem; line-height: 1.65; color: #525f7f; margin: 14px auto 0 auto; max-width: 720px; }
  .cd-aff-intro__sub strong { color: #25418b; font-weight: 700; }
</style>
<div class="cd-aff-intro">
  <p class="cd-aff-intro__lead" data-field="lead">{{lead}}</p>
  <div class="cd-aff-intro__chip"><span class="material-icons">paid</span><span data-field="chip">{{chip}}</span></div>
  <p class="cd-aff-intro__sub" data-field="sub">{{sub}}</p>
</div>
`.trim();

const INTRO_DEFAULTS = {
  lead: 'Most affiliate programs only pay you if someone buys — if a deal closes, if they say yes. Not us.',
  chip: 'We pay on qualification — not on funding',
  sub: 'You get money in your pocket the moment your referral qualifies. No waiting on a close. No chasing a contract. Monetize your network in <strong>3 simple steps</strong>.',
} as const;

const introBlock = {
  id: 'sec-2-intro',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: INTRO_HTML,
  fields: [
    { name: 'lead', label: 'Lead paragraph', type: 'textarea', default: INTRO_DEFAULTS.lead },
    { name: 'chip', label: 'Callout chip text', type: 'text', default: INTRO_DEFAULTS.chip },
    { name: 'sub', label: 'Sub paragraph (HTML allowed)', type: 'textarea', default: INTRO_DEFAULTS.sub },
  ],
  values: {
    lead: INTRO_DEFAULTS.lead,
    chip: INTRO_DEFAULTS.chip,
    sub: INTRO_DEFAULTS.sub,
  },
};

const STEPS_HTML = `
<style>
  .cd-aff-steps { max-width: 1100px; margin: 48px auto 0 auto; counter-reset: cd-aff-step; }
  .cd-aff-steps__row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 26px; position: relative; }
  .cd-aff-steps__row::before { content: ''; position: absolute; top: 96px; left: 12%; right: 12%; height: 2px; background: linear-gradient(to right, transparent, #e8edf6 12%, #e8edf6 88%, transparent); z-index: 0; }
  .cd-aff-steps__col { background: #fff; border-radius: 16px; padding: 32px 26px; text-align: center; position: relative; z-index: 1; border: 1px solid #eef1f8; box-shadow: 0 10px 28px rgba(28,51,112,0.06); counter-increment: cd-aff-step; transition: transform .25s ease, box-shadow .25s ease; }
  .cd-aff-steps__col:hover { transform: translateY(-4px); box-shadow: 0 18px 40px rgba(28,51,112,0.14); }
  .cd-aff-steps__num { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 800; font-size: 0.78rem; color: #ef6632; letter-spacing: 0.22em; margin: 0 0 14px 0; }
  .cd-aff-steps__num::before { content: counter(cd-aff-step, decimal-leading-zero); }
  .cd-aff-steps__icon { display: inline-flex; align-items: center; justify-content: center; width: 64px; height: 64px; border-radius: 16px; background: rgba(239,102,50,0.10); margin: 0 0 18px 0; }
  .cd-aff-steps__icon .material-icons { color: #ef6632; font-size: 32px; }
  .cd-aff-steps__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 800; font-size: 1.125rem; color: #1c3370; letter-spacing: -0.005em; line-height: 1.25; margin: 0 0 10px 0; }
  .cd-aff-steps__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.92rem; line-height: 1.6; color: #525f7f; margin: 0; }
  @media (max-width: 980px) {
    .cd-aff-steps__row { grid-template-columns: repeat(2, 1fr); }
    .cd-aff-steps__row::before { display: none; }
  }
  @media (max-width: 600px) {
    .cd-aff-steps__row { grid-template-columns: 1fr; gap: 18px; }
    .cd-aff-steps__col { padding: 26px 22px; }
  }
</style>
<div class="cd-aff-steps">
  <div class="cd-aff-steps__row">
    <div class="cd-aff-steps__col" data-repeat="steps">
      <div class="cd-aff-steps__num"></div>
      <div class="cd-aff-steps__icon"><span class="material-icons" data-field="icon">{{steps.icon}}</span></div>
      <div class="cd-aff-steps__title" data-field="title">{{steps.title}}</div>
      <div class="cd-aff-steps__desc" data-field="description">{{steps.description}}</div>
    </div>
  </div>
</div>
`.trim();

const STEPS_DEFAULTS = [
  { title: 'Get Your Affiliate Link', description: 'Once you qualify for our affiliate program, we give you a personal link — the engine of your money-making machine.', icon: 'link' },
  { title: 'Refer Business Owners', description: 'Use our proven trainings, live calls, and done-for-you marketing assets to promote your link the most effective way.', icon: 'share' },
  { title: 'Get PAID', description: 'Every business owner you refer who QUALIFIES pays you — even if they don’t take the loan. Your work almost always earns a reward.', icon: 'paid' },
] as const;

const stepsBlock = {
  id: 'sec-2-steps',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 4,
  html: STEPS_HTML,
  fields: [
    {
      name: 'steps',
      label: 'Process steps',
      type: 'array',
      itemFields: [
        { name: 'title', type: 'text', label: 'Title' },
        { name: 'description', type: 'textarea', label: 'Description' },
        { name: 'icon', type: 'text', label: 'Material icon name' },
      ],
    },
  ],
  values: {
    steps: STEPS_DEFAULTS.map((s) => ({ ...s })),
  },
};

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema/cms');
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

  const idx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === TARGET_SECTION_ID);
  if (idx === -1) {
    console.error(`Post ${POST_ID}: no block with id=${TARGET_SECTION_ID}; aborting`);
    process.exit(1);
  }
  const sec = parsed.blocks[idx];
  if (sec.type !== 'section') {
    console.error(`Post ${POST_ID}: block ${TARGET_SECTION_ID} is not a section (was ${sec.type}); aborting`);
    process.exit(1);
  }

  // Widen container so the 3-step grid breathes; keep white background to
  // contrast against sec-3's tinted audience grid above/below.
  sec.maxWidth = '1240px';
  sec.style = {
    ...(sec.style || {}),
    backgroundColor: '#ffffff',
    paddingTop: '88px',
    paddingBottom: '88px',
    paddingLeft: '24px',
    paddingRight: '24px',
  };

  const headerBlock = {
    type: 'heading' as const,
    id: 'sec-2-title',
    order: 1,
    level: 2,
    content: 'Cardiff’s New Affiliate Model Turns Your Connections Into Commissions',
    alignment: 'center' as const,
    style: {
      color: '#1c3370',
      fontFamily: "Raleway, -apple-system, BlinkMacSystemFont, sans-serif",
      fontSize: '2.25rem',
      fontWeight: '800',
      letterSpacing: '-0.015em',
      lineHeight: '1.18',
      margin: '0 auto 14px auto',
      maxWidth: '960px',
      textAlign: 'center',
    },
  };
  const dividerBlock = {
    type: 'text' as const,
    id: 'sec-2-div',
    order: 2,
    content: '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 28px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };

  sec.blocks = [headerBlock, dividerBlock, introBlock, stepsBlock];

  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: ${TARGET_SECTION_ID} -> header + intro (with chip) + 3-step numbered grid (data-repeat="steps").`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
