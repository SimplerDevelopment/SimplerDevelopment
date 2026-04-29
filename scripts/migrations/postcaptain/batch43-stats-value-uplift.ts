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

const BATCH43_CSS = `/* batch43 — stats value uplift + suffix-on-own-line */

/* Bigger value typography to match live's 56px stat number. The
   selector chain below is one level deeper than the prior
   1.95rem-cap rule from batch31, so it wins the cascade. */
.block-content [data-block-id="cs-metrics"][data-block-type="metric-cards"] .grid > a > div > div:first-child > div[style*="font-size"],
.block-content [data-block-id="cs-metrics"][data-block-type="metric-cards"] .grid > div > div > div:first-child > div[style*="font-size"] {
  font-size: clamp(2.25rem, 4vw, 3.5rem) !important;
  line-height: 1.05 !important;
  font-weight: 300 !important;
  letter-spacing: -0.01em !important;
  /* Stack number + suffix vertically so suffix lays out on a NEW line
     below the number — matching live where stat-number and stat-label
     are siblings in a column-direction flex. */
  display: flex !important;
  flex-direction: column !important;
  align-items: flex-start !important;
  row-gap: 0.05em !important;
  max-width: 100% !important;
}

/* Suffix: smaller scale, label-like, lays out on its own line. */
.block-content [data-block-id="cs-metrics"][data-block-type="metric-cards"] .grid > a > div > div > div > span.pc-metric-suffix,
.block-content [data-block-id="cs-metrics"][data-block-type="metric-cards"] .grid > div > div > div > div > span.pc-metric-suffix {
  font-size: 0.4em !important;
  font-weight: 400 !important;
  letter-spacing: 0 !important;
  margin-left: 0 !important;
  white-space: normal !important;
  display: block !important;
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
