/**
 * Iteration 1: Business Loans page (post id 800).
 *
 * Biggest visual gap vs cardiff.co/business-loans: the original site has a
 * compact 5-row "product comparison" table immediately under the hero —
 * Equipment Leasing / Merchant Cash Advance / Line of Credit / SBA Loans /
 * Cardiff Coins — each row a two-column "name + description" strip with
 * alternating tints and a small "Learn more" arrow link. The port currently
 * has THREE separate full-section blocks (sec-1, sec-2, sec-3) each
 * containing only a centered title + orange divider, no body, no second
 * column, and missing two of the five products entirely. They take ~3
 * screens of vertical space and look broken.
 *
 * Fix: replace blocks[1..3] (sec-1, sec-2, sec-3) with a single
 * `html-render` "product-rows" block whose `array` field holds the 5
 * product rows in the same order and style as the original.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 800;

const PRODUCT_ROWS_HTML = `
<style>
  .cd-prod { background: #f6f9fc; padding: 56px 24px 64px 24px; }
  .cd-prod__inner { max-width: 1100px; margin: 0 auto; }
  .cd-prod__row { display: grid; grid-template-columns: minmax(220px, 280px) 1fr auto; gap: 28px; align-items: center; padding: 28px 24px; border-radius: 10px; transition: background-color 0.18s ease, transform 0.18s ease; }
  .cd-prod__row + .cd-prod__row { margin-top: 6px; }
  .cd-prod__row:nth-child(odd)  { background: #ffffff; }
  .cd-prod__row:nth-child(even) { background: #eef3f9; }
  .cd-prod__row:hover { background: #e6edf6; transform: translateY(-1px); }
  .cd-prod__name { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.35rem; font-weight: 800; color: #1c3370; letter-spacing: -0.01em; text-transform: none; margin: 0; line-height: 1.2; }
  .cd-prod__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.98rem; line-height: 1.6; color: #4a5772; margin: 0; }
  .cd-prod__more { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.78rem; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: #ef6632; text-decoration: none; white-space: nowrap; display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 4px; transition: color 0.18s ease, background-color 0.18s ease; }
  .cd-prod__more:hover { color: #25418b; background: rgba(37,65,139,0.06); }
  .cd-prod__more::after { content: '\\2192'; font-size: 1rem; letter-spacing: 0; }
  @media (max-width: 760px) {
    .cd-prod__row { grid-template-columns: 1fr; gap: 10px; padding: 22px 18px; text-align: left; }
    .cd-prod__more { justify-self: start; padding: 6px 0; }
  }
</style>
<section class="cd-prod">
  <div class="cd-prod__inner">
    <div class="cd-prod__row" data-repeat="rows">
      <h3 class="cd-prod__name" data-field="name">{{rows.name}}</h3>
      <p class="cd-prod__desc" data-field="description">{{rows.description}}</p>
      <a class="cd-prod__more" href="{{rows.url}}" data-field="ctaText">{{rows.ctaText}}</a>
    </div>
  </div>
</section>
`.trim();

const productRowsBlock = {
  id: 'product-rows',
  type: 'html-render' as const,
  width: 'full' as const,
  html: PRODUCT_ROWS_HTML,
  fields: [
    {
      name: 'rows',
      label: 'Product rows',
      type: 'array' as const,
      itemFields: [
        { name: 'name', label: 'Product name', type: 'text' as const },
        { name: 'description', label: 'Description', type: 'textarea' as const },
        { name: 'ctaText', label: 'CTA text', type: 'text' as const, default: 'Learn More' },
        { name: 'url', label: 'Link', type: 'url' as const, default: '#' },
      ],
    },
  ],
  values: {
    rows: [
      {
        name: 'Equipment Leasing',
        description:
          'Finance the machinery, vehicles, and tools your business needs to grow — preserve cash flow while you scale.',
        ctaText: 'Learn More',
        url: 'https://cardiff.co/equipment-leasing/',
      },
      {
        name: 'Merchant Cash Advance',
        description:
          'Get a lump sum today and repay as a small percentage of your daily card sales — flexible repayment that matches revenue.',
        ctaText: 'Learn More',
        url: 'https://cardiff.co/merchant-cash-advance/',
      },
      {
        name: 'Line of Credit',
        description:
          'A revolving line you can draw on whenever you need working capital, with no obligation to use the full amount.',
        ctaText: 'Learn More',
        url: 'https://cardiff.co/line-of-credit/',
      },
      {
        name: 'SBA Loans',
        description:
          'Government-backed financing with longer terms and lower rates for qualifying small businesses across the U.S.',
        ctaText: 'Learn More',
        url: 'https://cardiff.co/sba-loans/',
      },
      {
        name: 'Cardiff Coins',
        description:
          'Earn rewards on every dollar you borrow and redeem them for discounts on future financing.',
        ctaText: 'Learn More',
        url: 'https://cardiff.co/cardiff-coins/',
      },
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

  // Idempotent: if a previous run already inserted `product-rows` at index 1,
  // just replace it in place. Otherwise, expect the original sec-1/2/3 and
  // collapse those three sections into the new block.
  const existingIdx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === 'product-rows');
  if (existingIdx >= 0) {
    parsed.blocks[existingIdx] = productRowsBlock;
    console.log(`Replaced existing product-rows at index ${existingIdx} (re-run).`);
  } else {
    const expectedIds = ['sec-1', 'sec-2', 'sec-3'];
    const actualIds = [parsed.blocks[1]?.id, parsed.blocks[2]?.id, parsed.blocks[3]?.id];
    if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
      console.error(
        `Post ${POST_ID}: expected blocks[1..3] ids to be ${expectedIds.join(',')} but got ${actualIds.join(',')}; aborting`,
      );
      process.exit(1);
    }
    parsed.blocks.splice(1, 3, productRowsBlock);
  }

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: replaced sec-1/sec-2/sec-3 with product-rows html-render. New block count: ${parsed.blocks.length}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
