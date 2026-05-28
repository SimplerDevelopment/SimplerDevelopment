/**
 * Iter 1: Restaurants industry page (post 815).
 *
 * Biggest visual gap vs. https://cardiff.co/restaurants/:
 *   The original page renders a striking 3-up icon-card feature row
 *   immediately under the hero (Cardiff's signature "$12 Billion+ Funded /
 *   5 Minute Approvals / Same Day Funds" trust band). Our port jumps
 *   straight from the hero into a wall of paragraph text in sec-1, which
 *   makes the page feel flat and entirely unstructured.
 *
 * Fix in this iter (one section only): inject a new section block with
 * id `sec-hero-features` between the hero block (order 1) and sec-1
 * (order 2). It carries a single html-render block (one grid wrapper,
 * three hard-coded card siblings — NOT data-repeat on the wrapper, per
 * the documented renderer quirk that data-repeat on the grid container
 * collapses it to a single-column stack).
 *
 * Style recipe is the canonical icon-card grid from
 * styled-equipment-leasing-iter3.ts, adapted to a 3-up layout with the
 * trust-stat content from cardiff.co/restaurants/. Brand palette only:
 * deep blue (#1c3370 / #25418b), green (#5ac96f), orange (#ef6632).
 * Material Icons — never emojis.
 *
 * Idempotent: detects an existing section with id `sec-hero-features`
 * and replaces it; otherwise inserts at index 1 (immediately after
 * the hero) and renumbers the `order` property on all subsequent
 * blocks. Safe to re-run.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 815;
const NEW_SECTION_ID = 'sec-hero-features';

const FEATURES_HTML = `
<style>
  .cd-rs-feat { max-width: 1140px; margin: 0 auto; }
  .cd-rs-feat__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-rs-feat__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 14px; padding: 30px 28px; box-shadow: 0 14px 36px rgba(28,51,112,0.08); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; align-items: flex-start; }
  .cd-rs-feat__card:hover { transform: translateY(-4px); box-shadow: 0 20px 48px rgba(28,51,112,0.14); }
  .cd-rs-feat__icon { width: 60px; height: 60px; border-radius: 16px; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 10px 22px rgba(28,51,112,0.24); }
  .cd-rs-feat__card:nth-child(2) .cd-rs-feat__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 10px 22px rgba(239,102,50,0.28); }
  .cd-rs-feat__card:nth-child(3) .cd-rs-feat__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 10px 22px rgba(58,168,86,0.28); }
  .cd-rs-feat__icon .material-icons { font-size: 32px; }
  .cd-rs-feat__stat { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.875rem; font-weight: 800; color: #1c3370; margin: 0 0 8px 0; letter-spacing: -0.015em; line-height: 1.15; }
  .cd-rs-feat__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.975rem; line-height: 1.65; color: #525f7f; margin: 0; }
  @media (max-width: 980px) {
    .cd-rs-feat__grid { grid-template-columns: repeat(2, 1fr); }
    .cd-rs-feat__card:nth-child(3) { grid-column: 1 / -1; max-width: 480px; margin: 0 auto; width: 100%; }
  }
  @media (max-width: 620px) {
    .cd-rs-feat__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-rs-feat__card { padding: 24px 22px; }
    .cd-rs-feat__card:nth-child(3) { max-width: none; }
    .cd-rs-feat__stat { font-size: 1.625rem; }
  }
</style>
<div class="cd-rs-feat">
  <div class="cd-rs-feat__grid">
    <div class="cd-rs-feat__card">
      <div class="cd-rs-feat__icon"><span class="material-icons" data-field="icon1">{{icon1}}</span></div>
      <p class="cd-rs-feat__stat" data-field="stat1">{{stat1}}</p>
      <p class="cd-rs-feat__desc" data-field="desc1">{{desc1}}</p>
    </div>
    <div class="cd-rs-feat__card">
      <div class="cd-rs-feat__icon"><span class="material-icons" data-field="icon2">{{icon2}}</span></div>
      <p class="cd-rs-feat__stat" data-field="stat2">{{stat2}}</p>
      <p class="cd-rs-feat__desc" data-field="desc2">{{desc2}}</p>
    </div>
    <div class="cd-rs-feat__card">
      <div class="cd-rs-feat__icon"><span class="material-icons" data-field="icon3">{{icon3}}</span></div>
      <p class="cd-rs-feat__stat" data-field="stat3">{{stat3}}</p>
      <p class="cd-rs-feat__desc" data-field="desc3">{{desc3}}</p>
    </div>
  </div>
</div>
`.trim();

const FEATURES_DEFAULTS = {
  icon1: 'attach_money',
  stat1: '$12 Billion+ Funded',
  desc1: 'Over 21 years, we have funded over $12 Billion for small businesses — including thousands of restaurants and hospitality operators nationwide.',
  icon2: 'schedule',
  stat2: '5 Minute Approvals',
  desc2: 'Know how much funding you can get within minutes of applying — no waiting weeks for an answer while your restaurant’s opportunity slips by.',
  icon3: 'bolt',
  stat3: 'Same Day Funds',
  desc3: 'With our online process, we can provide funds within 24 hours of approval so you can cover payroll, restock inventory, or seize a growth moment.',
} as const;

const featuresInnerBlock = {
  id: 'sec-hero-features-html',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 1,
  html: FEATURES_HTML,
  fields: [
    { name: 'icon1', label: 'Card 1 — icon', type: 'text', default: FEATURES_DEFAULTS.icon1 },
    { name: 'stat1', label: 'Card 1 — stat headline', type: 'text', default: FEATURES_DEFAULTS.stat1 },
    { name: 'desc1', label: 'Card 1 — description', type: 'textarea', default: FEATURES_DEFAULTS.desc1 },
    { name: 'icon2', label: 'Card 2 — icon', type: 'text', default: FEATURES_DEFAULTS.icon2 },
    { name: 'stat2', label: 'Card 2 — stat headline', type: 'text', default: FEATURES_DEFAULTS.stat2 },
    { name: 'desc2', label: 'Card 2 — description', type: 'textarea', default: FEATURES_DEFAULTS.desc2 },
    { name: 'icon3', label: 'Card 3 — icon', type: 'text', default: FEATURES_DEFAULTS.icon3 },
    { name: 'stat3', label: 'Card 3 — stat headline', type: 'text', default: FEATURES_DEFAULTS.stat3 },
    { name: 'desc3', label: 'Card 3 — description', type: 'textarea', default: FEATURES_DEFAULTS.desc3 },
  ],
  values: { ...FEATURES_DEFAULTS },
};

function buildFeaturesSection(order: number) {
  return {
    type: 'section' as const,
    id: NEW_SECTION_ID,
    order,
    maxWidth: '1200px',
    style: {
      backgroundColor: '#ffffff',
      paddingTop: '60px',
      paddingBottom: '60px',
      paddingLeft: '24px',
      paddingRight: '24px',
    },
    blocks: [featuresInnerBlock],
  };
}

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

  const existingIdx = parsed.blocks.findIndex((b: any) => b?.id === NEW_SECTION_ID);

  if (existingIdx !== -1) {
    // Replace in place, preserving order.
    const order = parsed.blocks[existingIdx].order ?? existingIdx + 1;
    parsed.blocks[existingIdx] = buildFeaturesSection(order);
    console.log(`Replaced existing ${NEW_SECTION_ID} at index ${existingIdx} (order=${order}).`);
  } else {
    // Insert immediately after hero (index 0) and renumber subsequent orders.
    const newBlock = buildFeaturesSection(2);
    parsed.blocks.splice(1, 0, newBlock);
    for (let i = 2; i < parsed.blocks.length; i++) {
      const b = parsed.blocks[i];
      if (b && typeof b === 'object') b.order = i + 1;
    }
    console.log(`Inserted ${NEW_SECTION_ID} at index 1; renumbered downstream block orders.`);
  }

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: industries-restaurants hero-features band installed.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
