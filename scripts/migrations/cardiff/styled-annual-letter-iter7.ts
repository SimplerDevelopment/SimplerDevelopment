/**
 * Annual Letter iter 7 — Style the unstyled tail of sec-1 ("How Much Cash Do
 * You Need?"). After iters 1-6, sec-1 still trails its already-styled stats
 * widget with a bare H3 + 4 paragraphs (~1140 chars) describing Cardiff's two
 * product lines (equipment financing + working capital). This is the single
 * biggest remaining unstyled chunk on post 794.
 *
 * Iter 7 keeps the existing styled stats widget (sec-1-stats) at the top,
 * keeps the centered iter-1 H2 + orange underline header, and replaces the
 * unstyled tail (sec-1-h3-2 + sec-1-p-6..p-9) with:
 *   1. A new sub-heading + divider for "How Much Cash Do You Need?"
 *   2. A html-render product-card grid driven by data-repeat="products" —
 *      icon chip + title + description per card, brand-rotating accent
 *      (blue for equipment, green for working capital), and a centered
 *      tagline/intro pulled from p-6 + p-7 above the grid.
 *
 * Pattern lifted from styled-equipment-leasing-iter3 + iter6 — converted to
 * 2-card data-repeat layout instead of 3-up.
 *
 * Brand: #1c3370 / #25418b deep blue, #5ac96f green, #ef6632 orange,
 * Raleway + Open Sans. Material Icons only — no emojis.
 *
 * Idempotent: rewrites sec-1.blocks tail wholesale (preserves the stats
 * widget + original header/divider); safe to re-run.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

const POST_ID = 794;
const TARGET_BLOCK_ID = 'sec-1';

const PRODUCTS_HTML = `
<style>
  .cdal7 { max-width: 1080px; margin: 0 auto; }
  .cdal7__intro { text-align: center; color: #25418b; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.4rem; line-height: 1.45; font-weight: 700; margin: 0 auto 12px auto; letter-spacing: -0.005em; max-width: 720px; }
  .cdal7__sub { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; max-width: 720px; margin: 0 auto 44px auto; }
  .cdal7__grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 28px; }
  .cdal7__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 14px; padding: 36px 32px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; border-top: 4px solid #1c3370; }
  .cdal7__card:hover { transform: translateY(-4px); box-shadow: 0 20px 48px rgba(28,51,112,0.14); }
  .cdal7__card:nth-child(2) { border-top-color: #5ac96f; }
  .cdal7__icon { width: 60px; height: 60px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 22px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cdal7__card:nth-child(2) .cdal7__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cdal7__icon .material-icons { font-size: 32px; }
  .cdal7__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.3rem; font-weight: 800; color: #1c3370; margin: 0 0 14px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cdal7__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9875rem; line-height: 1.75; color: #525f7f; margin: 0; }
  @media (max-width: 820px) {
    .cdal7__grid { grid-template-columns: 1fr; gap: 20px; }
    .cdal7__card { padding: 28px 24px; }
    .cdal7__intro { font-size: 1.2rem; }
  }
</style>
<div class="cdal7">
  <p class="cdal7__intro" data-field="intro">{{intro}}</p>
  <p class="cdal7__sub" data-field="sub">{{sub}}</p>
  <div class="cdal7__grid">
    <div class="cdal7__card" data-repeat="products">
      <div class="cdal7__icon"><span class="material-icons" data-field="icon">{{products.icon}}</span></div>
      <h3 class="cdal7__title" data-field="title">{{products.title}}</h3>
      <p class="cdal7__desc" data-field="desc">{{products.desc}}</p>
    </div>
  </div>
</div>
`.trim();

const PRODUCTS_DEFAULTS = {
  intro: 'Cardiff is cash for your business, on your terms.',
  sub: "Owning a business is hard enough. That's why we make it easy to get access to the funds you need to keep it running.",
  products: [
    {
      icon: 'precision_manufacturing',
      title: 'Equipment Financing & Leasing',
      desc: "Business owners need to preserve their precious cash. We help you pay for any type of business equipment as you use it, not in one lump sum. We offer low monthly payments over two to five year terms. We can even roll in soft costs like installation and shipping. You can choose between leasing and financing depending on what you plan to do with the equipment at the end of the term.",
    },
    {
      icon: 'savings',
      title: 'Working Capital Solutions',
      desc: "We help business owners like you solve every day cash flow problems. Payroll, inventory, taxes, improvements, and hiring can all be funded in a matter of minutes with our working capital solutions. We offer estimated terms as short as three months to help you save. We can also go out as far as two years for longer term projects. Our terms and discounts make working with us a no-brainer.",
    },
  ],
};

const productsBlock = {
  id: 'sec-1-products',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 6,
  html: PRODUCTS_HTML,
  fields: [
    { name: 'intro', label: 'Intro tagline', type: 'textarea', default: PRODUCTS_DEFAULTS.intro },
    { name: 'sub', label: 'Sub-tagline', type: 'textarea', default: PRODUCTS_DEFAULTS.sub },
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
  ],
  values: { ...PRODUCTS_DEFAULTS },
};

const TAIL_IDS = new Set([
  'sec-1-h3-2',
  'sec-1-p-6',
  'sec-1-p-7',
  'sec-1-p-8',
  'sec-1-p-9',
  // re-running this script:
  'sec-1-cash-title',
  'sec-1-cash-div',
  'sec-1-products',
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

  // Strip prior tail (bare h3 + paragraphs and any prior iter7 output).
  const kept = (sec.blocks || []).filter((b: any) => !TAIL_IDS.has(b?.id));

  const cashTitleBlock = {
    type: 'heading' as const,
    id: 'sec-1-cash-title',
    order: 4,
    level: 2,
    content: 'How Much Cash Do You Need?',
    alignment: 'center' as const,
    style: {
      color: '#1c3370',
      fontFamily: 'Raleway, -apple-system, BlinkMacSystemFont, sans-serif',
      fontSize: '2.25rem',
      fontWeight: '800',
      letterSpacing: '-0.015em',
      lineHeight: '1.18',
      margin: '56px auto 14px auto',
      maxWidth: '900px',
      textAlign: 'center',
    },
  };
  const cashDivBlock = {
    type: 'text' as const,
    id: 'sec-1-cash-div',
    order: 5,
    content:
      '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };

  sec.blocks = [...kept, cashTitleBlock, cashDivBlock, productsBlock];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: sec-1 -> appended styled 2-card "How Much Cash Do You Need?" product grid.`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
