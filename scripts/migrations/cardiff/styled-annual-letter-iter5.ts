/**
 * Annual Letter iter 5 — Style the "Financing Designed for Your Business
 * Model" section (sec-5) on post 794. After iters 1-4, this is the single
 * largest remaining unstyled section: 14 sub-blocks comprising one H2, three
 * intro paragraphs, four H4+paragraph product pairs, and a closing line —
 * currently rendered as a bare wall of text.
 *
 * Iter 5 replaces sec-5 sub-blocks with:
 *   1. Centered H2 + orange underline (same pattern as iters 1-4).
 *   2. A centered intro paragraph stack.
 *   3. A single html-render block carrying a 4-up product card grid driven
 *      by data-repeat="products" — icon chip + title + description per card.
 *      Pattern lifted from styled-equipment-leasing-iter3 (icon-card grid),
 *      converted to a data-repeat array so editors can add/remove products
 *      without re-scaffolding HTML.
 *   4. A closer gradient panel summarizing the offering.
 *
 * Brand: #1c3370 / #25418b deep blue, #5ac96f green, #ef6632 orange,
 * Raleway + Open Sans. Material Icons only — no emojis.
 *
 * Idempotent: re-running rewrites sec-5.blocks wholesale; safe to re-run.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

const POST_ID = 794;
const TARGET_BLOCK_ID = 'sec-5';

const PRODUCTS_HTML = `
<style>
  .cdal5 { max-width: 1140px; margin: 0 auto; }
  .cdal5__lead { text-align: center; color: #1c3370; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.05rem; line-height: 1.6; font-weight: 600; max-width: 760px; margin: 0 auto 40px auto; }
  .cdal5__grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; }
  .cdal5__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 14px; padding: 34px 30px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; border-top: 4px solid #1c3370; }
  .cdal5__card:hover { transform: translateY(-4px); box-shadow: 0 20px 48px rgba(28,51,112,0.14); }
  .cdal5__card:nth-child(2) { border-top-color: #ef6632; }
  .cdal5__card:nth-child(3) { border-top-color: #5ac96f; }
  .cdal5__card:nth-child(4) { border-top-color: #25418b; }
  .cdal5__icon { width: 58px; height: 58px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 20px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cdal5__card:nth-child(2) .cdal5__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cdal5__card:nth-child(3) .cdal5__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cdal5__card:nth-child(4) .cdal5__icon { background: linear-gradient(135deg, #25418b 0%, #142658 100%); box-shadow: 0 8px 18px rgba(37,65,139,0.28); }
  .cdal5__icon .material-icons { font-size: 30px; }
  .cdal5__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.2rem; font-weight: 800; color: #1c3370; margin: 0 0 12px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cdal5__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.975rem; line-height: 1.7; color: #525f7f; margin: 0; }
  .cdal5__closer { margin: 44px auto 0 auto; max-width: 820px; text-align: center; padding: 26px 32px; background: linear-gradient(135deg, rgba(28,51,112,0.05) 0%, rgba(239,102,50,0.07) 100%); border-radius: 12px; border: 1px solid #e6ecf5; }
  .cdal5__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #25418b; margin: 0; font-weight: 500; }
  @media (max-width: 820px) {
    .cdal5__grid { grid-template-columns: 1fr; gap: 18px; }
    .cdal5__card { padding: 28px 24px; }
    .cdal5__closer { padding: 22px 20px; }
  }
</style>
<div class="cdal5">
  <p class="cdal5__lead" data-field="lead">{{lead}}</p>
  <p class="cdal5__lead" data-field="industries">{{industries}}</p>
  <p class="cdal5__lead" data-field="leadIn">{{leadIn}}</p>
  <div class="cdal5__grid">
    <div class="cdal5__card" data-repeat="products">
      <div class="cdal5__icon"><span class="material-icons" data-field="icon">{{products.icon}}</span></div>
      <h3 class="cdal5__title" data-field="title">{{products.title}}</h3>
      <p class="cdal5__desc" data-field="desc">{{products.desc}}</p>
    </div>
  </div>
  <div class="cdal5__closer">
    <p class="cdal5__closer-text" data-field="closer">{{closer}}</p>
  </div>
</div>
`.trim();

const PRODUCTS_DEFAULTS = {
  lead:
    "No two businesses run the same way or have the same financial needs. Meeting the varied needs of our clients means offering flexible financing options. Cardiff's product suite has a solution to meet your goals — whether you're seeking business loans for expansion, ordering inventory for the busy season, responding to a dip in revenue, or need to unlock working capital fast.",
  industries:
    'We support a range of industries, including retail, healthcare, construction, hospitality, and professional services. Our financing addresses unique business needs such as cash flow timing, seasonal gaps, and time-sensitive opportunities.',
  leadIn: 'Many of our loans tailor to the needs of the small businesses we serve, including:',
  closer: 'Our loan options help maximize your operational flexibility while minimizing friction.',
  products: [
    {
      icon: 'trending_up',
      title: 'Revenue-Based Business Loans',
      desc: 'Merchant capital advances (MCAs) and invoice financing tie repayment to your income cycle. Payments stay manageable because they fluctuate with your income.',
    },
    {
      icon: 'verified_user',
      title: 'Unsecured Business Loans',
      desc: "With no collateral requirement and an emphasis on strong business fundamentals, Cardiff's MCAs, term loans, credit cards, and lines of credit are more attainable for small businesses.",
    },
    {
      icon: 'waves',
      title: 'Cash Flow Lending for Businesses',
      desc: "Your past doesn't define you. If the future looks promising, we can help you maintain smooth operations with funding aligned to your revenue patterns.",
    },
    {
      icon: 'storefront',
      title: 'Merchant Financing',
      desc: 'We can help you turn future transactions into the working capital you need now. A Cardiff MCA provides the money you need upfront with manageable payments based on your income.',
    },
  ],
};

const productsBlock = {
  id: 'sec-5-products',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: PRODUCTS_HTML,
  fields: [
    { name: 'lead', label: 'Lead paragraph', type: 'textarea', default: PRODUCTS_DEFAULTS.lead },
    {
      name: 'industries',
      label: 'Industries paragraph',
      type: 'textarea',
      default: PRODUCTS_DEFAULTS.industries,
    },
    { name: 'leadIn', label: 'Lead-in line', type: 'text', default: PRODUCTS_DEFAULTS.leadIn },
    {
      name: 'products',
      label: 'Product cards',
      type: 'array',
      itemFields: [
        { name: 'icon', type: 'text', label: 'Material icon name' },
        { name: 'title', type: 'text', label: 'Product title' },
        { name: 'desc', type: 'textarea', label: 'Product description' },
      ],
    },
    { name: 'closer', label: 'Closing line', type: 'textarea', default: PRODUCTS_DEFAULTS.closer },
  ],
  values: { ...PRODUCTS_DEFAULTS },
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

  // Widen + tint so the section reads as a discrete product band.
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
    id: 'sec-5-title',
    order: 1,
    level: 2,
    content: 'Financing Designed for Your Business Model',
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
    id: 'sec-5-div',
    order: 2,
    content:
      '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };

  sec.blocks = [headerBlock, dividerBlock, productsBlock];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: sec-5 -> styled 4-card "Financing Designed for Your Business Model" product grid.`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
