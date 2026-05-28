/**
 * Annual Letter iter 3 — Style the "Our Process" section (sec-2) on post 794.
 *
 * Current state: sec-2 is 18 sub-blocks of bare H3 + paragraph pairs — 5
 * process steps (Apply Online → Renew Your Funding) followed by 3 stats
 * (5.99% / $82,000 / 39 Months) and a trailing footnote. Renders as a
 * vertical wall of text with no visual rhythm.
 *
 * Iter 3 replaces sec-2's sub-blocks with:
 *   1. Centered H2 + orange underline (same pattern as iter1 hero / iter2)
 *   2. A horizontal 5-up numbered process-step grid driven by html-render
 *      (pattern from restyle-home-process.ts)
 *   3. A 3-up stats strip with brand-blue cards highlighting headline metrics
 *
 * Brand: #1c3370 / #25418b deep blue, #5ac96f green, #ef6632 orange,
 * Raleway + Open Sans. Material Icons only — no emojis.
 *
 * Idempotent: re-running rewrites sec-2.blocks wholesale from the templates
 * defined below; safe to re-run.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

const POST_ID = 794;
const TARGET_BLOCK_ID = 'sec-2';

const PROCESS_HTML = `<div class="cdal-process">
  <div class="cdal-process__row">
    <div class="cdal-process__col" data-repeat="steps">
      <div class="cdal-process__num"></div>
      <div class="cdal-process__icon"><span class="material-icons" data-field="icon">{{steps.icon}}</span></div>
      <div class="cdal-process__title" data-field="title">{{steps.title}}</div>
      <div class="cdal-process__desc" data-field="description">{{steps.description}}</div>
    </div>
  </div>
  <style>
    .cdal-process { max-width: 1200px; margin: 8px auto 0 auto; counter-reset: cdal-step; }
    .cdal-process__row { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 20px; position: relative; }
    .cdal-process__row::before { content: ''; position: absolute; top: 96px; left: 10%; right: 10%; height: 2px; background: linear-gradient(to right, transparent, #e8edf6 12%, #e8edf6 88%, transparent); z-index: 0; }
    .cdal-process__col { background: #ffffff; border-radius: 14px; padding: 26px 18px; text-align: center; position: relative; z-index: 1; border: 1px solid #eef1f8; box-shadow: 0 4px 14px rgba(37,65,139,0.06); counter-increment: cdal-step; transition: transform .25s ease, box-shadow .25s ease; }
    .cdal-process__col:hover { transform: translateY(-3px); box-shadow: 0 12px 30px rgba(37,65,139,0.12); }
    .cdal-process__num { font-family: Raleway, -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 800; font-size: 0.72rem; color: #ef6632; letter-spacing: 0.22em; margin: 0 0 14px 0; }
    .cdal-process__num::before { content: counter(cdal-step, decimal-leading-zero); }
    .cdal-process__icon { display: inline-flex; align-items: center; justify-content: center; width: 56px; height: 56px; border-radius: 14px; background: rgba(239,102,50,0.10); margin: 0 0 14px 0; }
    .cdal-process__icon .material-icons { color: #ef6632; font-size: 28px; }
    .cdal-process__title { font-family: Raleway, -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 800; font-size: 0.98rem; color: #25418b; letter-spacing: -0.005em; line-height: 1.25; margin: 0 0 8px 0; }
    .cdal-process__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.82rem; line-height: 1.55; color: #525f7f; margin: 0; }
    @media (max-width: 1100px) {
      .cdal-process__row { grid-template-columns: repeat(2, 1fr); }
      .cdal-process__row::before { display: none; }
    }
    @media (max-width: 640px) {
      .cdal-process__row { grid-template-columns: 1fr; }
    }
  </style>
</div>`;

const STATS_HTML = `<div class="cdal-pstats">
  <div class="cdal-pstats__row">
    <div class="cdal-pstats__card" data-repeat="stats">
      <div class="cdal-pstats__metric" data-field="metric">{{stats.metric}}</div>
      <div class="cdal-pstats__label" data-field="label">{{stats.label}}</div>
    </div>
  </div>
  <p class="cdal-pstats__foot" data-field="footnote">{{footnote}}</p>
  <style>
    .cdal-pstats { max-width: 1100px; margin: 56px auto 0 auto; }
    .cdal-pstats__row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; }
    .cdal-pstats__card { background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); border-radius: 16px; padding: 32px 24px; text-align: center; color: #fff; box-shadow: 0 14px 36px rgba(28,51,112,0.20); border: 1px solid rgba(255,255,255,0.06); }
    .cdal-pstats__card:nth-child(2) { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 14px 36px rgba(239,102,50,0.22); }
    .cdal-pstats__card:nth-child(3) { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 14px 36px rgba(58,168,86,0.22); }
    .cdal-pstats__metric { font-family: Raleway, -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 800; font-size: 2.5rem; line-height: 1.1; letter-spacing: -0.015em; margin: 0 0 8px 0; color: #ffffff; }
    .cdal-pstats__label { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.95rem; line-height: 1.45; color: rgba(255,255,255,0.92); margin: 0; }
    .cdal-pstats__foot { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.95rem; line-height: 1.6; color: #525f7f; text-align: center; margin: 24px auto 0 auto; max-width: 720px; font-style: italic; }
    @media (max-width: 820px) {
      .cdal-pstats__row { grid-template-columns: 1fr; }
      .cdal-pstats__metric { font-size: 2.1rem; }
    }
  </style>
</div>`;

const processBlock = {
  id: 'sec-2-process',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: PROCESS_HTML,
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
    steps: [
      { title: 'Apply Online', description: 'Tell us a little bit about your business and get approved in less than 2 minutes.', icon: 'edit_note' },
      { title: 'Get Approved', description: 'Choose the terms that work best for your budget and get on with your day.', icon: 'task_alt' },
      { title: 'Withdraw Funds', description: 'Link your business checking account to your Cardiff financing and access your funds.', icon: 'account_balance' },
      { title: 'Repayment', description: 'Payments are remitted automatically through ACH withdrawal either daily, weekly, or monthly.', icon: 'autorenew' },
      { title: 'Renew Your Funding', description: 'Pay off your balance early and gain access to more capital at better terms.', icon: 'rocket_launch' },
    ],
  },
};

const statsBlock = {
  id: 'sec-2-stats',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 4,
  html: STATS_HTML,
  fields: [
    {
      name: 'stats',
      label: 'Headline metrics',
      type: 'array',
      itemFields: [
        { name: 'metric', type: 'text', label: 'Metric value' },
        { name: 'label', type: 'textarea', label: 'Label' },
      ],
    },
    { name: 'footnote', label: 'Footnote', type: 'textarea' },
  ],
  values: {
    stats: [
      { metric: '5.99%', label: 'Low rates on secured financing' },
      { metric: '$82,000', label: "Double our average competitor's approval" },
      { metric: '39 Months', label: 'Average approved term, no minimum credit score' },
    ],
    footnote: 'Most customers receive additional funds within 6 months.',
  },
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
    console.error(`Post ${POST_ID}: block ${TARGET_BLOCK_ID} is not a section (was ${sec.type}); aborting`);
    process.exit(1);
  }

  // Widen + give the section a subtle tinted band so it reads as a discrete unit.
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
    id: 'sec-2-title',
    order: 1,
    level: 2,
    content: 'Our Process',
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
    id: 'sec-2-div',
    order: 2,
    content: '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };

  sec.blocks = [headerBlock, dividerBlock, processBlock, statsBlock];

  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-2 -> styled 5-step process grid + 3-up stats strip.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
