/**
 * Iter 4: Restyle sec-3 of post 828 (revenue-based-business-loans) — the
 * "Are Revenue-Based Loans, MCA, and Cash Flow Lending the Same?" comparison
 * band. This is by far the largest remaining unstyled section: 36 child
 * blocks (3 sub-products × { H3 + H4 + 3 paragraphs + 3 card-grids }) with
 * no visual structure or visual hierarchy distinguishing the products.
 *
 * We collapse the 36 stub blocks into:
 *   1. Centered H2 + orange underline (matches sibling iter2 / iter3)
 *   2. A single html-render block with intro + 3 product cards in a vertical
 *      stack. Each product card uses data-repeat="products" so editors can
 *      add/remove/reorder products as a list (`{{products.field}}` inside
 *      the loop). Each card has:
 *        - Numbered chip (01/02/03) + product title + tag color rail
 *        - "How it Works" narrative paragraphs
 *        - 3 sub-lists: Key Features (with icons + descriptions),
 *          Best For (bullet pills), Pros (check rows)
 *
 * Brand palette only — deep blue (#1c3370 / #25418b), green (#5ac96f),
 * orange (#ef6632), pink-accent (#ffb798). No emojis — Material Icons.
 *
 * Idempotent: re-running rewrites sec-3's sub-blocks to the same 3-element
 * shape (header + divider + html-render at id `sec-3-compare`). Safe to
 * re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 828;
const TARGET_BLOCK_ID = 'sec-3';

const COMPARE_HTML = `
<style>
  .cd-rb-cmp { max-width: 1140px; margin: 0 auto; }
  .cd-rb-cmp__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 820px; margin: 0 auto 56px auto; }
  .cd-rb-cmp__stack { display: flex; flex-direction: column; gap: 32px; }
  .cd-rb-cmp__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 16px; padding: 40px 44px; box-shadow: 0 16px 40px rgba(28,51,112,0.07); position: relative; overflow: hidden; }
  .cd-rb-cmp__card::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 6px; background: linear-gradient(180deg, #25418b 0%, #1c3370 100%); }
  .cd-rb-cmp__card:nth-child(2)::before { background: linear-gradient(180deg, #ef6632 0%, #d8501e 100%); }
  .cd-rb-cmp__card:nth-child(3)::before { background: linear-gradient(180deg, #5ac96f 0%, #3aa856 100%); }
  .cd-rb-cmp__head { display: flex; align-items: center; gap: 18px; margin: 0 0 24px 0; padding: 0 0 22px 0; border-bottom: 1px solid #eef2f7; }
  .cd-rb-cmp__num { width: 52px; height: 52px; border-radius: 12px; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; display: flex; align-items: center; justify-content: center; font-family: 'Raleway', sans-serif; font-weight: 800; font-size: 1.125rem; letter-spacing: 0.02em; flex-shrink: 0; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-rb-cmp__card:nth-child(2) .cd-rb-cmp__num { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-rb-cmp__card:nth-child(3) .cd-rb-cmp__num { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-rb-cmp__title { font-family: 'Raleway', sans-serif; font-size: 1.5rem; font-weight: 800; color: #1c3370; margin: 0; letter-spacing: -0.01em; line-height: 1.2; }
  .cd-rb-cmp__how-label { font-family: 'Raleway', sans-serif; font-size: 0.75rem; font-weight: 700; color: #ef6632; letter-spacing: 0.14em; text-transform: uppercase; margin: 0 0 12px 0; }
  .cd-rb-cmp__how-body { font-family: 'Open Sans', sans-serif; font-size: 1rem; line-height: 1.75; color: #525f7f; margin: 0 0 14px 0; }
  .cd-rb-cmp__how-body:last-of-type { margin-bottom: 32px; }
  .cd-rb-cmp__sub { margin: 0 0 28px 0; }
  .cd-rb-cmp__sub:last-child { margin-bottom: 0; }
  .cd-rb-cmp__sub-label { font-family: 'Raleway', sans-serif; font-size: 1.0625rem; font-weight: 800; color: #1c3370; margin: 0 0 16px 0; display: flex; align-items: center; gap: 10px; }
  .cd-rb-cmp__sub-label .material-icons { font-size: 22px; color: #25418b; }
  .cd-rb-cmp__card:nth-child(2) .cd-rb-cmp__sub-label .material-icons { color: #ef6632; }
  .cd-rb-cmp__card:nth-child(3) .cd-rb-cmp__sub-label .material-icons { color: #3aa856; }
  .cd-rb-cmp__features { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .cd-rb-cmp__feature { background: #f6f9fc; border: 1px solid #eef2f7; border-radius: 10px; padding: 20px 22px; }
  .cd-rb-cmp__feature-icon { width: 38px; height: 38px; border-radius: 9px; background: rgba(37,65,139,0.10); color: #25418b; display: flex; align-items: center; justify-content: center; margin: 0 0 12px 0; }
  .cd-rb-cmp__card:nth-child(2) .cd-rb-cmp__feature-icon { background: rgba(239,102,50,0.12); color: #ef6632; }
  .cd-rb-cmp__card:nth-child(3) .cd-rb-cmp__feature-icon { background: rgba(90,201,111,0.16); color: #3aa856; }
  .cd-rb-cmp__feature-icon .material-icons { font-size: 22px; }
  .cd-rb-cmp__feature-title { font-family: 'Raleway', sans-serif; font-size: 1rem; font-weight: 700; color: #1c3370; margin: 0 0 6px 0; line-height: 1.3; }
  .cd-rb-cmp__feature-desc { font-family: 'Open Sans', sans-serif; font-size: 0.9rem; line-height: 1.6; color: #525f7f; margin: 0; }
  .cd-rb-cmp__pills { display: flex; flex-wrap: wrap; gap: 10px; }
  .cd-rb-cmp__pill { background: #ffffff; border: 1px solid #d8e1ee; border-radius: 999px; padding: 9px 16px; font-family: 'Open Sans', sans-serif; font-size: 0.9rem; line-height: 1.4; color: #25418b; }
  .cd-rb-cmp__pros { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .cd-rb-cmp__pro { display: flex; align-items: flex-start; gap: 10px; background: rgba(90,201,111,0.08); border: 1px solid rgba(90,201,111,0.22); border-radius: 10px; padding: 14px 16px; }
  .cd-rb-cmp__pro .material-icons { color: #3aa856; font-size: 20px; flex-shrink: 0; margin-top: 1px; }
  .cd-rb-cmp__pro-text { font-family: 'Open Sans', sans-serif; font-size: 0.925rem; line-height: 1.5; color: #25418b; }
  @media (max-width: 980px) {
    .cd-rb-cmp__card { padding: 32px 28px; }
    .cd-rb-cmp__features { grid-template-columns: repeat(2, 1fr); }
    .cd-rb-cmp__pros { grid-template-columns: 1fr; }
  }
  @media (max-width: 620px) {
    .cd-rb-cmp__card { padding: 26px 22px; }
    .cd-rb-cmp__head { gap: 14px; }
    .cd-rb-cmp__num { width: 44px; height: 44px; font-size: 1rem; }
    .cd-rb-cmp__title { font-size: 1.25rem; }
    .cd-rb-cmp__features { grid-template-columns: 1fr; }
  }
</style>
<div class="cd-rb-cmp">
  <p class="cd-rb-cmp__intro" data-field="intro">{{intro}}</p>
  <div class="cd-rb-cmp__stack">
    <div class="cd-rb-cmp__card" data-repeat="products">
      <div class="cd-rb-cmp__head">
        <div class="cd-rb-cmp__num" data-field="products.num">{{products.num}}</div>
        <h3 class="cd-rb-cmp__title" data-field="products.title">{{products.title}}</h3>
      </div>
      <p class="cd-rb-cmp__how-label">How It Works</p>
      <p class="cd-rb-cmp__how-body" data-field="products.how1">{{products.how1}}</p>
      <p class="cd-rb-cmp__how-body" data-field="products.how2">{{products.how2}}</p>
      <p class="cd-rb-cmp__how-body" data-field="products.how3">{{products.how3}}</p>
      <div class="cd-rb-cmp__sub">
        <p class="cd-rb-cmp__sub-label"><span class="material-icons">star</span><span data-field="products.featuresLabel">{{products.featuresLabel}}</span></p>
        <div class="cd-rb-cmp__features">
          <div class="cd-rb-cmp__feature" data-repeat="products.features">
            <div class="cd-rb-cmp__feature-icon"><span class="material-icons" data-field="products.features.icon">{{products.features.icon}}</span></div>
            <h4 class="cd-rb-cmp__feature-title" data-field="products.features.title">{{products.features.title}}</h4>
            <p class="cd-rb-cmp__feature-desc" data-field="products.features.desc">{{products.features.desc}}</p>
          </div>
        </div>
      </div>
      <div class="cd-rb-cmp__sub">
        <p class="cd-rb-cmp__sub-label"><span class="material-icons">business_center</span><span data-field="products.bestForLabel">{{products.bestForLabel}}</span></p>
        <div class="cd-rb-cmp__pills">
          <span class="cd-rb-cmp__pill" data-repeat="products.bestFor" data-field="products.bestFor.text">{{products.bestFor.text}}</span>
        </div>
      </div>
      <div class="cd-rb-cmp__sub">
        <p class="cd-rb-cmp__sub-label"><span class="material-icons">thumb_up</span>Pros</p>
        <div class="cd-rb-cmp__pros">
          <div class="cd-rb-cmp__pro" data-repeat="products.pros">
            <span class="material-icons">check_circle</span>
            <span class="cd-rb-cmp__pro-text" data-field="products.pros.text">{{products.pros.text}}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
`.trim();

const COMPARE_DEFAULTS = {
  intro: 'On the surface revenue-based financing, merchant cash advance (MCA), and cash flow lending may look the same. They all offer flexible business financing options that can tie repayment to your business’s revenue. However, each has distinct features that let each funding type serve different purposes. The best one for your business will depend on your particular circumstances. Here’s a breakdown to help you decide which one is right for your business.',
  products: [
    {
      num: '01',
      title: 'Merchant Cash Advance (MCA)',
      how1: 'An MCA is an advance on your future revenue (often credit card sales). Typically, you receive a lump sum up front and repay that amount as a percentage of daily, weekly, or monthly transactions until you satisfy the debt, including any interest owed. At Cardiff, this repayment can also take the form of fixed payments, if you prefer payment predictability.',
      how2: 'One of the standout features of MCA is that repayment can adjust based on sales. If sales are slow, your payment adjusts down. When sales rise, your payment will increase as well, helping you repay the loan faster.',
      how3: 'With a Cardiff MCA, you gain the added benefit of having the remaining interest on the advance forgiven if you repay it early. If you need more capital before you repay it, you can apply for another MCA on top of the original advance.',
      featuresLabel: 'Key Features of MCA',
      features: [
        { icon: 'bolt', title: 'Fast Access to Funds', desc: 'Applicants typically receive approval in minutes and funding the same day.' },
        { icon: 'autorenew', title: 'Easy Repayment', desc: 'We can auto-deduct payments (as a fixed percentage of sales) from your transactions.' },
        { icon: 'trending_up', title: 'No Fixed Repayment Amount', desc: 'The more you sell, the faster you pay; slower sales result in smaller payments. You can also choose fixed monthly payments.' },
      ],
      bestForLabel: 'MCAs Are Best For',
      bestFor: [
        { text: 'Businesses with a large percentage of income through sales' },
        { text: 'Companies in industries with fluctuating sales, like restaurants, retail, or online stores' },
        { text: 'Businesses that need a quick influx of capital to cover a short-term financial gap' },
      ],
      pros: [
        { text: 'Quick approval and access to cash' },
        { text: 'No collateral required' },
        { text: 'Flexible repayment schedules, fixed or adjustable tied to sales' },
      ],
    },
    {
      num: '02',
      title: 'Cash Flow Lending',
      how1: 'Rather than focus on credit card transactions, cash flow lending considers your business’s entire financial picture, such as monthly revenue, profit margins, and overall cash management to determine a loan amount that aligns with your business’s performance and capacity to repay.',
      how2: 'This broader approach opens the door to a wider range of businesses, including those that don’t rely heavily on card sales but still generate consistent income. The repayment structure for cash flow loans is often fixed daily, weekly, or monthly payments.',
      how3: 'Cardiff aims to make capital accessible without forcing you into terms that limit your ability to seize financial or growth opportunities. By evaluating your company’s real financial activity rather than just credit history, Cardiff’s cash flow loans provide a practical path to working capital — especially for businesses that are growing, seasonal, or in the midst of reinvestment.',
      featuresLabel: 'Key Features of Cash Flow Lending',
      features: [
        { icon: 'account_balance', title: 'Loan Amount Based on Cash Flow', desc: 'Cardiff considers your overall cash inflow, not just credit card sales, for approval and loan amounts.' },
        { icon: 'tune', title: 'Flexible Repayment', desc: 'Payments adjust with your cash flow, offering more flexibility than traditional loans.' },
        { icon: 'public', title: 'Broadly Accessible Funding', desc: 'Businesses with consistent income from sources other than sales can apply and qualify.' },
      ],
      bestForLabel: 'Cash Flow Lending Is Best For',
      bestFor: [
        { text: 'Businesses with diverse revenue sources (e.g., retail, service, or manufacturing)' },
        { text: 'Companies with strong, consistent cash flow but potentially seasonal fluctuations' },
        { text: 'Businesses that need quick access to operating capital to bridge cash flow gaps' },
      ],
      pros: [
        { text: 'Doesn’t require specific revenue streams like credit or debit card sales' },
        { text: 'Flexible, adaptable repayment tied to cash flow' },
        { text: 'Quick, easy access to funds' },
      ],
    },
    {
      num: '03',
      title: 'Revenue-Based Loans',
      how1: 'A revenue-based business loan gives business owners access to capital that scales with performance. You’ll receive the capital you need now, and repay it automatically as a fixed percentage of your revenue until you satisfy the agreed-upon total. Loan payments adjust based on your actual revenue, keeping payments manageable even when sales fluctuate.',
      how2: 'A revenue-based loan is based on your current revenue and future income projections. If your business generates solid income through online sales, invoice payments, or recurring subscriptions, you may qualify. That makes revenue-based loans a strong option for service providers, e-commerce businesses, and companies with mixed or variable revenue sources.',
      how3: 'Cardiff’s revenue-based business loans move quickly. Many clients receive same-day approvals and funds. And because repayment aligns with your income, you can invest in marketing, inventory, or expansion without the pressure of fixed monthly payments. It allows you to manage cash flow more effectively while maintaining your business’s momentum.',
      featuresLabel: 'Key Features of Revenue-Based Loans',
      features: [
        { icon: 'trending_up', title: 'Repayment Tied to Overall Revenue', desc: 'Payments adjust to match fluctuations in sales or income, eliminating the burden of fixed monthly payments.' },
        { icon: 'lock_open', title: 'No Collateral Required', desc: 'Loan approval is based purely on your business’s ability to generate revenue.' },
        { icon: 'wb_sunny', title: 'Ideal for Seasonal Businesses', desc: 'Revenue-based loans are well-suited for companies with fluctuating income because they scale with your earnings.' },
      ],
      bestForLabel: 'Revenue-Based Loans Are Best For',
      bestFor: [
        { text: 'Businesses with irregular revenue or those in seasonal industries (e.g., tourism)' },
        { text: 'Companies that need flexible repayments that adjust to their cash flow' },
        { text: 'Businesses that need a financial boost to increase existing revenue streams' },
      ],
      pros: [
        { text: 'No collateral required' },
        { text: 'Flexible repayments based on actual revenue' },
        { text: 'Ideal for businesses with seasonal fluctuations or unpredictable income' },
      ],
    },
  ],
} as const;

const compareBlock = {
  id: 'sec-3-compare',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: COMPARE_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: COMPARE_DEFAULTS.intro },
    {
      name: 'products',
      label: 'Loan products to compare',
      type: 'repeater',
      fields: [
        { name: 'num', label: 'Card number (e.g. 01)', type: 'text' },
        { name: 'title', label: 'Product title', type: 'text' },
        { name: 'how1', label: 'How it works — paragraph 1', type: 'textarea' },
        { name: 'how2', label: 'How it works — paragraph 2', type: 'textarea' },
        { name: 'how3', label: 'How it works — paragraph 3', type: 'textarea' },
        { name: 'featuresLabel', label: 'Key features section label', type: 'text' },
        {
          name: 'features',
          label: 'Key features',
          type: 'repeater',
          fields: [
            { name: 'icon', label: 'Material icon name', type: 'text' },
            { name: 'title', label: 'Feature title', type: 'text' },
            { name: 'desc', label: 'Feature description', type: 'textarea' },
          ],
        },
        { name: 'bestForLabel', label: 'Best-for section label', type: 'text' },
        {
          name: 'bestFor',
          label: 'Best-for pills',
          type: 'repeater',
          fields: [{ name: 'text', label: 'Pill text', type: 'text' }],
        },
        {
          name: 'pros',
          label: 'Pros',
          type: 'repeater',
          fields: [{ name: 'text', label: 'Pro text', type: 'text' }],
        },
      ],
    },
  ],
  values: { ...COMPARE_DEFAULTS },
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

  // Slightly wider container for the stacked product cards; tinted bg so the
  // band reads as a distinct comparison zone vs the white intro above it.
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
    content: 'Are Revenue-Based Loans, MCA, and Cash Flow Lending the Same?',
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
  sec.blocks = [headerBlock, dividerBlock, compareBlock];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: sec-3 -> styled 3-product comparison stack (MCA / Cash Flow / Revenue-Based).`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
