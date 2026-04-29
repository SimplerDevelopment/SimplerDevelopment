/**
 * Batch 43 — stats metric value uplift (number larger; suffix on its own line).
 *
 * Indistinguishability scorer voted 0/3 "match" on stats. Probe of live:
 *   live  : `.pc-case-study-card__stat-number` — 56px, font-weight 300,
 *           on its own line; `.pc-case-study-card__stat-label` (the
 *           "Increase"/"Raised"/etc) renders 18px on the line BELOW.
 *   local : value div computed = 31.2px (clamped down by an earlier batch's
 *           `clamp(1.45rem, 2.3vw, 1.95rem)` rule that aimed to keep the
 *           suffix INLINE with the number — exactly the opposite of live).
 *
 * Fix:
 *   - Replace the value-div font-size override with a clamp targeting
 *     ~56px on desktop (matches live's 56px); leave a softer floor for
 *     mobile.
 *   - Force the value div to flex-direction: column so the
 *     `.pc-metric-suffix` span lays out on a NEW LINE below the number.
 *   - Lift the suffix to 0.36em (≈20px against a 56px parent) to match
 *     live's stat-label scale and keep it readable.
 *
 * Why a separate batch instead of editing batch31's rule: keeping a clean
 * append-only history makes it easy to revert ONE batch in isolation if
 * the indistinguishability scorer flags a regression elsewhere. The new
 * rules are higher-specificity (extra `[data-block-id]` attr selector on
 * a descendant) so they win the cascade against the old block.
 *
 * Idempotent. Run:
 *   bun -r dotenv/config scripts/migrations/postcaptain/batch43-stats-value-uplift.ts dotenv_config_path=.env.local
 */
import 'dotenv/config';
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const BATCH43_CSS = `/* batch43 — stats value uplift + flex-wrap suffix */

/* Bigger value typography to match live's 56px stat number, while
   keeping live's MIXED inline/wrapped suffix behavior:
     short suffix ("Increase", "Raised")              → INLINE with number
     long suffix  ("of Staff Time Saved", "...Data")  → WRAPS below number
   This is what the original batch31 was trying to achieve, but its
   1.95rem cap clamped the number too small. We keep flex+wrap and
   raise the size. */
.block-content [data-block-id="cs-metrics"][data-block-type="metric-cards"] .grid > a > div > div:first-child > div[style*="font-size"],
.block-content [data-block-id="cs-metrics"][data-block-type="metric-cards"] .grid > div > div > div:first-child > div[style*="font-size"] {
  font-size: clamp(2.25rem, 4vw, 3.5rem) !important;
  line-height: 1.05 !important;
  font-weight: 300 !important;
  letter-spacing: -0.01em !important;
  display: flex !important;
  flex-direction: row !important;
  align-items: baseline !important;
  flex-wrap: wrap !important;
  column-gap: 0.35em !important;
  row-gap: 0.05em !important;
  max-width: 100% !important;
}

/* Suffix: smaller scale, inline when it fits, wraps to next line on
   long copy. font-size 0.42em ≈ 23.5px against a 56px parent — close
   to live's stat-label scale. */
.block-content [data-block-id="cs-metrics"][data-block-type="metric-cards"] .grid > a > div > div > div > span.pc-metric-suffix,
.block-content [data-block-id="cs-metrics"][data-block-type="metric-cards"] .grid > div > div > div > div > span.pc-metric-suffix {
  font-size: 0.42em !important;
  font-weight: 400 !important;
  letter-spacing: 0 !important;
  margin-left: 0 !important;
  white-space: normal !important;
  display: inline-block !important;
  vertical-align: baseline !important;
  color: inherit !important;
  flex: 0 1 auto !important;
}

/* /batch43 */`;

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
  css = stripBlock(
    css,
    '/* batch43 — stats value uplift + suffix-on-own-line */',
    '/* /batch43 */',
  );
  css = (css ? css + '\n\n' : '') + BATCH43_CSS;

  await db.update(posts).set({
    customCss: css,
    updatedAt: new Date(),
  }).where(eq(posts.id, 302));

  console.log(`post 302 batch43 applied. customCss length: ${css.length}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
