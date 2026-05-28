/**
 * Iteration 1: Business Loan Products page (post id 799).
 *
 * Biggest visual gap vs cardiff.co/business-loans/products:
 *   - cardiff.co lays out each product as a two-column row: product name
 *     (deep-blue Raleway link, ~1.6rem) on the LEFT, descriptive paragraph
 *     on the RIGHT, with alternating white / light-gray section tints. The
 *     two products on this page (Equipment Leasing, Working Capital) both
 *     have meaningful body copy.
 *   - The port currently renders sec-1 ("Equipment Leasing") and sec-2
 *     ("Working Capital") as centered titles + an orange divider with NO
 *     body copy at all — about three screens of empty padded space.
 *
 * Fix: collapse sec-1 + sec-2 into a single `html-render` "product-rows"
 * block that mirrors the cardiff.co layout — 2-column (title left,
 * description right), alternating tinted bands, real body copy lifted
 * from the original page. Each row links the title to the matching
 * product detail page.
 *
 * Idempotent: re-running replaces an existing `product-rows` block in
 * place, otherwise it expects the original sec-1/sec-2 pair at indices
 * 1..2 and collapses them.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 799;

const PRODUCT_ROWS_HTML = `
<style>
  .cd-prod2 { padding: 0; }
  .cd-prod2__band { padding: 72px 24px; }
  .cd-prod2__band--alt { background: #eef2f6; }
  .cd-prod2__inner { max-width: 1100px; margin: 0 auto; display: grid; grid-template-columns: minmax(220px, 320px) 1fr; gap: 56px; align-items: start; }
  .cd-prod2__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.85rem; font-weight: 700; color: #25418b; letter-spacing: -0.005em; margin: 0; line-height: 1.2; text-decoration: none; display: inline-block; transition: color 0.18s ease; }
  a.cd-prod2__title:hover { color: #1c3370; text-decoration: underline; }
  .cd-prod2__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1rem; line-height: 1.7; color: #4a5772; margin: 0; }
  @media (max-width: 760px) {
    .cd-prod2__band { padding: 48px 20px; }
    .cd-prod2__inner { grid-template-columns: 1fr; gap: 16px; }
    .cd-prod2__title { font-size: 1.5rem; }
  }
</style>
<section class="cd-prod2">
  <div class="cd-prod2__band" data-repeat="rows">
    <div class="cd-prod2__inner">
      <a class="cd-prod2__title" href="{{rows.url}}" data-field="name">{{rows.name}}</a>
      <p class="cd-prod2__desc" data-field="description">{{rows.description}}</p>
    </div>
  </div>
</section>
<style>
  .cd-prod2 .cd-prod2__band:nth-of-type(even) { background: #eef2f6; }
</style>
`.trim();

const productRowsBlock = {
  id: 'product-rows',
  type: 'html-render' as const,
  width: 'full' as const,
  html: PRODUCT_ROWS_HTML,
  order: 2,
  fields: [
    {
      name: 'rows',
      label: 'Product rows',
      type: 'array' as const,
      itemFields: [
        { name: 'name', label: 'Product name', type: 'text' as const },
        { name: 'description', label: 'Description', type: 'textarea' as const },
        { name: 'url', label: 'Link', type: 'url' as const, default: '#' },
      ],
    },
  ],
  values: {
    rows: [
      {
        name: 'Equipment Leasing',
        description:
          'When it comes to structuring your financing, Cardiff is flexible. Choose the program and terms that fit your budget and your cash flow.',
        url: 'https://cardiff.co/equipment-leasing/',
      },
      {
        name: 'Working Capital',
        description:
          'Working capital financing is designed to bridge cash flow needs for small business owners.',
        url: 'https://cardiff.co/working-capital/',
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

  const existingIdx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === 'product-rows');
  if (existingIdx >= 0) {
    parsed.blocks[existingIdx] = productRowsBlock;
    console.log(`Replaced existing product-rows at index ${existingIdx} (re-run).`);
  } else {
    const expectedIds = ['sec-1', 'sec-2'];
    const actualIds = [parsed.blocks[1]?.id, parsed.blocks[2]?.id];
    if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
      console.error(
        `Post ${POST_ID}: expected blocks[1..2] ids to be ${expectedIds.join(',')} but got ${actualIds.join(',')}; aborting`,
      );
      process.exit(1);
    }
    parsed.blocks.splice(1, 2, productRowsBlock);
  }

  // Re-number `order` so the renderer keeps blocks sequential.
  parsed.blocks.forEach((b: { order?: number }, i: number) => {
    b.order = i + 1;
  });

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: collapsed sec-1 + sec-2 into product-rows. New block count: ${parsed.blocks.length}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
