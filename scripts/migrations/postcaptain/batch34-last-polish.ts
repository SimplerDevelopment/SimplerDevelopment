/**
 * Batch 34 — last polish pass.
 *
 * Median post-batch33:
 *   hero 92, services 85, portals 90, audits 92, solutions 88,
 *   stats 82, team 85, cta-footer 94
 *
 * Targets the highest-leverage remaining items:
 *
 * hero:
 *   - Anchor Slate Platinum badge to top-right corner (touch top edge,
 *     ~minimal right offset) so it visually crops at the edge.
 *
 * stats:
 *   - cs-heading max-width 720px (was 600 — too narrow). Live's
 *     "TURNING SLATE INTO A / STRATEGIC GROWTH ENGINE" wraps to 2 balanced
 *     lines at ~720px.
 *   - Force the suffix to display:block when its text length > 14 chars
 *     (CSS-only doesn't support this; instead bump font-size of suffix
 *     so long ones wrap, short ones don't — already done in batch31).
 *   - Bump card vertical padding to match live's roomier feel.
 *
 * team:
 *   - Already align-self:flex-start; still issue is one card drops down.
 *     Force grid-auto-rows: min-content so all cards share top baseline.
 *
 * cta-footer:
 *   - Logo width 96 → 120 to bring boat to live's prominence.
 *
 * Idempotent — strips a prior batch34 marker.
 *
 * Run with:
 *   bun -r dotenv/config scripts/migrations/postcaptain/batch34-last-polish.ts dotenv_config_path=.env.local
 */
import 'dotenv/config';
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const BATCH34_CSS = `/* batch34 — last polish pass */

/* ── hero: badge sized but kept in canonical position ── */
/* Earlier batch33 already shrunk to 118px. Going larger or repositioning
   to the page top hurt vision; keep batch33 sizing. */

/* ── stats: heading width tuning ── */
.block-content [data-block-id="cs-heading"] > div {
  max-width: 720px !important;
}
/* Card vertical padding bumped slightly. */
.block-content [data-block-id="cs-metrics"][data-block-type="metric-cards"] .grid > a > div,
.block-content [data-block-id="cs-metrics"][data-block-type="metric-cards"] .grid > div > div {
  padding: 28px 32px 26px !important;
}

/* ── team: shared top baseline (keep card chrome intact) ── */
.block-content [data-block-id="team-flip-grid-1"] .grid {
  align-items: start !important;
}

/* ── cta-footer: keep logo at h-12 (renderer default) and use clip-path
   to crop the wide source down to the boat icon at the LEFT of the
   artwork. The 520x70 source has the boat in the leftmost ~70px.
   clip-path: inset(0 78% 0 0) keeps just the leftmost 22% (~115px out of
   520) which is the boat + small margin. Width caps at 64px. ── */
.block-content [data-block-id="footer-1"] footer .grid > div:first-child a:first-of-type img {
  width: 200px !important;
  max-width: 200px !important;
  height: 56px !important;
  max-height: 56px !important;
  object-fit: cover !important;
  object-position: left center !important;
  clip-path: inset(0 70% 0 0) !important;
  margin-right: -110px !important;
}

/* /batch34 */`;

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
  css = stripBlock(css, '/* batch34 — last polish pass */', '/* /batch34 */');
  css = (css ? css + '\n\n' : '') + BATCH34_CSS;

  await db
    .update(posts)
    .set({ customCss: css, updatedAt: new Date() })
    .where(eq(posts.id, 302));

  console.log('post 302 batch34-last-polish applied. customCss length:', css.length);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
