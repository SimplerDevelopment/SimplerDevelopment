/**
 * Iter 10 (newsroom, post 826): Add a "Press Kit & Media Assets" downloads
 * band between sec-3b (press contact) and sec-4-subscribe (newsletter).
 *
 * Why this polish, not another tweak elsewhere:
 *   Iters 1-9 covered hero+featured (sec-1), latest news cards (sec-2),
 *   browse-by-topic (sec-2b), by-the-numbers stats (sec-2c), resource hub
 *   3-up (sec-2d-hub), in-the-media tabs (sec-3), press contact (sec-3b),
 *   newsletter subscribe (sec-4-subscribe), and the final CTA. The page
 *   now reaches a journalist, but the moment they accept the invitation to
 *   "work on a story," they have nowhere to download the assets they need
 *   to actually publish: the wordmark logo, an executive headshot, a brand
 *   color sheet, or a one-page company fact sheet.
 *
 *   Every credible newsroom (Stripe, Plaid, Block, Toast, SBA, Carta) ships
 *   a Press Kit / Media Assets band with downloadable tiles. Our page has a
 *   noticeable gap between "Email the Press Team" and "Subscribe to the
 *   newsletter" where this naturally lives.
 *
 *   It's also a visually distinctive new pattern — 4-up download tiles with
 *   file-type chips (SVG / PNG / PDF / ZIP) and per-tile gradient icon chips
 *   — that doesn't repeat anything else on the page.
 *
 * Pattern reused: data-repeat="assets" 4-up grid (canonical icon-card grid
 *   from styled-equipment-leasing-iter3.ts), brand palette only, Material
 *   Icons, Raleway/Open Sans. Light section to break the run of dark bands
 *   (sec-2c dark stats → sec-2d-hub dark hub → sec-3 light media → sec-3b
 *   dark press card → [NEW LIGHT] → sec-4 dark subscribe).
 *
 * Idempotent: re-running detects an existing html-render block at id
 *   `sec-3c-presskit` and rewrites it in place (preserving user-edited
 *   values via spread); otherwise inserts immediately AFTER `sec-3b`.
 *   Block `order` is re-numbered sequentially after the splice.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 826;
const NEW_BLOCK_ID = 'sec-3c-presskit';
const INSERT_AFTER_ID = 'sec-3b';

const PRESSKIT_HTML = `
<style>
  .cd-pk { background: #f6f9fc; padding: 80px 24px 84px 24px; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; position: relative; overflow: hidden; }
  .cd-pk::before { content: ''; position: absolute; top: -100px; right: -120px; width: 320px; height: 320px; border-radius: 50%; background: radial-gradient(circle at 50% 50%, rgba(37,65,139,0.10), rgba(37,65,139,0) 65%); pointer-events: none; }
  .cd-pk__inner { max-width: 1180px; margin: 0 auto; position: relative; z-index: 2; }
  .cd-pk__header { display: grid; grid-template-columns: 1.1fr 1fr; gap: 40px; align-items: end; margin: 0 0 40px 0; }
  .cd-pk__eyebrow { font-family: 'Raleway', sans-serif; font-size: 0.82rem; font-weight: 800; letter-spacing: 0.16em; color: #ef6632; text-transform: uppercase; margin: 0 0 12px 0; display: inline-flex; align-items: center; gap: 8px; }
  .cd-pk__eyebrow .material-icons { font-size: 18px; }
  .cd-pk__title { font-family: 'Raleway', sans-serif; font-size: 2.15rem; font-weight: 800; line-height: 1.18; letter-spacing: -0.015em; color: #1c3370; margin: 0 0 14px 0; }
  .cd-pk__sub { font-size: 1.0125rem; line-height: 1.7; color: #525f7f; margin: 0; max-width: 560px; }
  .cd-pk__bulk { display: flex; flex-direction: column; align-items: flex-end; gap: 10px; }
  .cd-pk__bulk-cta { display: inline-flex; align-items: center; gap: 10px; padding: 14px 22px; background: linear-gradient(135deg, #1c3370 0%, #25418b 100%); color: #ffffff; font-family: 'Raleway', sans-serif; font-size: 0.86rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; border-radius: 10px; text-decoration: none; box-shadow: 0 12px 26px rgba(28,51,112,0.24); transition: transform .2s ease, box-shadow .2s ease; }
  .cd-pk__bulk-cta:hover { transform: translateY(-2px); box-shadow: 0 18px 36px rgba(28,51,112,0.32); }
  .cd-pk__bulk-cta .material-icons { font-size: 20px; }
  .cd-pk__bulk-note { font-size: 0.82rem; color: #6a778f; margin: 0; display: inline-flex; align-items: center; gap: 6px; }
  .cd-pk__bulk-note .material-icons { font-size: 14px; color: #5ac96f; }
  .cd-pk__grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 22px; }
  .cd-pk__tile { background: #ffffff; border: 1px solid #eef2f9; border-radius: 14px; padding: 26px 24px 22px 24px; display: flex; flex-direction: column; text-decoration: none; color: inherit; transition: transform .22s ease, box-shadow .22s ease, border-color .22s ease; position: relative; overflow: hidden; }
  .cd-pk__tile::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 3px; background: #25418b; transition: background .22s ease; }
  .cd-pk__tile:nth-child(2)::before { background: #ef6632; }
  .cd-pk__tile:nth-child(3)::before { background: #5ac96f; }
  .cd-pk__tile:nth-child(4)::before { background: #ffb798; }
  .cd-pk__tile:hover { transform: translateY(-4px); box-shadow: 0 22px 44px rgba(28,51,112,0.14); border-color: #d9e1ee; }
  .cd-pk__row { display: flex; align-items: center; justify-content: space-between; margin: 0 0 18px 0; }
  .cd-pk__icon { width: 48px; height: 48px; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #ffffff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-pk__tile:nth-child(2) .cd-pk__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-pk__tile:nth-child(3) .cd-pk__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-pk__tile:nth-child(4) .cd-pk__icon { background: linear-gradient(135deg, #ffb798 0%, #ef6632 100%); box-shadow: 0 8px 18px rgba(255,183,152,0.32); }
  .cd-pk__icon .material-icons { font-size: 24px; }
  .cd-pk__chip { font-family: 'Raleway', sans-serif; font-size: 0.66rem; font-weight: 800; letter-spacing: 0.12em; color: #25418b; text-transform: uppercase; padding: 5px 10px; background: #eef3fb; border-radius: 999px; }
  .cd-pk__tile-title { font-family: 'Raleway', sans-serif; font-size: 1.05rem; font-weight: 800; color: #1c3370; line-height: 1.28; letter-spacing: -0.005em; margin: 0 0 8px 0; }
  .cd-pk__tile-desc { font-size: 0.9rem; line-height: 1.55; color: #525f7f; margin: 0 0 18px 0; flex: 1; }
  .cd-pk__tile-foot { display: flex; align-items: center; justify-content: space-between; padding-top: 14px; border-top: 1px solid #eef2f9; margin-top: auto; }
  .cd-pk__size { font-family: 'Open Sans', sans-serif; font-size: 0.78rem; color: #6a778f; }
  .cd-pk__dl { display: inline-flex; align-items: center; gap: 6px; font-family: 'Raleway', sans-serif; font-size: 0.78rem; font-weight: 800; letter-spacing: 0.06em; color: #25418b; text-transform: uppercase; }
  .cd-pk__tile:nth-child(2) .cd-pk__dl { color: #ef6632; }
  .cd-pk__tile:nth-child(3) .cd-pk__dl { color: #3aa856; }
  .cd-pk__tile:nth-child(4) .cd-pk__dl { color: #d8501e; }
  .cd-pk__dl .material-icons { font-size: 16px; transition: transform .22s ease; }
  .cd-pk__tile:hover .cd-pk__dl .material-icons { transform: translateY(2px); }
  @media (max-width: 1100px) {
    .cd-pk__grid { grid-template-columns: repeat(2, 1fr); }
    .cd-pk__header { grid-template-columns: 1fr; align-items: start; gap: 24px; }
    .cd-pk__bulk { align-items: flex-start; }
  }
  @media (max-width: 560px) {
    .cd-pk { padding: 60px 18px 64px 18px; }
    .cd-pk__title { font-size: 1.75rem; }
    .cd-pk__grid { grid-template-columns: 1fr; gap: 16px; }
  }
</style>
<section class="cd-pk">
  <div class="cd-pk__inner">
    <div class="cd-pk__header">
      <div>
        <p class="cd-pk__eyebrow"><span class="material-icons">download_for_offline</span>{{eyebrow}}</p>
        <h2 class="cd-pk__title">{{title}}</h2>
        <p class="cd-pk__sub">{{sub}}</p>
      </div>
      <div class="cd-pk__bulk">
        <a class="cd-pk__bulk-cta" href="{{bulkHref}}">
          <span class="material-icons">archive</span>{{bulkCtaText}}
        </a>
        <p class="cd-pk__bulk-note"><span class="material-icons">check_circle</span>{{bulkNote}}</p>
      </div>
    </div>
    <div class="cd-pk__grid">
      <a class="cd-pk__tile" href="{{tile1Href}}" download>
        <div class="cd-pk__row">
          <div class="cd-pk__icon"><span class="material-icons">{{tile1Icon}}</span></div>
          <span class="cd-pk__chip">{{tile1Format}}</span>
        </div>
        <h3 class="cd-pk__tile-title">{{tile1Title}}</h3>
        <p class="cd-pk__tile-desc">{{tile1Desc}}</p>
        <div class="cd-pk__tile-foot">
          <span class="cd-pk__size">{{tile1Size}}</span>
          <span class="cd-pk__dl">Download<span class="material-icons">file_download</span></span>
        </div>
      </a>
      <a class="cd-pk__tile" href="{{tile2Href}}" download>
        <div class="cd-pk__row">
          <div class="cd-pk__icon"><span class="material-icons">{{tile2Icon}}</span></div>
          <span class="cd-pk__chip">{{tile2Format}}</span>
        </div>
        <h3 class="cd-pk__tile-title">{{tile2Title}}</h3>
        <p class="cd-pk__tile-desc">{{tile2Desc}}</p>
        <div class="cd-pk__tile-foot">
          <span class="cd-pk__size">{{tile2Size}}</span>
          <span class="cd-pk__dl">Download<span class="material-icons">file_download</span></span>
        </div>
      </a>
      <a class="cd-pk__tile" href="{{tile3Href}}" download>
        <div class="cd-pk__row">
          <div class="cd-pk__icon"><span class="material-icons">{{tile3Icon}}</span></div>
          <span class="cd-pk__chip">{{tile3Format}}</span>
        </div>
        <h3 class="cd-pk__tile-title">{{tile3Title}}</h3>
        <p class="cd-pk__tile-desc">{{tile3Desc}}</p>
        <div class="cd-pk__tile-foot">
          <span class="cd-pk__size">{{tile3Size}}</span>
          <span class="cd-pk__dl">Download<span class="material-icons">file_download</span></span>
        </div>
      </a>
      <a class="cd-pk__tile" href="{{tile4Href}}" download>
        <div class="cd-pk__row">
          <div class="cd-pk__icon"><span class="material-icons">{{tile4Icon}}</span></div>
          <span class="cd-pk__chip">{{tile4Format}}</span>
        </div>
        <h3 class="cd-pk__tile-title">{{tile4Title}}</h3>
        <p class="cd-pk__tile-desc">{{tile4Desc}}</p>
        <div class="cd-pk__tile-foot">
          <span class="cd-pk__size">{{tile4Size}}</span>
          <span class="cd-pk__dl">Download<span class="material-icons">file_download</span></span>
        </div>
      </a>
    </div>
  </div>
</section>
`.trim();

const DEFAULTS = {
  eyebrow: 'PRESS KIT & MEDIA ASSETS',
  title: 'Everything you need to file your story.',
  sub: 'Approved Cardiff logos, executive headshots, the brand color sheet, and the one-page company fact sheet — pre-cleared for editorial use. No watermarks, no waiting on email.',
  bulkCtaText: 'Download Full Press Kit',
  bulkHref: '/press-kit/cardiff-press-kit.zip',
  bulkNote: 'Single zip, 14 MB, updated quarterly.',
  // Tile 1 — Logo pack (navy accent)
  tile1Icon: 'workspace_premium',
  tile1Format: 'SVG + PNG',
  tile1Title: 'Cardiff Logo Pack',
  tile1Desc: 'Full-color, all-white, and all-black wordmarks in vector and 4K raster.',
  tile1Size: '2.4 MB',
  tile1Href: '/press-kit/cardiff-logos.zip',
  // Tile 2 — Brand colors (orange accent)
  tile2Icon: 'palette',
  tile2Format: 'PDF',
  tile2Title: 'Brand Color Sheet',
  tile2Desc: 'Approved Cardiff palette with HEX, RGB, CMYK, and Pantone references.',
  tile2Size: '420 KB',
  tile2Href: '/press-kit/cardiff-brand-colors.pdf',
  // Tile 3 — Headshots (green accent)
  tile3Icon: 'account_circle',
  tile3Format: 'JPG',
  tile3Title: 'Executive Headshots',
  tile3Desc: 'Press-resolution portraits of the Cardiff leadership team, captioned and credited.',
  tile3Size: '8.1 MB',
  tile3Href: '/press-kit/cardiff-executive-headshots.zip',
  // Tile 4 — Fact sheet (peach accent)
  tile4Icon: 'description',
  tile4Format: 'PDF',
  tile4Title: 'Company Fact Sheet',
  tile4Desc: 'One-page primer on Cardiff: founding, scale, leadership, lending products, and licensing.',
  tile4Size: '1.1 MB',
  tile4Href: '/press-kit/cardiff-fact-sheet.pdf',
};

const presskitBlock = {
  id: NEW_BLOCK_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  order: 0, // re-numbered below
  html: PRESSKIT_HTML,
  style: {
    backgroundColor: '#f6f9fc',
  },
  fields: [
    { name: 'eyebrow', label: 'Eyebrow', type: 'text', default: DEFAULTS.eyebrow },
    { name: 'title', label: 'Title', type: 'text', default: DEFAULTS.title },
    { name: 'sub', label: 'Subtitle', type: 'textarea', default: DEFAULTS.sub },
    { name: 'bulkCtaText', label: 'Bulk CTA text', type: 'text', default: DEFAULTS.bulkCtaText },
    { name: 'bulkHref', label: 'Bulk download URL', type: 'text', default: DEFAULTS.bulkHref },
    { name: 'bulkNote', label: 'Bulk note', type: 'text', default: DEFAULTS.bulkNote },
    // Tile 1
    { name: 'tile1Icon', label: 'Tile 1 — icon', type: 'text', default: DEFAULTS.tile1Icon },
    { name: 'tile1Format', label: 'Tile 1 — format chip', type: 'text', default: DEFAULTS.tile1Format },
    { name: 'tile1Title', label: 'Tile 1 — title', type: 'text', default: DEFAULTS.tile1Title },
    { name: 'tile1Desc', label: 'Tile 1 — description', type: 'textarea', default: DEFAULTS.tile1Desc },
    { name: 'tile1Size', label: 'Tile 1 — file size', type: 'text', default: DEFAULTS.tile1Size },
    { name: 'tile1Href', label: 'Tile 1 — download URL', type: 'text', default: DEFAULTS.tile1Href },
    // Tile 2
    { name: 'tile2Icon', label: 'Tile 2 — icon', type: 'text', default: DEFAULTS.tile2Icon },
    { name: 'tile2Format', label: 'Tile 2 — format chip', type: 'text', default: DEFAULTS.tile2Format },
    { name: 'tile2Title', label: 'Tile 2 — title', type: 'text', default: DEFAULTS.tile2Title },
    { name: 'tile2Desc', label: 'Tile 2 — description', type: 'textarea', default: DEFAULTS.tile2Desc },
    { name: 'tile2Size', label: 'Tile 2 — file size', type: 'text', default: DEFAULTS.tile2Size },
    { name: 'tile2Href', label: 'Tile 2 — download URL', type: 'text', default: DEFAULTS.tile2Href },
    // Tile 3
    { name: 'tile3Icon', label: 'Tile 3 — icon', type: 'text', default: DEFAULTS.tile3Icon },
    { name: 'tile3Format', label: 'Tile 3 — format chip', type: 'text', default: DEFAULTS.tile3Format },
    { name: 'tile3Title', label: 'Tile 3 — title', type: 'text', default: DEFAULTS.tile3Title },
    { name: 'tile3Desc', label: 'Tile 3 — description', type: 'textarea', default: DEFAULTS.tile3Desc },
    { name: 'tile3Size', label: 'Tile 3 — file size', type: 'text', default: DEFAULTS.tile3Size },
    { name: 'tile3Href', label: 'Tile 3 — download URL', type: 'text', default: DEFAULTS.tile3Href },
    // Tile 4
    { name: 'tile4Icon', label: 'Tile 4 — icon', type: 'text', default: DEFAULTS.tile4Icon },
    { name: 'tile4Format', label: 'Tile 4 — format chip', type: 'text', default: DEFAULTS.tile4Format },
    { name: 'tile4Title', label: 'Tile 4 — title', type: 'text', default: DEFAULTS.tile4Title },
    { name: 'tile4Desc', label: 'Tile 4 — description', type: 'textarea', default: DEFAULTS.tile4Desc },
    { name: 'tile4Size', label: 'Tile 4 — file size', type: 'text', default: DEFAULTS.tile4Size },
    { name: 'tile4Href', label: 'Tile 4 — download URL', type: 'text', default: DEFAULTS.tile4Href },
  ],
  values: { ...DEFAULTS },
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

  const existingIdx = parsed.blocks.findIndex((b: any) => b?.id === NEW_BLOCK_ID);
  const afterIdx = parsed.blocks.findIndex((b: any) => b?.id === INSERT_AFTER_ID);
  if (afterIdx === -1 && existingIdx === -1) {
    console.error(`Post ${POST_ID}: no block with id=${INSERT_AFTER_ID}; aborting`);
    process.exit(1);
  }

  if (existingIdx !== -1) {
    const prev = parsed.blocks[existingIdx];
    parsed.blocks[existingIdx] = {
      ...presskitBlock,
      order: prev.order ?? presskitBlock.order,
      values: { ...presskitBlock.values, ...(prev.values || {}) },
    };
    console.log(`Post ${POST_ID}: rewrote existing ${NEW_BLOCK_ID} block at idx ${existingIdx}.`);
  } else {
    parsed.blocks.splice(afterIdx + 1, 0, presskitBlock);
    console.log(`Post ${POST_ID}: inserted ${NEW_BLOCK_ID} after ${INSERT_AFTER_ID} (at idx ${afterIdx + 1}).`);
  }

  parsed.blocks.forEach((b: any, i: number) => {
    b.order = i;
  });

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: newsroom iter 10 (press kit downloads) applied. Block count: ${parsed.blocks.length}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
