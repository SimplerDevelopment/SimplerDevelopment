/**
 * Annual Letter iter 11 — Final wall-of-text gap on post 794: sec-3
 * ("Alternative Business Lending With Cardiff"). Iters 1-10 already styled
 * sec-1, sec-2, sec-4..sec-9, leaving sec-3 as the only bare H2 + orange
 * divider + 2 stacked paragraphs band.
 *
 * Strategy mirrors iter 10 (sec-7 steps) and styled-equipment-leasing-iter3
 * (sec-8 why) — keep the centered H2 + orange underline header pattern, then
 * replace the two bare paragraphs with a single html-render block carrying:
 *   - an intro line synthesized from the existing first paragraph (no new
 *     promises), and
 *   - a 4-up icon-card grid (`data-repeat="cases"`) for the four real-world
 *     scenarios already enumerated in sec-3-p-3: scaling, upgrading
 *     equipment, handling seasonal fluctuations, and navigating the
 *     unpredictability of entrepreneurship.
 *
 * Card copy is strictly drawn from claims already on this same page (sec-3
 * + sec-4 fund cards + sec-1 stats); no net-new claims.
 *
 * Idempotent: re-running rewrites sec-3.blocks wholesale; safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 794;
const TARGET_BLOCK_ID = 'sec-3';

const CASES_HTML = `
<style>
  .cd-al-cases { max-width: 1140px; margin: 0 auto; }
  .cd-al-cases__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 780px; margin: 0 auto 48px auto; }
  .cd-al-cases__grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 22px; }
  .cd-al-cases__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 30px 24px 26px 24px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-al-cases__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-al-cases__icon { width: 52px; height: 52px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 16px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-al-cases__card:nth-child(2) .cd-al-cases__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-al-cases__card:nth-child(3) .cd-al-cases__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-al-cases__card:nth-child(4) .cd-al-cases__icon { background: linear-gradient(135deg, #ffb798 0%, #ef6632 100%); box-shadow: 0 8px 18px rgba(255,183,152,0.32); }
  .cd-al-cases__icon .material-icons { font-size: 28px; }
  .cd-al-cases__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.125rem; font-weight: 800; color: #1c3370; margin: 0 0 10px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-al-cases__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; line-height: 1.65; color: #525f7f; margin: 0; }
  .cd-al-cases__closer { margin: 44px auto 0 auto; max-width: 820px; text-align: center; padding: 26px 32px; background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(239,102,50,0.06) 100%); border-radius: 12px; border: 1px solid #e6ecf5; }
  .cd-al-cases__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #25418b; margin: 0; font-weight: 500; }
  @media (max-width: 1080px) {
    .cd-al-cases__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 620px) {
    .cd-al-cases__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-al-cases__card { padding: 24px 20px; }
    .cd-al-cases__closer { padding: 22px 20px; }
  }
</style>
<div class="cd-al-cases">
  <p class="cd-al-cases__intro" data-field="intro">{{intro}}</p>
  <div class="cd-al-cases__grid">
    <div class="cd-al-cases__card" data-repeat="cases">
      <div class="cd-al-cases__icon"><span class="material-icons" data-field="icon">{{cases.icon}}</span></div>
      <h3 class="cd-al-cases__card-title" data-field="title">{{cases.title}}</h3>
      <p class="cd-al-cases__card-desc" data-field="desc">{{cases.desc}}</p>
    </div>
  </div>
  <div class="cd-al-cases__closer">
    <p class="cd-al-cases__closer-text" data-field="closer">{{closer}}</p>
  </div>
</div>
`.trim();

const CASES_DEFAULTS = {
  intro:
    "If you're exploring alternative business lending options because traditional lenders turned down your business or you can't wait for rigid loan approval processes, you're in the right place.",
  cases: [
    {
      icon: 'trending_up',
      title: 'Scaling Up',
      desc: 'Open a new location, hire ahead of demand, or invest in marketing — without putting growth on hold while you wait on a bank.',
    },
    {
      icon: 'precision_manufacturing',
      title: 'Upgrading Equipment',
      desc: 'Replace aging tools or add new capacity so you can take on the work your current setup is leaving on the table.',
    },
    {
      icon: 'calendar_month',
      title: 'Seasonal Fluctuations',
      desc: 'Bridge slow stretches with repayment structures that flex with your revenue cycles, so cash flow stays steady year-round.',
    },
    {
      icon: 'insights',
      title: 'Unexpected Opportunities',
      desc: 'Navigate the unpredictability of entrepreneurship — fund a surprise bulk order, urgent repair, or one-off opening the moment it appears.',
    },
  ],
  closer:
    'Cardiff specializes in fast, flexible financing designed for real-world business needs — tailored financial products that help you keep moving forward.',
} as const;

const casesBlock = {
  id: 'sec-3-cases',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: CASES_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: CASES_DEFAULTS.intro },
    {
      name: 'cases',
      label: 'Real-world use cases',
      type: 'repeater',
      itemFields: [
        { name: 'icon', label: 'Material icon name', type: 'text' },
        { name: 'title', label: 'Title', type: 'text' },
        { name: 'desc', label: 'Description', type: 'textarea' },
      ],
      default: CASES_DEFAULTS.cases,
    },
    { name: 'closer', label: 'Closing reassurance', type: 'textarea', default: CASES_DEFAULTS.closer },
  ],
  values: { ...CASES_DEFAULTS },
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
    console.error(
      `Post ${POST_ID}: block ${TARGET_BLOCK_ID} is not a section (was ${sec.type}); aborting`,
    );
    process.exit(1);
  }

  // Widen so the 4-col card grid breathes; soft-blue band matches iter 9/10.
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
    id: 'sec-3-title',
    order: 1,
    level: 2,
    content: 'Alternative Business Lending With Cardiff',
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
    id: 'sec-3-div',
    order: 2,
    content:
      '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  sec.blocks = [headerBlock, dividerBlock, casesBlock];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-3 -> styled 4-card "Real-World Use Cases" grid.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
