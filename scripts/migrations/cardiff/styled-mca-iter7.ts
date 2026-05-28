/**
 * Iter 7 (MCA, post 824): Restyle sec-2 "What kinds of working capital
 * are available?" — currently divider + intro + bare <ul> stack (only 2
 * of the promised "three types" rendered, third truncated in source).
 *
 * Replaces sec-2 sub-blocks with:
 *   1. Centered H2 + orange underline
 *   2. Intro paragraph
 *   3. html-render: 3-up icon-card grid (Term Loans / Line of Credit /
 *      Merchant Cash Advance) using data-repeat="types".
 *
 * Brand palette only — #1c3370 / #25418b deep blue, #ef6632 orange,
 * #5ac96f green. Raleway titles, Open Sans body. Material Icons.
 *
 * Idempotent: re-running rewrites sec-2-types and sec-2 sub-blocks.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 824;
const TARGET_BLOCK_ID = 'sec-2';

const TYPES_HTML = `
<style>
  .cd-mca-types { max-width: 1140px; margin: 0 auto; }
  .cd-mca-types__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-mca-types__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 32px 28px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-mca-types__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-mca-types__icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-mca-types__card:nth-child(2) .cd-mca-types__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-mca-types__card:nth-child(3) .cd-mca-types__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-mca-types__icon .material-icons { font-size: 30px; }
  .cd-mca-types__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.25rem; font-weight: 800; color: #1c3370; margin: 0 0 12px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-mca-types__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.975rem; line-height: 1.7; color: #525f7f; margin: 0; }
  @media (max-width: 980px) {
    .cd-mca-types__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-mca-types__card { padding: 26px 22px; }
  }
</style>
<div class="cd-mca-types">
  <div class="cd-mca-types__grid">
    <div class="cd-mca-types__card" data-repeat="types">
      <div class="cd-mca-types__icon"><span class="material-icons" data-field="icon">{{types.icon}}</span></div>
      <h3 class="cd-mca-types__card-title" data-field="title">{{types.title}}</h3>
      <p class="cd-mca-types__card-desc" data-field="desc">{{types.desc}}</p>
    </div>
  </div>
</div>
`.trim();

const TYPES_DEFAULTS = {
  types: [
    {
      icon: 'event_note',
      title: 'Term Loans',
      desc: 'What you probably think of when you think of a loan — a set term, fees, and a predictable payoff schedule. Best when you know the amount you need and want fixed payments over time.',
    },
    {
      icon: 'credit_card',
      title: 'Business Line of Credit',
      desc: 'Works like a credit card: you have a credit limit and finance charges, make a monthly payment, and can borrow and repay as needed. Typically much larger limits than a business credit card.',
    },
    {
      icon: 'bolt',
      title: 'Merchant Cash Advance',
      desc: 'Fast funding repaid as a small percentage of your daily card or bank revenue. Ideal for businesses with steady cash flow that need capital quickly without traditional loan paperwork.',
    },
  ],
};

const typesBlock = {
  id: 'sec-2-types',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: TYPES_HTML,
  fields: [
    {
      name: 'types',
      label: 'Working capital types',
      type: 'array',
      itemFields: [
        { name: 'icon', label: 'Material icon name', type: 'text' },
        { name: 'title', label: 'Title', type: 'text' },
        { name: 'desc', label: 'Description', type: 'textarea' },
      ],
      default: TYPES_DEFAULTS.types,
    },
  ],
  values: { ...TYPES_DEFAULTS },
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
    content: 'What Kinds of Working Capital Are Available?',
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
    content:
      '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 24px auto;border-radius:2px"></div>' +
      '<p style="text-align:center;color:#525f7f;font-family:\'Open Sans\',-apple-system,BlinkMacSystemFont,sans-serif;font-size:1.0625rem;line-height:1.75;max-width:760px;margin:0 auto 48px auto">In general, there are three types of working capital financing small businesses turn to. Here\'s how they compare.</p>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  sec.blocks = [headerBlock, dividerBlock, typesBlock];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-2 -> styled 3-card working-capital types grid.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
