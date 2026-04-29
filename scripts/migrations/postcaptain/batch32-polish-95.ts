/**
 * Batch 32 — section polish toward median vision-score ≥95.
 *
 * Median vision baseline (post-batch31, 3 runs):
 *   hero       94 → +1 to 95
 *   services   85 → +10 to 95
 *   portals    94 → +1 to 95
 *   audits     92 → +3 to 95
 *   solutions  85 → +10 to 95
 *   stats      85 → +10 to 95
 *   team       85 → +10 to 95
 *   cta-footer 90 → +5 to 95
 *
 * Targeted fixes (CSS-only, scoped per data-block-id):
 *
 * hero:
 *   - Shrink Slate Platinum badge to 115px (was 145px) so it reads as a
 *     subtle accent, matching live's smaller proportion.
 *
 * services:
 *   - Inactive tabs: neutral gray (#F3F4F6) instead of pastel green tint —
 *     matches live's gray inactive state, makes the active green pop.
 *   - Heading inside the active panel: lighten font-weight 600 (was 700/bold)
 *     and slightly smaller (1.85rem) per live's lighter heading.
 *
 * portals:
 *   - Widen the portals subtitle paragraph so it stays on a single line.
 *     Selector targets the description block by data-block-id.
 *
 * audits:
 *   - Heading font-weight 600 (was 700) per live's lighter weight.
 *
 * solutions:
 *   - Replace the chevron SVG arrow on each card with a Material Icons
 *     arrow_forward glyph via CSS content (display:none on the existing
 *     svg, ::after pseudo with the glyph). The arrow stays bottom-right.
 *   - Description font-size 0.9375rem (was 0.9375rem already — keep) but
 *     widen card content width so the body wraps closer to live.
 *
 * stats:
 *   - Restore Case Study trailing arrow visibility (live shows →; the
 *     existing customCss may have collapsed it).
 *   - Bump institution logo size to h-44px (was 36) so logos read at
 *     parity with live.
 *
 * team:
 *   - Card description text-base (16px) instead of inheriting larger.
 *   - Reduce heading font-size to 2.5rem (was 2.75) per live.
 *   - Tighten gap between cards (gap-4 → gap-6 already; tighten max-width).
 *
 * cta-footer:
 *   - Bump logo width 60px → 72px so the boat reads bigger (live's boat
 *     is ~36-40px tall in image; with object-fit:contain the visible icon
 *     is the leftmost 60px of the 520x70 source. Going to 72 makes the
 *     visible boat about 18% larger.)
 *
 * Idempotent — strips a prior batch32 marker before writing.
 *
 * Run with:
 *   bun -r dotenv/config scripts/migrations/postcaptain/batch32-polish-95.ts dotenv_config_path=.env.local
 */
import 'dotenv/config';
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const BATCH32_CSS = `/* batch32 — section polish toward median vision-score ≥95 */

/* ── hero: smaller Platinum badge ── */
#pc-slate-badge {
  width: 118px !important;
  top: 280px !important;
}

/* ── services: neutral gray inactive tabs + lighter heading ── */
.block-content [data-block-id="svc-scroll-tabs"] .ssct-tab[aria-pressed="false"] {
  background: #F3F4F6 !important;
  color: #4B5563 !important;
}
.block-content [data-block-id="svc-scroll-tabs"] .ssct-tab[aria-pressed="false"] .ssct-tab-icon {
  color: #4B5563 !important;
}
/* Active panel heading: lighter weight per live. The heading-block renderer
   places font-size + font-weight on an OUTER div, not on the h3 itself, so
   target the div directly. */
.block-content [data-block-id="panel-impl-heading"] > div[style*="font-weight"],
.block-content [data-block-id="panel-projects-heading"] > div[style*="font-weight"],
.block-content [data-block-id="panel-support-heading"] > div[style*="font-weight"] {
  font-weight: 600 !important;
  font-size: 1.85rem !important;
  letter-spacing: -0.005em !important;
}

/* ── portals: keep subtitle on one line ── */
.block-content [data-block-id="portals-desc"],
.block-content [data-block-id="portals-desc"] p,
.block-content [data-block-id="portals-desc"] [data-editable-field="content"] {
  max-width: 760px !important;
  margin-left: auto !important;
  margin-right: auto !important;
}
.block-content [data-block-id="portals-desc"] > div {
  max-width: 760px !important;
  margin: 0 auto !important;
}

/* ── audits: lighter heading weight ── */
.block-content [data-block-id="audits-heading"] > div[style*="font-weight"] {
  font-weight: 600 !important;
}

/* ── solutions: replace chevron with arrow ── */
/* Hide the bottom-right chevron svg (rendered by batch26 absolute-positioned
   wrapper) and replace it with an arrow glyph via ::after on the wrapper. */
.block-content [data-block-id="solutions-cards"] .grid > a > div > div:last-child svg {
  display: none !important;
}
.block-content [data-block-id="solutions-cards"] .grid > a > div > div:last-child::after {
  content: "arrow_forward" !important;
  font-family: 'Material Icons' !important;
  font-feature-settings: 'liga' !important;
  -webkit-font-feature-settings: 'liga' !important;
  font-weight: normal !important;
  font-size: 22px !important;
  color: #0A3A5C !important;
  display: inline-block !important;
  text-transform: none !important;
  letter-spacing: normal !important;
}

/* ── stats: bigger logos + Case Study arrow visible ── */
.block-content [data-block-id="cs-metrics"][data-block-type="metric-cards"] .grid > a > div > div.mt-6 img,
.block-content [data-block-id="cs-metrics"][data-block-type="metric-cards"] .grid > div > div > div.mt-6 img {
  height: 42px !important;
  max-height: 42px !important;
  max-width: 96px !important;
}
/* Force Case Study arrow visibility (override any prior color:transparent rule). */
.block-content [data-block-id="cs-metrics"][data-block-type="metric-cards"] .grid a .inline-flex {
  color: #0A3A5C !important;
}
.block-content [data-block-id="cs-metrics"][data-block-type="metric-cards"] .grid a .inline-flex svg {
  color: #0A3A5C !important;
  fill: #0A3A5C !important;
  stroke: #0A3A5C !important;
  width: 14px !important;
  min-width: 14px !important;
  height: 14px !important;
  display: inline-block !important;
  margin-left: 6px !important;
  opacity: 1 !important;
  visibility: visible !important;
  flex: 0 0 14px !important;
  flex-shrink: 0 !important;
}

/* ── team: tighter heading + description ── */
.block-content [data-block-id="team-flip-grid-1"] section > div:first-child h2 {
  font-size: 2.4rem !important;
  font-weight: 700 !important;
}
.block-content [data-block-id="team-flip-grid-1"] section > div:first-child > p {
  font-size: 16px !important;
  line-height: 1.55 !important;
}

/* ── cta-footer: bigger boat ── */
.block-content [data-block-id="footer-1"] footer .grid > div:first-child a:first-of-type img {
  width: 72px !important;
  max-width: 72px !important;
}

/* /batch32 */`;

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
  css = stripBlock(css, '/* batch32 — section polish toward median vision-score ≥95 */', '/* /batch32 */');
  css = (css ? css + '\n\n' : '') + BATCH32_CSS;

  await db
    .update(posts)
    .set({ customCss: css, updatedAt: new Date() })
    .where(eq(posts.id, 302));

  console.log('post 302 batch32-polish-95 applied. customCss length:', css.length);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
