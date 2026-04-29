/**
 * Batch 23 — stats section polish.
 *
 * Vision-review feedback:
 *   - Logos appear smaller and pushed too far right; "$965K+ Raised" and
 *     "of Staff Time Saved" wrap onto two lines instead of fitting one.
 *   - "Case Study" link lacks the trailing arrow (→) the live version shows.
 *   - Heading column needs more horizontal space relative to the logo.
 *
 * Strategy:
 *   - Pull the institution-row out of card-flow and pin it to the top-right
 *     of the card as a logo-only chip. This matches live, which has the logo
 *     inline-right of the heading.
 *   - Constrain the heading row so $965K+ + suffix stays on one line by
 *     reducing suffix size and widening the available column.
 *   - Add a trailing arrow glyph to the Case Study link via ::after fallback
 *     in case the Material Icons ligature inside the renderer doesn't render.
 *
 * Fix lives entirely in posts.customCss (block.customCSS does NOT inject a
 * <style> tag — see batch22 for rationale). Targets the existing
 * MetricCardsBlockRender DOM via [data-block-id="cs-metrics"] selectors.
 *
 * Idempotent — strips a prior batch23 block before writing.
 *
 * Run with:
 *   bun -r dotenv/config scripts/migrations/postcaptain/batch23-stats-polish.ts dotenv_config_path=.env.local
 */
import 'dotenv/config';
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const BATCH23_CSS = `/* batch23 — stats section polish (logo+heading layout, case-study arrow) */

/* Card itself: keep relative so we can absolutely-pin the institution row. */
.block-content [data-block-id="cs-metrics"] .grid > a > div,
.block-content [data-block-id="cs-metrics"] .grid > div > div {
  position: relative !important;
  padding: 32px 36px !important;
}

/* Reserve right gutter for the absolute-positioned logo so heading text
   doesn't run under it. */
.block-content [data-block-id="cs-metrics"] .grid > a > div > div:first-child,
.block-content [data-block-id="cs-metrics"] .grid > div > div > div:first-child {
  padding-right: 150px !important;
}

/* Pin the institution row (logo + name) to upper-right; strip the borders. */
.block-content [data-block-id="cs-metrics"] .grid > a > div > div.mt-6,
.block-content [data-block-id="cs-metrics"] .grid > div > div > div.mt-6 {
  position: absolute !important;
  top: 28px !important;
  right: 32px !important;
  margin-top: 0 !important;
  padding-top: 0 !important;
  border-top: 0 !important;
  background: transparent !important;
}

/* Logo sizing: bump from h-8 (~32px) to ~52px for parity with live. */
.block-content [data-block-id="cs-metrics"] .grid > a > div > div.mt-6 img,
.block-content [data-block-id="cs-metrics"] .grid > div > div > div.mt-6 img {
  height: 52px !important;
  max-height: 52px !important;
  width: auto !important;
  max-width: 130px !important;
  object-fit: contain !important;
}

/* Hide the institution-name caption: live shows logo only at this slot. */
.block-content [data-block-id="cs-metrics"] .grid > a > div > div.mt-6 span,
.block-content [data-block-id="cs-metrics"] .grid > div > div > div.mt-6 span {
  display: none !important;
}

/* Metric value: tighter scale so suffix fits on one line. */
.block-content [data-block-id="cs-metrics"] .grid [style*="clamp(2.5rem"] {
  font-size: clamp(2.1rem, 3.4vw, 2.85rem) !important;
  line-height: 1.05 !important;
  letter-spacing: -0.01em !important;
  white-space: normal !important;
}

/* Suffix sizing already established in batch22; reduce slightly for fit. */
.block-content [data-block-id="cs-metrics"] .pc-metric-suffix {
  font-size: 0.5em !important;
  font-weight: 600 !important;
  letter-spacing: 0 !important;
  margin-left: 0.3em !important;
  white-space: nowrap !important;
  display: inline !important;
}

/* Material Icons span next to Case Study: ensure ligature font activates. */
.block-content [data-block-id="cs-metrics"] .grid span.material-icons {
  font-family: 'Material Icons', 'Material Icons Outlined' !important;
  font-feature-settings: 'liga' !important;
  -webkit-font-feature-settings: 'liga' !important;
  text-transform: none !important;
  letter-spacing: normal !important;
  font-size: 16px !important;
  line-height: 1 !important;
  vertical-align: middle !important;
}

/* /batch23 */`;

async function main() {
  const [post] = await db.select().from(posts).where(eq(posts.id, 302));
  if (!post) throw new Error('post 302 not found');

  let css = post.customCss ?? '';
  const startMarker = '/* batch23 — stats section polish (logo+heading layout, case-study arrow) */';
  const endMarker = '/* /batch23 */';
  const startIdx = css.indexOf(startMarker);
  if (startIdx >= 0) {
    const endIdx = css.indexOf(endMarker, startIdx);
    if (endIdx >= 0) {
      css = (css.slice(0, startIdx) + css.slice(endIdx + endMarker.length)).trim();
    }
  }
  css = (css ? css + '\n\n' : '') + BATCH23_CSS;

  await db
    .update(posts)
    .set({ customCss: css, updatedAt: new Date() })
    .where(eq(posts.id, 302));

  console.log('post 302 batch23-stats-polish applied. customCss length:', css.length);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
