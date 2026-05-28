/**
 * Iter 5: Restyle the "Choosing the Right Type of Funding for Your Goal"
 * section (sec-8) on post 805 (industries-auto-repair).
 *
 * Source: 5 funding-type subsections are currently rendered as a tall stack
 * of H3 + paragraph pairs (Working Capital, Equipment Financing, Revolving
 * Line, Invoice Financing, Long-Term Term Loans) with no visual structure.
 *
 * Port: a responsive icon-card grid (3-up top row, 2-up bottom row that
 * centers on auto-fit) with a brand-tinted background, intro paragraph,
 * 5 cards (each: circular icon chip + h3 title + body copy), and a soft
 * closing band that carries the "act while you're stable" wrap-up line.
 * Brand palette only — deep blue / orange / green accents, no emojis.
 *
 * Idempotent: re-running detects existing html-render block at id
 *   `sec-8-types` and rewrites it; safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 805;
const TARGET_BLOCK_ID = 'sec-8';

const TYPES_HTML = `
<style>
  .cd-ar-typ { max-width: 1180px; margin: 0 auto; }
  .cd-ar-typ__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 760px; margin: 0 auto 48px auto; }
  .cd-ar-typ__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-ar-typ__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 14px; padding: 32px 28px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-ar-typ__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-ar-typ__icon { width: 58px; height: 58px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 20px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-ar-typ__card:nth-child(2) .cd-ar-typ__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-ar-typ__card:nth-child(3) .cd-ar-typ__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-ar-typ__card:nth-child(4) .cd-ar-typ__icon { background: linear-gradient(135deg, #ffb798 0%, #ef6632 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.22); }
  .cd-ar-typ__card:nth-child(5) .cd-ar-typ__icon { background: linear-gradient(135deg, #25418b 0%, #5ac96f 100%); box-shadow: 0 8px 18px rgba(37,65,139,0.22); }
  .cd-ar-typ__icon .material-icons { font-size: 30px; }
  .cd-ar-typ__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.25rem; font-weight: 800; color: #1c3370; margin: 0 0 12px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-ar-typ__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.975rem; line-height: 1.7; color: #525f7f; margin: 0; }
  .cd-ar-typ__closer { margin: 48px auto 0 auto; max-width: 860px; text-align: center; padding: 28px 32px; background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(239,102,50,0.06) 100%); border-radius: 14px; border: 1px solid #e6ecf5; }
  .cd-ar-typ__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #25418b; margin: 0; font-weight: 500; }
  @media (max-width: 980px) {
    .cd-ar-typ__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 620px) {
    .cd-ar-typ__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-ar-typ__card { padding: 26px 22px; }
    .cd-ar-typ__closer { padding: 22px 20px; }
  }
</style>
<div class="cd-ar-typ">
  <p class="cd-ar-typ__intro" data-field="intro">{{intro}}</p>
  <div class="cd-ar-typ__grid">
    <div class="cd-ar-typ__card" data-repeat="types">
      <div class="cd-ar-typ__icon"><span class="material-icons" data-field="icon">{{types.icon}}</span></div>
      <h3 class="cd-ar-typ__title" data-field="title">{{types.title}}</h3>
      <p class="cd-ar-typ__desc" data-field="desc">{{types.desc}}</p>
    </div>
  </div>
  <div class="cd-ar-typ__closer">
    <p class="cd-ar-typ__closer-text" data-field="closer">{{closer}}</p>
  </div>
</div>
`.trim();

const TYPES_DATA = [
  {
    icon: 'payments',
    title: 'Working Capital for Cash Flow',
    desc: "If customer payment timing, fleet invoices, seasonal slowdowns, or parts-heavy repairs squeeze your shop's cash flow, working capital-style funding can keep operations running. A merchant cash advance offers flexible or fixed payments for loans of less than two years, so you can cover a short stretch of expenses without disrupting your schedule.",
  },
  {
    icon: 'build_circle',
    title: 'Equipment-Focused Funding to Drive Revenue',
    desc: 'Equipment financing structures can work well for auto body shops when your goal is adding a lift, upgrading your alignment system, replacing your diagnostic platform, or repairing major shop equipment. Estimate how these assets will impact your capacity or cycle time and compare that additional revenue to your potential monthly payment.',
  },
  {
    icon: 'autorenew',
    title: 'Revolving Access for Ongoing Variability',
    desc: 'A revolving loan option can provide flexibility if you experience recurring cash flow gaps. Our business line of credit allows you to draw a lump sum when needed, pay interest only on what you use, and replenish your credit limit with each payment. Manage multiple commercial accounts with different pay cycles, even when sales volume changes.',
  },
  {
    icon: 'receipt_long',
    title: 'Invoice Financing for Timing Gaps',
    desc: 'When insurance companies or fleet managers take 90 days to make payments, you may need capital to bridge the timing gap. An invoice financing product offers an advance on your accounts receivable so you can cover operating expenses and keep moving forward without missing a step.',
  },
  {
    icon: 'trending_up',
    title: 'Long-Term Products for Growth Projects',
    desc: "Term business loans for auto repair shops work better for investments where you won't see the return for a few years. Projects like expanding bays, upgrading your management software, hiring another technician, or expanding your services need predictable payments and long terms to protect your cash flow while funding your growth.",
  },
];

const DEFAULTS = {
  intro: "Funding products are like the specialized tools in your shop — you need one that fits the job. When you look at auto repair business loans, pay attention to how quickly you can access funds and how you repay the financing. The right funding tool should fit your needs.",
  types: TYPES_DATA,
  closer: "After you determine the funding tool that best matches your goals, move quickly to secure better options. If you apply while you're stable, you have more options for structure and timing — but even under pressure, our streamlined process can get you the capital you need.",
};

const typesBlock = {
  id: 'sec-8-types',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: TYPES_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: DEFAULTS.intro },
    {
      name: 'types',
      label: 'Funding type cards',
      type: 'repeater',
      fields: [
        { name: 'icon', label: 'Material icon name', type: 'text' },
        { name: 'title', label: 'Card title', type: 'text' },
        { name: 'desc', label: 'Card description', type: 'textarea' },
      ],
    },
    { name: 'closer', label: 'Closing summary', type: 'textarea', default: DEFAULTS.closer },
  ],
  values: { ...DEFAULTS },
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

  // Widen so the 3-up card grid breathes.
  sec.maxWidth = '1240px';
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
    content: 'Choosing the Right Type of Funding for Your Goal',
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
    id: 'sec-8-div',
    order: 2,
    content: '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  sec.blocks = [headerBlock, dividerBlock, typesBlock];

  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-8 -> styled 5-card "Choosing the Right Type of Funding" grid.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
