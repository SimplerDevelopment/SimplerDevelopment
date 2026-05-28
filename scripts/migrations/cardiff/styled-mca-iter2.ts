/**
 * Merchant Cash Advance page (post 824) — iter2.
 *
 * Gap vs cardiff.co: original has a styled 2-col intro block placing the
 * "Working Capital for Your Needs" copy on the right next to an illustration
 * of a businessman with arrows on the left. Our port stacks the intro
 * paragraphs into a single-column text block (sec-1) with the illustration
 * missing entirely.
 *
 * This rewrites sec-1 into a single html-render block with a 2-col grid:
 *   left = illustration (svg from cardiff CDN)
 *   right = headline + intro paragraphs
 *
 * Idempotent: re-running just refreshes html/values on the existing
 * `sec-1-2col` block. Initial run requires block id `sec-1` of type `section`.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 824;

const HTML = `
<style>
  .cd-mca-intro { background: #f6f9fc; padding: 80px 24px; }
  .cd-mca-intro__inner { max-width: 1120px; margin: 0 auto; display: grid; grid-template-columns: 360px minmax(0, 1fr); gap: 64px; align-items: center; }
  .cd-mca-intro__illo { display: flex; align-items: center; justify-content: center; }
  .cd-mca-intro__illo img { max-width: 100%; height: auto; display: block; }
  .cd-mca-intro__copy h2 { color: #25418b; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 2rem; font-weight: 800; letter-spacing: -0.01em; line-height: 1.15; margin: 0 0 12px 0; }
  .cd-mca-intro__rule { width: 56px; height: 3px; background: #ef6632; border-radius: 2px; margin: 0 0 24px 0; }
  .cd-mca-intro__copy p { color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; margin: 0 0 18px 0; }
  .cd-mca-intro__copy p:last-child { margin-bottom: 0; }
  @media (max-width: 900px) {
    .cd-mca-intro { padding: 56px 20px; }
    .cd-mca-intro__inner { grid-template-columns: 1fr; gap: 32px; text-align: center; }
    .cd-mca-intro__illo { max-width: 280px; margin: 0 auto; }
    .cd-mca-intro__rule { margin-left: auto; margin-right: auto; }
  }
</style>
<section class="cd-mca-intro">
  <div class="cd-mca-intro__inner">
    <div class="cd-mca-intro__illo">
      <img src="{{illustrationUrl}}" alt="{{illustrationAlt}}" />
    </div>
    <div class="cd-mca-intro__copy">
      <h2 data-field="heading">{{heading}}</h2>
      <div class="cd-mca-intro__rule" aria-hidden="true"></div>
      <div data-field="body">{{body}}</div>
    </div>
  </div>
</section>
`.trim();

const BODY_HTML = `
<p>When your small business needs to maximize cash flow, a Merchant Cash Advance might be the solution. Working capital financing is designed to bridge cash flow needs for small business owners. Terms typically range from 3 to 24 months. Payments may be daily, weekly, or monthly and can be fixed or tied to the flow of your business revenue.</p>
<p>For example, if your company has had a large purchase order, you need to pay for product to fulfill it. You&rsquo;ll get that money back from a retailer when your product sells. But as a small business, how do you stay up and running, covering your expenses like payroll, rent and supplies, while you wait?</p>
<p>A similar problem arises for doctors and dentists. You provide a service typically covered by insurance. But insurance companies take time to pay. You might need a working capital loan to keep the lights on while you wait for the insurance company to cut your office a check.</p>
`.trim();

const newBlock = {
  id: 'sec-1-2col',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 2,
  html: HTML,
  fields: [
    { name: 'heading', label: 'Section heading', type: 'text', default: 'Working Capital for Your Needs' },
    { name: 'body', label: 'Body paragraphs (HTML)', type: 'richtext', default: BODY_HTML },
    { name: 'illustrationUrl', label: 'Illustration image URL', type: 'image', default: 'https://cardiffcompany.wpenginepowered.com/wp-content/uploads/2025/08/business-merchant-cash-advance.svg' },
    { name: 'illustrationAlt', label: 'Illustration alt text', type: 'text', default: 'Businessman with growth arrows illustration' },
  ],
  values: {
    heading: 'Working Capital for Your Needs',
    body: BODY_HTML,
    illustrationUrl: 'https://cardiffcompany.wpenginepowered.com/wp-content/uploads/2025/08/business-merchant-cash-advance.svg',
    illustrationAlt: 'Businessman with growth arrows illustration',
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

  const existingIdx = parsed.blocks.findIndex((b: any) => b.id === 'sec-1-2col');
  if (existingIdx >= 0) {
    parsed.blocks[existingIdx] = { ...parsed.blocks[existingIdx], ...newBlock };
    console.log(`Post ${POST_ID}: refreshed existing sec-1-2col at index ${existingIdx}`);
  } else {
    const sec1Idx = parsed.blocks.findIndex((b: any) => b.id === 'sec-1');
    if (sec1Idx < 0) {
      console.error(`Post ${POST_ID}: sec-1 not found; aborting`);
      process.exit(1);
    }
    if (parsed.blocks[sec1Idx].type !== 'section') {
      console.error(`Post ${POST_ID}: sec-1 is not a section (got ${parsed.blocks[sec1Idx].type}); aborting`);
      process.exit(1);
    }
    parsed.blocks[sec1Idx] = newBlock;
    console.log(`Post ${POST_ID}: replaced sec-1 (index ${sec1Idx}) with sec-1-2col`);
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
