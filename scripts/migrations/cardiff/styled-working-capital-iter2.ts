/**
 * Working Capital page (post 837) — iter2.
 *
 * Gap vs cardiff.co: the orig has a 2-col body grid placing
 *   "How Much Working Capital Do You Need?"  (left)
 *   "What kinds of working capital are available?"  (right)
 * side by side. Our port stacks them single-column (sec-1 has the "How Much"
 * content jammed into a paragraph; sec-2 holds "What kinds" by itself).
 *
 * This rewrites sec-1 into a single html-render block that renders a 2-col grid
 * (1fr 1fr) with both questions side by side, and DELETES the now-redundant
 * sec-2 (it gets absorbed). The intro paragraphs that previously lived in sec-1
 * become a new short intro `html-render` above the grid in the same section.
 *
 * Idempotent: only rewrites if block index 1 has id 'sec-1' AND type 'section'.
 * Won't rerun once sec-1 type === 'html-render' with id 'sec-1-2col'.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 837;

const HTML = `
<style>
  .cd-wc-body { background: #f6f9fc; padding: 80px 24px; }
  .cd-wc-body__inner { max-width: 1120px; margin: 0 auto; }
  .cd-wc-body__intro { max-width: 880px; margin: 0 auto 56px auto; }
  .cd-wc-body__intro p { color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; margin: 0 0 18px 0; }
  .cd-wc-body__intro p:last-child { margin-bottom: 0; }
  .cd-wc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 56px; align-items: start; }
  .cd-wc-col__title { color: #25418b; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.625rem; font-weight: 800; letter-spacing: -0.01em; line-height: 1.2; margin: 0 0 14px 0; }
  .cd-wc-col__rule { width: 44px; height: 3px; background: #ef6632; border-radius: 2px; margin: 0 0 22px 0; }
  .cd-wc-col p { color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1rem; line-height: 1.75; margin: 0 0 16px 0; }
  .cd-wc-col ul { list-style: disc; padding-left: 22px; margin: 0 0 16px 0; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1rem; line-height: 1.7; }
  .cd-wc-col li { margin: 0 0 10px 0; }
  .cd-wc-col li strong { color: #25418b; font-weight: 700; }
  @media (max-width: 900px) {
    .cd-wc-body { padding: 56px 20px; }
    .cd-wc-grid { grid-template-columns: 1fr; gap: 40px; }
    .cd-wc-body__intro { margin-bottom: 40px; }
  }
</style>
<section class="cd-wc-body">
  <div class="cd-wc-body__inner">
    <div class="cd-wc-body__intro" data-field="intro">{{intro}}</div>
    <div class="cd-wc-grid">
      <div class="cd-wc-col" data-repeat="columns">
        <h2 class="cd-wc-col__title" data-field="title">{{columns.title}}</h2>
        <div class="cd-wc-col__rule" aria-hidden="true"></div>
        <div data-field="body">{{columns.body}}</div>
      </div>
    </div>
  </div>
</section>
`.trim();

const INTRO_HTML = `
<p>When your small business needs to maximize cash flow, a Working Capital loan might be the solution.</p>
<p>For example, if your company has had a large purchase order, you need to pay for product to fulfill it. You&rsquo;ll get that money back from a retailer when your product sells. But as a small business, how do you stay up and running, covering your expenses like payroll, rent and supplies, while you wait?</p>
<p>A similar problem arises for doctors and dentists. You provide a service typically covered by insurance. But insurance companies take time to pay. You might need a working capital loan to keep the lights on while you wait for the insurance company to cut your office a check.</p>
`.trim();

const COL_HOW_MUCH = `
<p>Calculating the amount of working capital your business needs comes down to a relatively simple formula. In general, working capital is the difference between current assets and current liabilities. However, that number likely changes each month as bills get paid.</p>
<p>A better way to gauge how much working capital your business needs is based on your operating cycle &mdash; the amount of time it takes your business to create and sell a product.</p>
<p>For some businesses, like a restaurant, the cycle is very short. For others, like a clothing manufacturer, it&rsquo;s much more seasonal. You&rsquo;ll want to take into account your cash flow during each operating cycle to determine how much working capital you&rsquo;ll need.</p>
<p>Sometimes, the unexpected happens. Kitchens have fires, equipment requires repairs, taxes must be paid. To solve these problems, we can have the money you need deposited into your account within 24 hours.</p>
`.trim();

const COL_WHAT_KINDS = `
<p>In general, there are three types of working capital financing. These include:</p>
<ul>
  <li><strong>Term Loans:</strong> What you probably think of when you think of a loan &mdash; it has a set term, interest rate and payoff schedule.</li>
  <li><strong>Business Line of Credit:</strong> These work a lot like a credit card, in that you have a line of credit limit and interest rate, and you must make a payment each month, but you can borrow and repay the loan as needed. And you can typically borrow much larger amounts than you would be able to finance with a credit card.</li>
  <li><strong>Working Capital:</strong> This kind of loan loads your future revenue as collateral against your financing. That means you&rsquo;ll be able to borrow against a certain percentage of monthly revenue generated by your business, and the lender will expect to be paid back when you&rsquo;re paid by your typically slower-paying customers. Repayments are deducted as a fixed payment, or are flat fluctuates with monthly revenue.</li>
</ul>
`.trim();

const newBlock = {
  id: 'sec-1-2col',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 2,
  html: HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraphs (HTML)', type: 'richtext', default: INTRO_HTML },
    {
      name: 'columns',
      label: 'Body columns (2-col grid)',
      type: 'array',
      itemFields: [
        { name: 'title', label: 'Column title', type: 'text' },
        { name: 'body', label: 'Column body (HTML)', type: 'richtext' },
      ],
    },
  ],
  values: {
    intro: INTRO_HTML,
    columns: [
      { title: 'How Much Working Capital Do You Need?', body: COL_HOW_MUCH },
      { title: 'What kinds of working capital are available?', body: COL_WHAT_KINDS },
    ],
  },
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

  const sec1Idx = parsed.blocks.findIndex((b: any) => b.id === 'sec-1');
  const sec2Idx = parsed.blocks.findIndex((b: any) => b.id === 'sec-2');
  const existing2col = parsed.blocks.findIndex((b: any) => b.id === 'sec-1-2col');

  if (existing2col >= 0) {
    // Idempotent: just refresh values + html in place
    parsed.blocks[existing2col] = { ...parsed.blocks[existing2col], ...newBlock };
    console.log(`Post ${POST_ID}: refreshed existing sec-1-2col at index ${existing2col}`);
  } else {
    if (sec1Idx < 0) {
      console.error(`Post ${POST_ID}: sec-1 not found; aborting`);
      process.exit(1);
    }
    if (parsed.blocks[sec1Idx].type !== 'section') {
      console.error(`Post ${POST_ID}: sec-1 is not a section (got ${parsed.blocks[sec1Idx].type}); aborting`);
      process.exit(1);
    }
    // Replace sec-1 with new 2-col block, and drop sec-2 (absorbed)
    parsed.blocks[sec1Idx] = newBlock;
    if (sec2Idx >= 0) {
      parsed.blocks.splice(sec2Idx, 1);
    }
    console.log(`Post ${POST_ID}: replaced sec-1 (index ${sec1Idx}) with sec-1-2col; removed sec-2 at ${sec2Idx}`);
  }

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(`Post ${POST_ID}: now ${parsed.blocks.length} blocks`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
