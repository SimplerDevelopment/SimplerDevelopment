/**
 * Batch 26 — solutions cards polish.
 *
 * Vision-review feedback:
 *   - Local cards show "Learn more →" as a text link at bottom-LEFT of the
 *     card; live shows only an arrow icon aligned to the bottom-RIGHT corner.
 *   - Local icon area appears to have a light rounded background tile; live
 *     uses a bare icon. (The DOM has no tile in markup, but we still trim
 *     the SVG bounding-box visuals to be safe.)
 *
 * Strategy (post-level CSS, scoped to solutions-cards):
 *   - Make the card relative-positioned so the link can be absolute.
 *   - Hide the "Learn more" text via font-size:0 on the link wrapper, then
 *     restore explicit dimensions on the inner SVG arrow so it remains visible.
 *   - Position the link container absolutely at bottom-right of the card.
 *   - Add bottom-padding on the card so description text doesn't sit under
 *     the absolute-positioned arrow.
 *   - Reset any margin-bottom around the icon's block-level box so it reads
 *     as a bare glyph (no implicit "tile" feel).
 *
 * Idempotent — strips a prior batch26 block before writing.
 *
 * Run with:
 *   bun -r dotenv/config scripts/migrations/postcaptain/batch26-solutions-cards.ts dotenv_config_path=.env.local
 */
import 'dotenv/config';
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const BATCH26_CSS = `/* batch26 — solutions cards (bottom-right arrow, no Learn more text) */

/* Card outer: position relative + reserve bottom space for the arrow. */
.block-content [data-block-id="solutions-cards"] .grid > a > div {
  position: relative !important;
  padding-bottom: 64px !important;
}

/* Icon area: bare glyph, no implicit tile. Tighten the block box. */
.block-content [data-block-id="solutions-cards"] .grid > a > div > svg:first-of-type {
  background: transparent !important;
  padding: 0 !important;
  margin-bottom: 20px !important;
  display: block !important;
  width: auto !important;
  height: 2.5rem !important;
}

/* Link container: absolute bottom-right, hide "Learn more" text, keep arrow. */
.block-content [data-block-id="solutions-cards"] .grid > a > div > div:last-child {
  position: absolute !important;
  right: 28px !important;
  bottom: 24px !important;
  font-size: 0 !important;
  color: transparent !important;
  margin: 0 !important;
}

/* Restore arrow svg sizing/visibility inside the now-zero-font wrapper. */
.block-content [data-block-id="solutions-cards"] .grid > a > div > div:last-child svg {
  width: 22px !important;
  height: 22px !important;
  color: #0A3A5C !important;
  stroke: #0A3A5C !important;
  margin: 0 !important;
  display: inline-block !important;
}

/* /batch26 */`;

async function main() {
  const [post] = await db.select().from(posts).where(eq(posts.id, 302));
  if (!post) throw new Error('post 302 not found');

  let css = post.customCss ?? '';
  const startMarker = '/* batch26 — solutions cards (bottom-right arrow, no Learn more text) */';
  const endMarker = '/* /batch26 */';
  const startIdx = css.indexOf(startMarker);
  if (startIdx >= 0) {
    const endIdx = css.indexOf(endMarker, startIdx);
    if (endIdx >= 0) {
      css = (css.slice(0, startIdx) + css.slice(endIdx + endMarker.length)).trim();
    }
  }
  css = (css ? css + '\n\n' : '') + BATCH26_CSS;

  await db
    .update(posts)
    .set({ customCss: css, updatedAt: new Date() })
    .where(eq(posts.id, 302));

  console.log('post 302 batch26-solutions-cards applied. customCss length:', css.length);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
