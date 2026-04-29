/**
 * Batch 39 — stats section typography uplift.
 *
 * Vision-review consistently flags stats at 78-85 with the priority being
 * "Match the live card typography scale" / heading "appears smaller, less
 * imposing." Live's stats heading is visibly ~50-56px (3.1-3.5rem); local
 * runs at 2.75rem (44px). Live's metric numbers also feel ~10% larger.
 *
 * Fix (post-level customCss only — no block schema changes):
 *   1. Pump cs-heading font-size to 3.25rem on desktop, with a slightly
 *      tighter line-height + more letter-spacing for the imposing feel.
 *   2. Bump metric-card value font-size by ~8%.
 *   3. Slightly tighten the secondary-label width so "BY ELIMINATING
 *      ADVANCE BADGE PRINTING" stays on one line where space allows.
 *
 * Idempotent: stripping batch39 marker. Run with:
 *   bun -r dotenv/config scripts/migrations/postcaptain/batch39-stats-typography.ts dotenv_config_path=.env.local
 */
import 'dotenv/config';
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const BATCH39_CSS = `/* batch39 — stats section typography uplift */

/* Heading: bigger, more dominant. Live runs ~50-56px; we use 3.25rem (52px). */
.block-content [data-block-id="cs-heading"] > div,
.block-content [data-block-id="cs-heading"] h1,
.block-content [data-block-id="cs-heading"] h2,
.block-content [data-block-id="cs-heading"] h3 {
  font-size: 3.25rem !important;
  line-height: 1.05 !important;
  letter-spacing: -0.015em !important;
  font-weight: 700 !important;
  max-width: 760px !important;
}

/* Metric value: ~8% bigger to read more dramatic. */
.block-content [data-block-id="cs-metrics"][data-block-type="metric-cards"] .grid > a > div .metric-value,
.block-content [data-block-id="cs-metrics"][data-block-type="metric-cards"] .grid > div > div .metric-value,
.block-content [data-block-id="cs-metrics"][data-block-type="metric-cards"] [class*="value"] {
  font-size: 2.75rem !important;
  line-height: 1.1 !important;
  letter-spacing: -0.01em !important;
}

/* Secondary label: slightly looser tracking + larger to read closer to
   live's emphasis. */
.block-content [data-block-id="cs-metrics"][data-block-type="metric-cards"] [class*="label"] {
  font-size: 0.78rem !important;
  letter-spacing: 0.08em !important;
}

/* /batch39 */`;

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

  let css = (post.customCss as string | null) ?? '';
  css = stripBlock(css, '/* batch39 — stats section typography uplift */', '/* /batch39 */');
  css = (css ? css + '\n\n' : '') + BATCH39_CSS;

  await db
    .update(posts)
    .set({ customCss: css, updatedAt: new Date() })
    .where(eq(posts.id, 302));

  console.log(`post 302 batch39 applied. customCss length: ${css.length}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
