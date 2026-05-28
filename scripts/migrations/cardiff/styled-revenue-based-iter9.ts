/**
 * Iter 9: Restyle sec-2 on post 828 (revenue-based) — the only remaining
 * bare paragraph stack on the page that warrants a visual treatment.
 *
 * sec-2 is "What's Different About Revenue-Based Loans?" — currently a
 * centered H2 + orange underline + two default text blocks (one long
 * paragraph + a short closer). Iters 1-8 already styled every other
 * substantive section (sec-1 intro, sec-3 compare, sec-5 steps, sec-6 why,
 * sec-7 industries, sec-8 qualify, sec-10 fit). sec-4 is a short tail
 * paragraph paired with the sec-3 comparison; sec-9 is a CTA wind-up
 * already crowned by the final-cta block. sec-2 is the gap.
 *
 * Fix: rewrite sec-2 sub-blocks with:
 *   1. Centered H2 + orange underline (same pattern as prior iters)
 *   2. A single html-render block carrying an intro lead, a 3-up icon
 *      card grid (data-repeat="differentiators") summarizing what makes
 *      RBLs distinct, and a closing line.
 *
 * Uses the iter3 (equipment-leasing) icon-card grid pattern. Brand
 * palette only — deep blue (#1c3370 / #25418b), green (#5ac96f), orange
 * (#ef6632) accents — no emojis, Material Icons for chips.
 *
 * Idempotent: looks up sec-2 by id and rewrites its blocks; safe to
 * re-run.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const POST_ID = 828;
  const TARGET_BLOCK_ID = 'sec-2';

  const DIFF_HTML = `
<style>
  .cd-rbl-diff { max-width: 1140px; margin: 0 auto; }
  .cd-rbl-diff__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 780px; margin: 0 auto 44px auto; }
  .cd-rbl-diff__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-rbl-diff__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 32px 28px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-rbl-diff__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-rbl-diff__icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-rbl-diff__card:nth-child(2) .cd-rbl-diff__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-rbl-diff__card:nth-child(3) .cd-rbl-diff__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-rbl-diff__icon .material-icons { font-size: 30px; }
  .cd-rbl-diff__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.25rem; font-weight: 800; color: #1c3370; margin: 0 0 12px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-rbl-diff__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.975rem; line-height: 1.7; color: #525f7f; margin: 0; }
  .cd-rbl-diff__closer { margin: 44px auto 0 auto; max-width: 820px; text-align: center; padding: 26px 32px; background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(239,102,50,0.06) 100%); border-radius: 12px; border: 1px solid #e6ecf5; }
  .cd-rbl-diff__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #25418b; margin: 0; font-weight: 500; }
  @media (max-width: 980px) {
    .cd-rbl-diff__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 620px) {
    .cd-rbl-diff__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-rbl-diff__card { padding: 26px 22px; }
    .cd-rbl-diff__closer { padding: 22px 20px; }
  }
</style>
<div class="cd-rbl-diff">
  <p class="cd-rbl-diff__intro" data-field="intro">{{intro}}</p>
  <div class="cd-rbl-diff__grid">
    <div class="cd-rbl-diff__card" data-repeat="differentiators">
      <div class="cd-rbl-diff__icon"><span class="material-icons" data-field="icon">{{differentiators.icon}}</span></div>
      <h3 class="cd-rbl-diff__title" data-field="title">{{differentiators.title}}</h3>
      <p class="cd-rbl-diff__desc" data-field="desc">{{differentiators.desc}}</p>
    </div>
  </div>
  <div class="cd-rbl-diff__closer">
    <p class="cd-rbl-diff__closer-text" data-field="closer">{{closer}}</p>
  </div>
</div>
`.trim();

  const DIFF_DEFAULTS = {
    intro:
      'Revenue-based loans (RBL) let businesses repay financing in flexible payment amounts tied to their current revenue — so the loan adapts to your performance, not the other way around.',
    differentiators: [
      {
        icon: 'tune',
        title: 'Flexible Repayment',
        desc: 'Payment amounts scale with your monthly revenue, easing the squeeze during slow months and accelerating payoff in peak season.',
      },
      {
        icon: 'trending_up',
        title: 'Revenue-Tied Payments',
        desc: 'Repayment is calculated as a percentage of sales, so you never owe more than your business is actively bringing in.',
      },
      {
        icon: 'storefront',
        title: 'Built for Variable Income',
        desc: 'Ideal for retail, restaurants, and e-commerce businesses with fluctuating cash flow that need capital without a rigid fixed schedule.',
      },
    ],
    closer:
      'If you’re specifically looking for products that rely on sales-based repayment, revenue-based business loans should be at the top of your list.',
  } as const;

  const diffBlock = {
    id: 'sec-2-diff',
    type: 'html-render' as const,
    width: 'full' as const,
    order: 3,
    html: DIFF_HTML,
    fields: [
      { name: 'intro', label: 'Intro paragraph', type: 'textarea' as const, default: DIFF_DEFAULTS.intro },
      {
        name: 'differentiators',
        label: 'Differentiator cards',
        type: 'array' as const,
        itemFields: [
          { name: 'icon', label: 'Material icon name', type: 'text' as const },
          { name: 'title', label: 'Card title', type: 'text' as const },
          { name: 'desc', label: 'Card description', type: 'textarea' as const },
        ],
      },
      { name: 'closer', label: 'Closing summary', type: 'textarea' as const, default: DIFF_DEFAULTS.closer },
    ],
    values: { ...DIFF_DEFAULTS },
  };

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

  const idx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === TARGET_BLOCK_ID);
  if (idx === -1) {
    console.error(`Post ${POST_ID}: no block with id=${TARGET_BLOCK_ID}; aborting`);
    process.exit(1);
  }
  const sec = parsed.blocks[idx];
  if (sec.type !== 'section') {
    console.error(
      `Post ${POST_ID}: block ${TARGET_BLOCK_ID} is not a section (was ${sec.type}); aborting`,
    );
    process.exit(1);
  }

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
    content: 'What’s Different About Revenue-Based Loans?',
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
      '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  sec.blocks = [headerBlock, dividerBlock, diffBlock];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: sec-2 -> styled 3-card "What's Different About Revenue-Based Loans?" grid.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
