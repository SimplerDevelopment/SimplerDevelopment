/**
 * Iter 3: Business Loan Products page (post id 799).
 *
 * Iter 1 staged the page (hero + product strip + final CTA), iter 2 stripped
 * it to a minimal cardiff.co-faithful shape (deep-blue H1 hero + 2-row product
 * strip). After iter 2 the page is genuinely minimal — there is no remaining
 * unstyled section to convert. This iter is a padding / rhythm polish only.
 *
 * Polish targets (visual review of the current minimal layout):
 *   1. Hero (`hero-business-loans-products-min`) — vertical padding feels
 *      tight; the bottom edge butts hard against the white product band.
 *      Bump top padding, add a soft fade at the bottom, and widen the type
 *      ramp slightly to feel like a real landing hero rather than a slug.
 *   2. Product strip (`product-rows`) — first band sits flush against the
 *      hero bottom, alternating-band rhythm is right but the rows feel
 *      visually flat. Slight padding bump + a hairline divider between rows
 *      + a tiny green accent on the title-side column to ground the brand
 *      palette (#5ac96f). No structural changes — fields/values untouched.
 *
 * Idempotent: matches blocks by id and rewrites html/values in place. Safe
 * to re-run. Does not change block count, order, or field schema.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 799;
const HERO_ID = 'hero-business-loans-products-min';
const ROWS_ID = 'product-rows';

const HERO_HTML = `
<style>
  .cd-blp-hero {
    position: relative;
    background-image:
      radial-gradient(ellipse at 60% 0%, rgba(56,92,192,0.45) 0%, transparent 65%),
      linear-gradient(135deg, #1c3370 0%, #25418b 60%, #385cc0 100%);
    padding: 120px 24px 132px 24px;
    text-align: center;
    overflow: hidden;
  }
  .cd-blp-hero::before {
    content: '';
    position: absolute;
    left: 50%;
    top: 36px;
    transform: translateX(-50%);
    width: 64px;
    height: 3px;
    background: #5ac96f;
    border-radius: 2px;
  }
  .cd-blp-hero::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 56px;
    background: linear-gradient(to bottom, rgba(28,51,112,0) 0%, rgba(255,255,255,0.06) 100%);
    pointer-events: none;
  }
  .cd-blp-hero__eyebrow {
    font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 0.8125rem;
    font-weight: 700;
    color: #ffb798;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    margin: 0 0 18px 0;
  }
  .cd-blp-hero__h1 {
    font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 2.75rem;
    font-weight: 800;
    color: #ffffff;
    letter-spacing: -0.015em;
    line-height: 1.12;
    margin: 0 auto;
    max-width: 1080px;
    text-shadow: 0 2px 16px rgba(0,0,0,0.32);
  }
  @media (max-width: 760px) {
    .cd-blp-hero { padding: 88px 20px 96px 20px; }
    .cd-blp-hero__h1 { font-size: 1.85rem; }
    .cd-blp-hero__eyebrow { font-size: 0.75rem; letter-spacing: 0.14em; }
  }
</style>
<section class="cd-blp-hero">
  <p class="cd-blp-hero__eyebrow" data-field="eyebrow">{{eyebrow}}</p>
  <h1 class="cd-blp-hero__h1" data-field="title">{{title}}</h1>
</section>
`.trim();

const heroBlock = {
  id: HERO_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  order: 1,
  html: HERO_HTML,
  fields: [
    { name: 'eyebrow', label: 'Eyebrow label', type: 'text' as const },
    { name: 'title', label: 'Hero title', type: 'text' as const },
  ],
  values: {
    eyebrow: 'Cardiff Capital',
    title: 'Business Loan Products',
  },
};

const ROWS_HTML = `
<style>
  .cd-prod2 { padding: 0; background: #ffffff; }
  .cd-prod2__band {
    padding: 88px 24px;
    border-bottom: 1px solid #e6ecf5;
    position: relative;
  }
  .cd-prod2__band:last-of-type { border-bottom: none; }
  .cd-prod2__band--alt { background: #eef2f6; }
  .cd-prod2__inner {
    max-width: 1100px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: minmax(240px, 340px) 1fr;
    gap: 64px;
    align-items: start;
  }
  .cd-prod2__titlewrap {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .cd-prod2__accent {
    width: 48px;
    height: 3px;
    background: #5ac96f;
    border-radius: 2px;
  }
  .cd-prod2__title {
    font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 1.95rem;
    font-weight: 800;
    color: #25418b;
    letter-spacing: -0.01em;
    margin: 0;
    line-height: 1.18;
    text-decoration: none;
    display: inline-block;
    transition: color 0.18s ease;
  }
  a.cd-prod2__title:hover { color: #ef6632; text-decoration: none; }
  .cd-prod2__desc {
    font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 1.0625rem;
    line-height: 1.75;
    color: #4a5772;
    margin: 0;
    padding-top: 8px;
  }
  @media (max-width: 760px) {
    .cd-prod2__band { padding: 56px 20px; }
    .cd-prod2__inner { grid-template-columns: 1fr; gap: 18px; }
    .cd-prod2__title { font-size: 1.55rem; }
    .cd-prod2__desc { font-size: 1rem; padding-top: 0; }
  }
</style>
<section class="cd-prod2">
  <div class="cd-prod2__band" data-repeat="rows">
    <div class="cd-prod2__inner">
      <div class="cd-prod2__titlewrap">
        <span class="cd-prod2__accent"></span>
        <a class="cd-prod2__title" href="{{rows.url}}" data-field="name">{{rows.name}}</a>
      </div>
      <p class="cd-prod2__desc" data-field="description">{{rows.description}}</p>
    </div>
  </div>
</section>
<style>
  .cd-prod2 .cd-prod2__band:nth-of-type(even) { background: #eef2f6; }
</style>
`.trim();

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

  // 1) Polish hero in place.
  const heroIdx = parsed.blocks.findIndex((b: any) => b?.id === HERO_ID);
  if (heroIdx === -1) {
    console.error(`Post ${POST_ID}: missing hero block ${HERO_ID}; run iter2 first.`);
    process.exit(1);
  }
  const existingHero = parsed.blocks[heroIdx];
  // Preserve any author-edited values; only fill missing keys with defaults.
  const heroValues = { ...heroBlock.values, ...(existingHero.values || {}) };
  parsed.blocks[heroIdx] = { ...heroBlock, values: heroValues };
  console.log(`Polished hero block ${HERO_ID} at index ${heroIdx}.`);

  // 2) Polish product rows in place (preserve fields + values).
  const rowsIdx = parsed.blocks.findIndex((b: any) => b?.id === ROWS_ID);
  if (rowsIdx === -1) {
    console.error(`Post ${POST_ID}: missing product strip block ${ROWS_ID}; run iter1 first.`);
    process.exit(1);
  }
  const existingRows = parsed.blocks[rowsIdx];
  parsed.blocks[rowsIdx] = {
    ...existingRows,
    html: ROWS_HTML,
    order: rowsIdx + 1,
  };
  console.log(`Polished product strip ${ROWS_ID} at index ${rowsIdx}.`);

  // Re-number order so renderer stays sequential.
  parsed.blocks.forEach((b: { order?: number }, i: number) => {
    b.order = i + 1;
  });

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}. Block count: ${parsed.blocks.length}, ids: [${parsed.blocks.map((b: any) => b.id).join(', ')}]`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
