/**
 * Iter 6: Restyle "Not Your Average Small Business Lender" (sec-6)
 * on post 800 (business-loans). Currently 3 long bare paragraphs stacked
 * in a narrow column, followed by a broken card-grid where titles were
 * accidentally split from descriptions ("Revenue" / "Based Repayment
 * Plans...") because the source was an em-dash bulleted list mis-parsed
 * during import.
 *
 * We replace sec-6's sub-blocks (after the heading + divider) with:
 *   - centered intro paragraph carrying the "we treat SMBs differently"
 *     thesis (consolidates p-2 + p-3)
 *   - one html-render: a 3-up icon-card grid of the alternative loan
 *     products Cardiff offers (Invoice Financing, Revenue-Based
 *     Repayment, Short-Term Working Capital) using data-repeat so the
 *     card list is editable as an array
 *   - closer band restating the "we go beyond standard loans" line
 *
 * Pattern lifted from styled-equipment-leasing-iter3.ts (icon-card grid
 * on light-blue background) but condensed to 3 cards and using
 * data-repeat to make the products list array-editable.
 *
 * Idempotent: re-running detects existing html-render block at id
 *   `sec-6-products` and rewrites it; safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 800;
const TARGET_BLOCK_ID = 'sec-6';

const PRODUCTS_HTML = `
<style>
  .cd-bl-alt { max-width: 1140px; margin: 0 auto; }
  .cd-bl-alt__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 780px; margin: 0 auto 40px auto; }
  .cd-bl-alt__lead { text-align: center; color: #25418b; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1rem; line-height: 1.65; max-width: 720px; margin: 0 auto 36px auto; font-weight: 600; }
  .cd-bl-alt__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-bl-alt__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 30px 26px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-bl-alt__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-bl-alt__icon { width: 54px; height: 54px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-bl-alt__card:nth-child(2) .cd-bl-alt__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-bl-alt__card:nth-child(3) .cd-bl-alt__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-bl-alt__icon .material-icons { font-size: 28px; }
  .cd-bl-alt__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.1875rem; font-weight: 800; color: #1c3370; margin: 0 0 12px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-bl-alt__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; line-height: 1.7; color: #525f7f; margin: 0; }
  .cd-bl-alt__closer { margin: 44px auto 0 auto; max-width: 820px; text-align: center; padding: 26px 32px; background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(239,102,50,0.06) 100%); border-radius: 12px; border: 1px solid #e6ecf5; }
  .cd-bl-alt__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #25418b; margin: 0; font-weight: 500; }
  @media (max-width: 980px) {
    .cd-bl-alt__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 620px) {
    .cd-bl-alt__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-bl-alt__card { padding: 24px 22px; }
    .cd-bl-alt__closer { padding: 22px 20px; }
  }
</style>
<div class="cd-bl-alt">
  <p class="cd-bl-alt__intro" data-field="intro">{{intro}}</p>
  <p class="cd-bl-alt__lead" data-field="lead">{{lead}}</p>
  <div class="cd-bl-alt__grid">
    <div class="cd-bl-alt__card" data-repeat="products">
      <div class="cd-bl-alt__icon"><span class="material-icons" data-field="icon">{{products.icon}}</span></div>
      <h3 class="cd-bl-alt__card-title" data-field="title">{{products.title}}</h3>
      <p class="cd-bl-alt__card-desc" data-field="description">{{products.description}}</p>
    </div>
  </div>
  <div class="cd-bl-alt__closer">
    <p class="cd-bl-alt__closer-text" data-field="closer">{{closer}}</p>
  </div>
</div>
`.trim();

const PRODUCTS_DEFAULTS = {
  intro:
    "Traditional banks tend to treat small businesses as high-risk borrowers, especially if they have limited credit history or a less-than-stellar score. Cardiff knows better — we regularly finance small businesses and treat your credit score as just one data point alongside cash flow and day-to-day operations.",
  lead:
    "Just because the bank denied your loan or your revenue is inconsistent doesn’t mean you’re out of options. Cardiff offers a broad suite of loan products designed for small businesses at every stage:",
  closer:
    "From low credit thresholds to revenue-based qualification, we look beyond past financial shortfalls. Healthy revenue and a promising plan are stronger signals of repayment than a credit score alone.",
  products: [
    {
      icon: 'receipt_long',
      title: 'Invoice Financing',
      description:
        'Free up capital tied up in unpaid invoices. Convert outstanding receivables into working capital so payroll, payables, and growth never wait on a slow-paying customer.',
    },
    {
      icon: 'trending_up',
      title: 'Revenue-Based Repayment',
      description:
        'Repayments scale with your sales volume. Pay more in strong months, less when revenue dips — a structure that breathes with your business instead of fighting it.',
    },
    {
      icon: 'bolt',
      title: 'Short-Term Working Capital',
      description:
        'Handle urgent needs without long-term debt. Cover inventory pushes, seasonal gaps, and time-sensitive opportunities with funding sized to the moment.',
    },
  ],
};

const productsBlock = {
  id: 'sec-6-products',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: PRODUCTS_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: PRODUCTS_DEFAULTS.intro },
    { name: 'lead', label: 'Lead-in line above cards', type: 'textarea', default: PRODUCTS_DEFAULTS.lead },
    {
      name: 'products',
      label: 'Alternative loan products',
      type: 'array',
      itemFields: [
        { name: 'icon', type: 'text', label: 'Material icon name' },
        { name: 'title', type: 'text', label: 'Product title' },
        { name: 'description', type: 'textarea', label: 'Product description' },
      ],
      default: PRODUCTS_DEFAULTS.products,
    },
    { name: 'closer', label: 'Closing summary', type: 'textarea', default: PRODUCTS_DEFAULTS.closer },
  ],
  values: { ...PRODUCTS_DEFAULTS },
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

  // Widen so the 3-col card grid breathes (was 880px).
  sec.maxWidth = '1200px';
  // Soft blue-tinted backdrop to set this band apart from neighbors.
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
    id: 'sec-6-title',
    order: 1,
    level: 2,
    content: 'Not Your Average Small Business Lender',
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
    id: 'sec-6-div',
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
    `Updated post ${POST_ID}: sec-6 -> styled 3-card "Not Your Average Lender" products grid.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
