/**
 * Iter 2: Replace post 817 ('industries-trucking'), block 'sec-1' with an
 * html-render that renders the stats row as a 2-up inline layout
 * (5.99% + $82,000) with an orange underline accent above the body copy.
 *
 * Original cardiff.co page places these two stats side-by-side, with a small
 * orange underline rule beneath the row, followed by the body paragraphs.
 * The port currently stacks them in a single column from a flat section of
 * heading/paragraph/heading/paragraph children.
 *
 * Same pattern as styled-sba-loans-iter3.ts: swap the `section` block for
 * an `html-render` block that uses `data-repeat="stats"` to drive the pills
 * from an editable array.
 *
 * Idempotent: re-runs cleanly over either the original `section` block or a
 * previously-applied `html-render`.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 817;
const TARGET_BLOCK_ID = 'sec-1';

const SEC1_HTML = `
<style>
  .cd-trk-stats { background: #f6f9fc; padding: 56px 24px 64px 24px; }
  .cd-trk-stats__inner { max-width: 980px; margin: 0 auto; }
  .cd-trk-stats__row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 32px; align-items: start; margin: 0 0 22px 0; }
  .cd-trk-stats__cell { display: flex; flex-direction: row; align-items: center; gap: 16px; justify-content: center; text-align: left; }
  .cd-trk-stats__icon { width: 44px; height: 44px; border-radius: 50%; background: #eaf1fb; color: #25418b; display: flex; align-items: center; justify-content: center; flex: 0 0 44px; }
  .cd-trk-stats__icon svg { width: 22px; height: 22px; fill: currentColor; }
  .cd-trk-stats__value { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.75rem; font-weight: 800; line-height: 1.1; color: #1c3370; margin: 0; letter-spacing: -0.01em; }
  .cd-trk-stats__label { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.875rem; font-weight: 400; line-height: 1.4; color: #525f7f; margin: 4px 0 0 0; }
  .cd-trk-stats__rule { width: 64px; height: 3px; background: #ef6632; border-radius: 2px; margin: 8px auto 28px auto; }
  .cd-trk-stats__reviews { display: flex; align-items: center; justify-content: center; gap: 10px; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.95rem; color: #525f7f; margin: 0 0 28px 0; }
  .cd-trk-stats__reviews-stars { color: #ef6632; letter-spacing: 1px; font-size: 1.05rem; }
  .cd-trk-stats__reviews-link { color: #ef6632; font-weight: 700; text-decoration: none; }
  .cd-trk-stats__reviews-link:hover { text-decoration: underline; }
  .cd-trk-stats__body { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; color: #525f7f; margin: 0 0 18px 0; max-width: 720px; margin-left: auto; margin-right: auto; text-align: center; }
  @media (max-width: 700px) {
    .cd-trk-stats__row { grid-template-columns: 1fr; gap: 18px; }
    .cd-trk-stats__cell { justify-content: flex-start; }
  }
</style>
<section class="cd-trk-stats">
  <div class="cd-trk-stats__inner">
    <div class="cd-trk-stats__row">
      <div class="cd-trk-stats__cell" data-repeat="stats">
        <div class="cd-trk-stats__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13h-1.5v6l5.25 3.15.75-1.23-4.5-2.67V7z"/></svg>
        </div>
        <div>
          <p class="cd-trk-stats__value" data-field="value">{{stats.value}}</p>
          <p class="cd-trk-stats__label" data-field="label">{{stats.label}}</p>
        </div>
      </div>
    </div>
    <div class="cd-trk-stats__rule"></div>
    <p class="cd-trk-stats__reviews">
      <span class="cd-trk-stats__reviews-stars" aria-hidden="true">&#9733;&#9733;&#9733;&#9733;&#9733;</span>
      <a class="cd-trk-stats__reviews-link" href="{{reviewsUrl}}" data-field="reviewsText">{{reviewsText}}</a>
    </p>
    <p class="cd-trk-stats__body" data-field="bodyOne">{{bodyOne}}</p>
    <p class="cd-trk-stats__body" data-field="bodyTwo">{{bodyTwo}}</p>
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
      label: 'Stat cells',
      type: 'array' as const,
      itemFields: [
        { name: 'value', label: 'Value', type: 'text' as const },
        { name: 'label', label: 'Label', type: 'text' as const },
      ],
    },
    { name: 'reviewsText', label: 'Reviews link text', type: 'text' as const, default: 'See Our Google Reviews →' },
    { name: 'reviewsUrl', label: 'Reviews link url', type: 'url' as const, default: 'https://www.google.com/search?q=cardiff+small+business+loans+reviews' },
    { name: 'bodyOne', label: 'Body paragraph 1', type: 'textarea' as const },
    { name: 'bodyTwo', label: 'Body paragraph 2', type: 'textarea' as const },
  ],
  values: {
    stats: [
      { value: '5.99%', label: 'Low rates on secured financing' },
      { value: '82,000', label: 'Double our average competitor’s approval' },
    ],
    reviewsText: 'See Our Google Reviews →',
    reviewsUrl: 'https://www.google.com/search?q=cardiff+small+business+loans+reviews',
    bodyOne:
      'Owning and operating a trucking company is no small feat. The costs of trucks, equipment, fuel, and vehicle maintenance can make for a complicated budget. Add delays in invoices and payments that are common in the freight industry — it’s no surprise that many trucking business owners need financing to cover cash flow inconsistencies.',
    bodyTwo:
      'That’s why we’ve streamlined the process and outlined it for you below. Read on to find out how you can qualify and apply for trucking loans.',
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
    console.error(`Post ${POST_ID}: block '${TARGET_BLOCK_ID}' has unexpected type '${existing.type}'; aborting`);
    process.exit(1);
  }
  const wasAlreadyHtmlRender = existing.type === 'html-render';
  parsed.blocks[idx] = newSec1Block;
  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: replaced '${TARGET_BLOCK_ID}' with html-render 2-up stats` +
      (wasAlreadyHtmlRender ? ' (was already html-render — reapplied)' : ' (was section)') +
      `. Block count: ${parsed.blocks.length}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
