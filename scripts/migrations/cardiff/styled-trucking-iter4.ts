/**
 * Iter 4 (trucking, post 817): Restyle sec-2 — the "How Trucking Loans Can
 * Grow Your Business" section. Currently 12 bare sub-blocks: H2 + divider +
 * three intro paragraphs + four H4/paragraph loan-type pairs, all crammed in
 * an 880px column with zero visual structure (and one orphaned paragraph
 * with no preceding heading — "Equipment Financing").
 *
 * Replacement matches the iter-2 / iter-3 pattern already used elsewhere on
 * this page:
 *   1. Centered H2 + orange underline
 *   2. A single html-render block carrying:
 *      a) intro / subtext paragraphs
 *      b) a 4-up icon-card grid (data-repeat="options") of loan options:
 *         Short-Term Loans, Business Line of Credit, Equipment Financing,
 *         SBA Loans — each with Material Icon chip, title, description
 *      c) a closing summary line
 *
 * Brand palette only: deep blue (#1c3370 / #25418b), orange (#ef6632),
 * green (#5ac96f), peach (#ffb798) accents. Raleway headings / Open Sans body.
 * Material Icons (no emojis).
 *
 * Idempotent: re-running detects sec-2, rewrites its sub-blocks with the same
 * three children (heading + divider + html-render id "sec-2-options"). Safe
 * to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 817;
const TARGET_BLOCK_ID = 'sec-2';

const OPTIONS_HTML = `
<style>
  .cd-tk-opt { max-width: 1140px; margin: 0 auto; }
  .cd-tk-opt__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 780px; margin: 0 auto 24px auto; }
  .cd-tk-opt__intro:last-of-type { margin-bottom: 48px; }
  .cd-tk-opt__grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; }
  .cd-tk-opt__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 14px; padding: 32px 30px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); display: flex; flex-direction: column; transition: transform .25s ease, box-shadow .25s ease; position: relative; overflow: hidden; }
  .cd-tk-opt__card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, #25418b 0%, #1c3370 100%); }
  .cd-tk-opt__card:nth-child(2)::before { background: linear-gradient(90deg, #ef6632 0%, #d8501e 100%); }
  .cd-tk-opt__card:nth-child(3)::before { background: linear-gradient(90deg, #5ac96f 0%, #3aa856 100%); }
  .cd-tk-opt__card:nth-child(4)::before { background: linear-gradient(90deg, #ffb798 0%, #ef6632 100%); }
  .cd-tk-opt__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-tk-opt__icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-tk-opt__card:nth-child(2) .cd-tk-opt__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-tk-opt__card:nth-child(3) .cd-tk-opt__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-tk-opt__card:nth-child(4) .cd-tk-opt__icon { background: linear-gradient(135deg, #ffb798 0%, #ef6632 100%); box-shadow: 0 8px 18px rgba(255,183,152,0.32); }
  .cd-tk-opt__icon .material-icons { font-size: 30px; }
  .cd-tk-opt__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.25rem; font-weight: 800; color: #1c3370; margin: 0 0 12px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-tk-opt__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.975rem; line-height: 1.7; color: #525f7f; margin: 0; }
  .cd-tk-opt__closer { margin: 48px auto 0 auto; max-width: 820px; text-align: center; padding: 28px 32px; background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(239,102,50,0.06) 100%); border-radius: 12px; border: 1px solid #e6ecf5; }
  .cd-tk-opt__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #25418b; margin: 0; font-weight: 500; }
  @media (max-width: 760px) {
    .cd-tk-opt__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-tk-opt__card { padding: 26px 22px; }
    .cd-tk-opt__closer { padding: 22px 20px; }
  }
</style>
<div class="cd-tk-opt">
  <p class="cd-tk-opt__intro" data-field="intro1">{{intro1}}</p>
  <p class="cd-tk-opt__intro" data-field="intro2">{{intro2}}</p>
  <div class="cd-tk-opt__grid">
    <div class="cd-tk-opt__card" data-repeat="options">
      <div class="cd-tk-opt__icon"><span class="material-icons">{{options.icon}}</span></div>
      <h3 class="cd-tk-opt__card-title">{{options.title}}</h3>
      <p class="cd-tk-opt__card-desc">{{options.desc}}</p>
    </div>
  </div>
  <div class="cd-tk-opt__closer">
    <p class="cd-tk-opt__closer-text" data-field="closer">{{closer}}</p>
  </div>
</div>
`.trim();

const OPTIONS = [
  {
    icon: 'bolt',
    title: 'Short-Term Loans',
    desc: 'Ideal for rapid growth and short-term cash flow needs for expansion — fast access to capital when you need to hire drivers, cover fuel, or scale up quickly.',
  },
  {
    icon: 'sync_alt',
    title: 'Business Line of Credit',
    desc: 'If you face recurring cash flow problems due to payment delays or seasonal funding gaps, a line of credit gives you flexible, on-demand access to working capital.',
  },
  {
    icon: 'local_shipping',
    title: 'Equipment Financing',
    desc: 'If you want to add to your fleet or repair existing trucks, equipment financing works well — the equipment itself secures the loan, often making approval easier.',
  },
  {
    icon: 'account_balance',
    title: 'Small Business Administration Loans',
    desc: 'If you’re not in a hurry for financing and you’re looking for a longer repayment term with competitive rates, an SBA Loan can be a strong fit for your business.',
  },
];

const OPTIONS_DEFAULTS = {
  intro1: 'So you’ve nailed your route, have a steady stream of customers, and you’re ready to add a new truck and some employees. Whether you’re just starting out or a seasoned trucker, if you need financing to hire drivers, pay for fuel and tolls, repair trucks, or add to your fleet, a trucking loan can provide the cash you need.',
  intro2: 'There are a few financing options for truckers. Choosing the type that suits your business’ needs is essential — our staff can help create a lending package that works for you. Here’s a brief summary of the most common options:',
  options: OPTIONS,
  closer: 'The most common problem for any small business owner is a lack of cash flow. With a trucking loan, you can avoid running up credit card debt for fuel, repairs, and tolls — and keep your business rolling forward.',
} as const;

const optionsBlock = {
  id: 'sec-2-options',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: OPTIONS_HTML,
  fields: [
    { name: 'intro1', label: 'Intro paragraph 1', type: 'textarea', default: OPTIONS_DEFAULTS.intro1 },
    { name: 'intro2', label: 'Intro paragraph 2', type: 'textarea', default: OPTIONS_DEFAULTS.intro2 },
    {
      name: 'options',
      label: 'Loan options',
      type: 'repeater',
      itemFields: [
        { name: 'icon', label: 'Material Icon name', type: 'text', default: 'bolt' },
        { name: 'title', label: 'Option title', type: 'text', default: '' },
        { name: 'desc', label: 'Option description', type: 'textarea', default: '' },
      ],
      default: OPTIONS,
    },
    { name: 'closer', label: 'Closing summary', type: 'textarea', default: OPTIONS_DEFAULTS.closer },
  ],
  values: { ...OPTIONS_DEFAULTS },
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

  // Widen so the 2x2 card grid breathes.
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
    id: 'sec-2-title',
    order: 1,
    level: 2,
    content: 'How Trucking Loans Can Grow Your Business',
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
  sec.blocks = [headerBlock, dividerBlock, optionsBlock];

  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-2 -> styled 4-card "Trucking Loan Options" grid.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
