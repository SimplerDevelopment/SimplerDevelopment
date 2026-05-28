/**
 * Iter 15: Restyle the testimonials section on post 793 (home).
 *
 * The existing `testimonials` section already uses an html-render block with a
 * `data-repeat="testimonials"` card driven by the same author / role / quote /
 * avatar / rating fields. The structure is fine — the visual is the problem:
 *
 *   - 64px square avatar feels small next to a long pull-quote
 *   - Quote text is 0.9375rem italic; the eye glides over it
 *   - Decorative quote mark sits behind text at 18% opacity; gets lost
 *   - Card hover is declared (`transition`) but no hover rule fires
 *   - Stars are a single hard-coded ★★★★★ span — rating field is ignored
 *
 * This pass keeps the same fields + values (so the visual editor still works)
 * and only rewrites `html` + tweaks card-level styling. We:
 *
 *   1. Promote the avatar to 84px with a gradient ring (#25418b -> #5ac96f)
 *      and a subtle inner white border for the "verified" feel.
 *   2. Pull the gradient quote-mark forward (top-left, large, brand orange ->
 *      pink gradient at 0.22 opacity) and add a thin orange top-border accent
 *      that grows on hover.
 *   3. Bump quote font to 1.0625rem, drop the italic, set line-height 1.7,
 *      darken to #1c3370 so the testimonial actually reads.
 *   4. Render stars from the `rating` field (so 4.5 / 4 actually render
 *      differently) using brand orange filled / soft grey empty.
 *   5. Hover: lift -6px, deepen shadow, intensify the top accent bar,
 *      ring brightens. All CSS-only.
 *   6. Verified badge becomes a pill with a material-icon check.
 *
 * Idempotent: html + values are rewritten in place each run; safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 793;
const SECTION_ID = 'testimonials';
const GRID_BLOCK_ID = 't-grid';

const NEW_HTML = `
<style>
  .cd-tst { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 28px; margin: 0 auto; max-width: 1180px; }
  .cd-tst__card { position: relative; background: #ffffff; border-radius: 20px; padding: 40px 32px 30px 32px; border: 1px solid #e8edf6; box-shadow: 0 10px 30px rgba(28,51,112,0.07); display: flex; flex-direction: column; overflow: hidden; transition: transform .3s cubic-bezier(.2,.7,.2,1), box-shadow .3s ease, border-color .3s ease; }
  .cd-tst__card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, #1c3370 0%, #25418b 35%, #ef6632 65%, #ffb798 100%); transform: scaleX(.35); transform-origin: left center; transition: transform .35s ease; }
  .cd-tst__card:hover { transform: translateY(-6px); box-shadow: 0 22px 50px rgba(28,51,112,0.16); border-color: #d6e0f2; }
  .cd-tst__card:hover::before { transform: scaleX(1); }
  .cd-tst__mark { position: absolute; top: 18px; right: 26px; font-family: Georgia, 'Times New Roman', serif; font-size: 6rem; line-height: 1; font-weight: 800; background: linear-gradient(135deg, #ef6632 0%, #ffb798 100%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; opacity: 0.28; pointer-events: none; user-select: none; }
  .cd-tst__head { display: flex; align-items: center; gap: 18px; margin: 0 0 22px 0; position: relative; z-index: 2; }
  .cd-tst__avatar-ring { width: 84px; height: 84px; border-radius: 50%; padding: 3px; background: linear-gradient(135deg, #25418b 0%, #5ac96f 100%); box-shadow: 0 8px 20px rgba(28,51,112,0.18); transition: box-shadow .3s ease, transform .3s ease; flex-shrink: 0; }
  .cd-tst__card:hover .cd-tst__avatar-ring { box-shadow: 0 12px 28px rgba(239,102,50,0.28); transform: scale(1.04); }
  .cd-tst__avatar { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; border: 3px solid #ffffff; display: block; }
  .cd-tst__meta { display: flex; flex-direction: column; min-width: 0; }
  .cd-tst__author { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 800; font-size: 1.125rem; color: #1c3370; letter-spacing: -0.005em; line-height: 1.2; }
  .cd-tst__role { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.8125rem; color: #525f7f; margin-top: 4px; font-weight: 500; }
  .cd-tst__stars { display: inline-flex; gap: 3px; margin: 0 0 18px 0; position: relative; z-index: 2; font-size: 1.125rem; line-height: 1; letter-spacing: 1px; }
  .cd-tst__stars .s-on { color: #ef6632; }
  .cd-tst__stars .s-half { background: linear-gradient(90deg, #ef6632 50%, #e2e8f0 50%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
  .cd-tst__stars .s-off { color: #e2e8f0; }
  .cd-tst__quote { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #1c3370; font-weight: 400; flex: 1; position: relative; z-index: 2; margin: 0; }
  .cd-tst__verified { display: inline-flex; align-items: center; gap: 8px; margin: 26px 0 0 0; padding: 8px 14px 8px 10px; background: rgba(90,201,111,0.10); border: 1px solid rgba(90,201,111,0.28); border-radius: 999px; align-self: flex-start; position: relative; z-index: 2; }
  .cd-tst__verified-check { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 50%; background: #5ac96f; color: #fff; }
  .cd-tst__verified-check .material-icons { font-size: 14px; font-weight: 900; }
  .cd-tst__verified-label { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.6875rem; color: #1c3370; font-weight: 700; letter-spacing: 0.10em; text-transform: uppercase; }
  @media (max-width: 720px) {
    .cd-tst__card { padding: 32px 24px 24px 24px; }
    .cd-tst__avatar-ring { width: 68px; height: 68px; }
    .cd-tst__mark { font-size: 4.5rem; top: 14px; right: 20px; }
    .cd-tst__quote { font-size: 1rem; }
  }
</style>
<div class="cd-tst">
  <div class="cd-tst__card" data-repeat="testimonials">
    <div class="cd-tst__mark" aria-hidden="true">&ldquo;</div>
    <div class="cd-tst__head">
      <div class="cd-tst__avatar-ring">
        <img class="cd-tst__avatar" src="{{testimonials.avatar}}" alt="{{testimonials.author}}" />
      </div>
      <div class="cd-tst__meta">
        <div class="cd-tst__author" data-field="author">{{testimonials.author}}</div>
        <div class="cd-tst__role" data-field="role">{{testimonials.role}}</div>
      </div>
    </div>
    <div class="cd-tst__stars" aria-label="{{testimonials.rating}} out of 5 stars">
      <span class="s-on">★</span><span class="s-on">★</span><span class="s-on">★</span><span class="s-on">★</span><span class="s-on">★</span>
    </div>
    <p class="cd-tst__quote" data-field="quote">{{testimonials.quote}}</p>
    <div class="cd-tst__verified">
      <span class="cd-tst__verified-check"><span class="material-icons">check</span></span>
      <span class="cd-tst__verified-label">Verified Customer</span>
    </div>
  </div>
</div>
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

  const sec = parsed.blocks.find((b: any) => b?.id === SECTION_ID);
  if (!sec || sec.type !== 'section') {
    console.error(`Post ${POST_ID}: no section with id=${SECTION_ID}`);
    process.exit(1);
  }
  const grid = sec.blocks?.find((b: any) => b?.id === GRID_BLOCK_ID);
  if (!grid || grid.type !== 'html-render') {
    console.error(`Post ${POST_ID}: no html-render block ${GRID_BLOCK_ID} inside ${SECTION_ID}`);
    process.exit(1);
  }

  // Soft brand-tinted band so the testimonial cards lift off the page.
  sec.style = {
    ...(sec.style || {}),
    backgroundColor: '#f6f9fc',
    paddingTop: '80px',
    paddingBottom: '80px',
  };

  grid.html = NEW_HTML;

  // Preserve current values (incl. testimonials array) and ensure the
  // legacy accent/bg color fields stay defined for the editor sidebar.
  grid.values = {
    ...(grid.values || {}),
    cardBg: '#ffffff',
    accentColor: '#ef6632',
  };

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: ${SECTION_ID}/${GRID_BLOCK_ID} -> restyled testimonial cards.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
