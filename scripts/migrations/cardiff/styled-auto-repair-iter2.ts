/**
 * Iter 2: Auto Repair industry page (post id 805).
 *
 * Iter 1 ported the hero. Remaining gap: the stats row beneath the hero
 * (`5.99%` + `82,000`) renders in the port as bare left-aligned text in a
 * single column. Cardiff.co's design for this band is a styled 2-column
 * layout: LEFT column has two icon+stat blurbs centered (with the Cardiff
 * SVG icons) plus a 4.9-star rating and a "See Our Google Reviews →" link.
 * RIGHT column has a supporting photo (mechanic) — the hero photo carries
 * the brand, and this row anchors the page visually with a second image.
 *
 * Fix: replace block `sec-1` in place with an `html-render` block that
 * renders the stats column + photo column in a 2-col grid. Uses
 * `data-repeat="stats"` so the two stat blurbs are array-driven and an
 * editor can re-order / re-label.
 *
 * Idempotent: re-running cleanly re-applies the new block over either the
 * original `section` (id `sec-1`) or the previously-applied `html-render`.
 *
 * Pattern source: scripts/migrations/cardiff/styled-sba-loans-iter3.ts
 * (data-repeat + namespaced {{stats.value}} bindings) and
 * scripts/migrations/cardiff/replace-home-hero.ts (2-col with photo).
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 805;
const TARGET_BLOCK_ID = 'sec-1';

const SEC1_HTML = `
<style>
  .cd-ar-stats { background: #f6f9fc; padding: 72px 24px 80px 24px; }
  .cd-ar-stats__inner { max-width: 1180px; margin: 0 auto; display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); gap: 56px; align-items: center; }
  .cd-ar-stats__left { display: flex; flex-direction: column; align-items: stretch; }
  .cd-ar-stats__grid { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-bottom: 28px; }
  .cd-ar-stats__card { background: #ffffff; border: 1px solid #e6ecf3; border-radius: 18px; padding: 28px 22px 26px 22px; text-align: center; box-shadow: 0 6px 18px rgba(28, 51, 112, 0.06); display: flex; flex-direction: column; align-items: center; justify-content: flex-start; transition: transform 0.18s ease, box-shadow 0.18s ease; }
  .cd-ar-stats__card:hover { transform: translateY(-2px); box-shadow: 0 14px 32px rgba(28, 51, 112, 0.12); }
  .cd-ar-stats__icon { width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; margin: 0 auto 14px auto; }
  .cd-ar-stats__icon img { max-width: 100%; max-height: 100%; display: block; }
  .cd-ar-stats__value { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 2.4rem; font-weight: 800; line-height: 1; color: #1c3370; margin: 0 0 10px 0; letter-spacing: -0.02em; }
  .cd-ar-stats__label { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.95rem; font-weight: 400; line-height: 1.4; color: #525f7f; margin: 0; }
  .cd-ar-stats__reviews { background: #ffffff; border: 1px solid #e6ecf3; border-radius: 14px; padding: 18px 22px; text-align: center; box-shadow: 0 6px 18px rgba(28, 51, 112, 0.04); }
  .cd-ar-stats__rating { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.25rem; font-weight: 700; color: #25418b; display: inline-flex; align-items: center; gap: 8px; margin: 0 0 4px 0; }
  .cd-ar-stats__stars { color: #ef6632; letter-spacing: 1px; }
  .cd-ar-stats__reviews-link { display: inline-block; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.95rem; color: #25418b; text-decoration: none; font-weight: 600; }
  .cd-ar-stats__reviews-link:hover { color: #1c3370; text-decoration: underline; }
  .cd-ar-stats__photo { width: 100%; aspect-ratio: 4 / 3; border-radius: 18px; background-image: var(--cd-ar-photo); background-size: cover; background-position: center; box-shadow: 0 18px 44px rgba(28, 51, 112, 0.18); }
  @media (max-width: 900px) {
    .cd-ar-stats { padding: 56px 20px 64px 20px; }
    .cd-ar-stats__inner { grid-template-columns: 1fr; gap: 32px; }
    .cd-ar-stats__photo { aspect-ratio: 16 / 10; order: -1; }
    .cd-ar-stats__grid { gap: 16px; }
    .cd-ar-stats__value { font-size: 1.85rem; }
  }
  @media (max-width: 520px) {
    .cd-ar-stats__grid { grid-template-columns: 1fr; }
  }
</style>
<section class="cd-ar-stats">
  <div class="cd-ar-stats__inner">
    <div class="cd-ar-stats__left">
      <div class="cd-ar-stats__grid">
        <div class="cd-ar-stats__card" data-repeat="stats">
          <div class="cd-ar-stats__icon"><img src="{{stats.iconUrl}}" alt="" data-field="iconUrl" /></div>
          <div class="cd-ar-stats__value" data-field="value">{{stats.value}}</div>
          <div class="cd-ar-stats__label" data-field="label">{{stats.label}}</div>
        </div>
      </div>
      <div class="cd-ar-stats__reviews">
        <div class="cd-ar-stats__rating"><span data-field="rating">{{rating}}</span> <span class="cd-ar-stats__stars">★★★★★</span></div>
        <a class="cd-ar-stats__reviews-link" href="{{reviewsUrl}}" data-field="reviewsText">{{reviewsText}}</a>
      </div>
    </div>
    <div class="cd-ar-stats__photo" style="--cd-ar-photo: url('{{photoUrl}}');" aria-hidden="true"></div>
  </div>
</section>
`.trim();

const newSec1Block = {
  id: TARGET_BLOCK_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  order: 2,
  html: SEC1_HTML,
  fields: [
    {
      name: 'stats',
      label: 'Stat blurbs',
      type: 'array' as const,
      itemFields: [
        { name: 'iconUrl', label: 'Icon URL', type: 'image' as const },
        { name: 'value', label: 'Value', type: 'text' as const },
        { name: 'label', label: 'Label', type: 'text' as const },
      ],
    },
    { name: 'rating', label: 'Rating', type: 'text' as const, default: '4.9' },
    { name: 'reviewsText', label: 'Reviews link text', type: 'text' as const, default: 'See Our Google Reviews →' },
    { name: 'reviewsUrl', label: 'Reviews URL', type: 'url' as const, default: 'https://www.google.com/search?q=cardiff+small+business+loans+reviews' },
    { name: 'photoUrl', label: 'Photo URL', type: 'image' as const, default: 'https://cardiff.co/wp-content/uploads/2025/08/Small-Business-Loans-for-Auto-Repair.jpg' },
  ],
  values: {
    stats: [
      {
        iconUrl: 'https://cardiffcompany.wpenginepowered.com/wp-content/uploads/2025/06/Cardiff-lower-rates.svg',
        value: '5.99%',
        label: 'Low rates on secured financing',
      },
      {
        iconUrl: 'https://cardiffcompany.wpenginepowered.com/wp-content/uploads/2025/06/Cardiff-competitor-approval.svg',
        value: '82,000',
        label: "Double our average competitor's approval",
      },
    ],
    rating: '4.9',
    reviewsText: 'See Our Google Reviews →',
    reviewsUrl: 'https://www.google.com/search?q=cardiff+small+business+loans+reviews',
    photoUrl: 'https://cardiffcompany.wpenginepowered.com/wp-content/uploads/2025/08/auto-body-repair-shop-business-loans.svg',
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
  const idx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === TARGET_BLOCK_ID);
  if (idx === -1) {
    console.error(`Post ${POST_ID}: no block with id='${TARGET_BLOCK_ID}'; aborting`);
    process.exit(1);
  }
  const existing = parsed.blocks[idx];
  if (existing.type !== 'section' && existing.type !== 'html-render') {
    console.error(
      `Post ${POST_ID}: block '${TARGET_BLOCK_ID}' has unexpected type '${existing.type}'; aborting`,
    );
    process.exit(1);
  }
  const wasAlreadyHtmlRender = existing.type === 'html-render';
  parsed.blocks[idx] = newSec1Block;
  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: replaced '${TARGET_BLOCK_ID}' with html-render 2-col stats+photo` +
      (wasAlreadyHtmlRender ? ' (was already html-render — reapplied)' : ' (was section)') +
      `. Block count: ${parsed.blocks.length}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
