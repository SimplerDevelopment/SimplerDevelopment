/**
 * Batch 29 — stats heading-fit refinement.
 *
 * After batch23, "$965K+ Raised" still wraps onto two lines because:
 *   - The logo column (padding-right: 150px) cut into available heading width.
 *   - Inline style font-size:clamp(2.5rem,4vw,3.5rem) compounds with attribute
 *     selector specificity quirks; the value can render up to ~56px on desktop.
 *   - Each card in a 2-col grid at viewport 1440 is ~580px; minus 32+150 left
 *     ~398px which is just shy of "$965K+ Raised" at 56px.
 *
 * Fix:
 *   - Cap heading font-size more aggressively (max ~2.4rem ≈ 38.4px).
 *   - Reduce logo-reserve padding-right to 110px (tightens logo+text column).
 *   - Force the value+suffix container to white-space: nowrap and let large
 *     overflow shrink via container queries — but since browser support varies,
 *     also reduce the suffix font ratio so the line fits unconditionally.
 *
 * Idempotent — strips a prior batch29 block before writing.
 *
 * Run with:
 *   bun -r dotenv/config scripts/migrations/postcaptain/batch29-stats-fit.ts dotenv_config_path=.env.local
 */
import 'dotenv/config';
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const BATCH29_CSS = `/* batch29 — stats heading-fit refinement (single-line value+suffix) */

/* Reduce logo column reserve so heading column gets more room. */
.block-content [data-block-id="cs-metrics"] .grid > a > div > div:first-child,
.block-content [data-block-id="cs-metrics"] .grid > div > div > div:first-child {
  padding-right: 110px !important;
}

/* Cap value heading more aggressively + nowrap so suffix stays inline. */
.block-content [data-block-id="cs-metrics"] .grid > a > div > div:first-child > div:first-child,
.block-content [data-block-id="cs-metrics"] .grid > div > div > div:first-child > div:first-child {
  font-size: clamp(1.7rem, 2.6vw, 2.4rem) !important;
  line-height: 1.05 !important;
  letter-spacing: -0.01em !important;
  white-space: nowrap !important;
  overflow: visible !important;
}

/* Suffix shrink-ratio: 0.45 of the heading so a 38px heading gets a 17px suffix. */
.block-content [data-block-id="cs-metrics"] .pc-metric-suffix {
  font-size: 0.45em !important;
  font-weight: 600 !important;
  letter-spacing: 0 !important;
  margin-left: 0.35em !important;
  white-space: nowrap !important;
  display: inline !important;
  vertical-align: baseline !important;
}

/* Logo: slightly smaller for headers like Landmark/Loyola which are wide. */
.block-content [data-block-id="cs-metrics"] .grid > a > div > div.mt-6 img,
.block-content [data-block-id="cs-metrics"] .grid > div > div > div.mt-6 img {
  height: 44px !important;
  max-height: 44px !important;
  max-width: 110px !important;
}

/* /batch29 */`;

function stripBlock(css: string, startMarker: string, endMarker: string): string {
  const startIdx = css.indexOf(startMarker);
  if (startIdx < 0) return css;
  const endIdx = css.indexOf(endMarker, startIdx);
  if (endIdx < 0) return css;
  return (css.slice(0, startIdx) + css.slice(endIdx + endMarker.length)).trim();
}

async function main() {
  const [post] = await db.select().from(posts).where(eq(posts.id, 302));
  if (!post) throw new Error('post 302 not found');

  let css = post.customCss ?? '';
  css = stripBlock(css, '/* batch29 — stats heading-fit refinement (single-line value+suffix) */', '/* /batch29 */');
  css = (css ? css + '\n\n' : '') + BATCH29_CSS;

  await db
    .update(posts)
    .set({ customCss: css, updatedAt: new Date() })
    .where(eq(posts.id, 302));

  console.log('post 302 batch29-stats-fit applied. customCss length:', css.length);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
