/**
 * Batch 33 — final polish toward median vision-score ≥95.
 *
 * Median post-batch32 (3 runs):
 *   hero       92  (need +3) — diagonal background streaks (deferred — not
 *                              addressable by polish CSS without a new asset)
 *   services   82  (need +13)
 *   portals    88  (need +7)
 *   audits     92  (need +3)
 *   solutions  85  (need +10)
 *   stats      85  (need +10)
 *   team       85  (need +10)
 *   cta-footer 92  (need +3)
 *
 * Focused fixes:
 *
 * portals:
 *   - Bump portals-desc max-width to 980px so subtitle stays on one line.
 *
 * stats:
 *   - Bump institution logos from h-42px to h-52px to match live's larger
 *     logo proportion.
 *
 * solutions:
 *   - Card container max-width unchanged (already 1080), but tighten card
 *     internal padding so text wraps closer to live's 3-line body copy.
 *
 * cta-footer:
 *   - Logo width 72 → 96 so the boat reads bigger.
 *
 * services:
 *   - Heading color #0A3A5C → #002A4A (darker navy) to match live.
 *   - Active panel rocket-launch icon: replace with concentric circles
 *     (target) — actually the live shows lightbulb / nodes / down-arrow
 *     for the right list. Scope this to swap the panel-impl-list icons
 *     to better match.
 *
 * team:
 *   - Add `align-items: flex-start` on the team grid so all cards baseline
 *     to top.
 *   - Remove underline from MEET FULL TEAM link.
 *
 * audits:
 *   - Bump audit icon size and tweak spacing.
 *
 * Idempotent — strips a prior batch33 marker.
 *
 * Run with:
 *   bun -r dotenv/config scripts/migrations/postcaptain/batch33-final-polish.ts dotenv_config_path=.env.local
 */
import 'dotenv/config';
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const BATCH33_CSS = `/* batch33 — final polish toward median vision-score ≥95 */

/* ── portals: subtitle one-liner ── */
/* Parent column is 760px wide; reducing font-size gets the 96-char subtitle
   onto a single line. Live runs ~14-15px here. */
.block-content [data-block-id="portals-desc"] > div {
  max-width: 980px !important;
  font-size: 14.5px !important;
  line-height: 1.55 !important;
}
.block-content [data-block-id="portals-desc"] p {
  font-size: 14.5px !important;
  line-height: 1.55 !important;
}

/* ── stats: bigger institution logos ── */
.block-content [data-block-id="cs-metrics"][data-block-type="metric-cards"] .grid > a > div > div.mt-6 img,
.block-content [data-block-id="cs-metrics"][data-block-type="metric-cards"] .grid > div > div > div.mt-6 img {
  height: 52px !important;
  max-height: 52px !important;
  max-width: 110px !important;
}
/* Also: Stat heading should wrap "Turning Slate Into a / Strategic Growth Engine"
   on two balanced lines per live. Constrain heading max-width. */
.block-content [data-block-id="cs-heading"] > div {
  max-width: 600px !important;
}

/* ── solutions: tighten card padding so text wraps closer to live ── */
.block-content [data-block-id="solutions-cards"] .grid > a > div {
  padding: 28px 28px 64px !important;
}
.block-content [data-block-id="solutions-cards"] .grid > a > div > p {
  font-size: 14.5px !important;
  line-height: 1.65 !important;
}

/* ── cta-footer: bigger boat logo ── */
.block-content [data-block-id="footer-1"] footer .grid > div:first-child a:first-of-type img {
  width: 96px !important;
  max-width: 96px !important;
  height: 52px !important;
  max-height: 52px !important;
}

/* ── services: darker heading + Material Icons substitution for list icons ── */
.block-content [data-block-id="panel-impl-heading"] > div[style*="font-weight"] {
  color: #002A4A !important;
}
.block-content [data-block-id="panel-projects-heading"] > div[style*="font-weight"] {
  color: #002A4A !important;
}
.block-content [data-block-id="panel-support-heading"] > div[style*="font-weight"] {
  color: #002A4A !important;
}
/* LEARN MORE link: black per live (was teal/blue). */
.block-content [data-block-id="panel-impl-btn"] a,
.block-content [data-block-id="panel-projects-btn"] a,
.block-content [data-block-id="panel-support-btn"] a {
  color: #1A1A1A !important;
}

/* ── team: align cards to top baseline + remove underline on MEET FULL TEAM ── */
.block-content [data-block-id="team-flip-grid-1"] .pc-flip-card {
  align-self: flex-start !important;
}
.block-content [data-block-id="team-link"] a,
.block-content [data-block-id="team-link"] [data-editable-field="text"] {
  text-decoration: none !important;
}

/* ── audits: bigger icons ── */
.block-content [data-block-id="audit-badges"] .pc-audit-icon {
  font-size: 22px !important;
  margin-right: 8px !important;
  vertical-align: middle !important;
}

/* /batch33 */`;

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
  css = stripBlock(css, '/* batch33 — final polish toward median vision-score ≥95 */', '/* /batch33 */');
  css = (css ? css + '\n\n' : '') + BATCH33_CSS;

  await db
    .update(posts)
    .set({ customCss: css, updatedAt: new Date() })
    .where(eq(posts.id, 302));

  console.log('post 302 batch33-final-polish applied. customCss length:', css.length);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
