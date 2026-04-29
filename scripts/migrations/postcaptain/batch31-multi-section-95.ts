/**
 * Batch 31 — multi-section push toward median vision-score ≥95.
 *
 * Median vision baseline (3 runs, post-batch30):
 *   hero       88
 *   services   82
 *   portals    94
 *   audits     85
 *   solutions  85
 *   stats      72  ← biggest miss; metrics value+suffix wrap onto 2 lines
 *   team       86
 *   cta-footer 88
 *
 * Fixes (CSS-only, scoped per data-block-id):
 *
 * stats (st-fit):
 *   - Cap metric value font to clamp(1.55rem, 2.5vw, 2.1rem) so "$965K+ Raised"
 *     fits on one line at 1440px. Suffix at 0.85em + nowrap. White-space nowrap
 *     on the value div itself.
 *   - Heading column padding-right reduced to 96px (the renderer's logoColumnWidth
 *     is 110px; the post-level rule wins for backwards-compat with batch11's
 *     absolute-positioned logo at top:28px right:28px).
 *   - Label max-width 320px (renderer prop is 260px; post-level wins to prevent
 *     wrap on "BY ELIMINATING ADVANCE BADGE PRINTING").
 *   - Restore arrow icon on Case Study link (visible/sized properly).
 *
 * cta-footer (cf-lockup):
 *   - With brandSize='lg' now wired at the renderer (logo h-12, wordmark 12px),
 *     batch28's flex-wrap:wrap on the brand link is now causing the wordmark
 *     to drop below the logo. Switch to flex-wrap:nowrap and align-items:center
 *     since the renderer now allots enough space for both inline.
 *   - Body description font-size +1px and width allowance.
 *
 * hero (h-pill):
 *   - Subheadline max-width 720px (was 640px) so it stays on 2 lines.
 *   - Round CTA buttons to pill (border-radius 999px) to match live.
 *
 * audits (au-center):
 *   - Constrain the audits row to max-width 880px and gap-12 so the three items
 *     read as a centered group rather than spread across the full width.
 *
 * team (t-link):
 *   - Description max-width 640px (was unset / wider).
 *   - Hide the trailing arrow svg on team-link (live shows plain text).
 *
 * portals (p-sub):
 *   - Subtitle max-width 720px so it fits on one line.
 *
 * services (sv-active):
 *   - Active tab fill solid green (#5BA573) with white text instead of
 *     white-card+green-border. Per live, the active state is a solid green
 *     panel.
 *
 * Idempotent — strips a prior batch31 marker before writing.
 *
 * Run with:
 *   bun -r dotenv/config scripts/migrations/postcaptain/batch31-multi-section-95.ts dotenv_config_path=.env.local
 */
import 'dotenv/config';
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const BATCH31_CSS = `/* batch31 — multi-section push toward median vision-score ≥95 */

/* ── stats: keep value+suffix on one line ── */
/* Selector specificity bumped above prior batches by adding a second attr. */
.block-content [data-block-id="cs-metrics"][data-block-type="metric-cards"] .grid > a > div > div:first-child,
.block-content [data-block-id="cs-metrics"][data-block-type="metric-cards"] .grid > div > div > div:first-child {
  padding-right: 96px !important;
}
.block-content [data-block-id="cs-metrics"][data-block-type="metric-cards"] .grid > a > div > div:first-child > div[style*="font-size"],
.block-content [data-block-id="cs-metrics"][data-block-type="metric-cards"] .grid > div > div > div:first-child > div[style*="font-size"] {
  font-size: clamp(1.45rem, 2.3vw, 1.95rem) !important;
  line-height: 1.1 !important;
  letter-spacing: -0.01em !important;
  white-space: normal !important;
  overflow: visible !important;
  color: #0A3A5C !important;
  /* Force flex with allow-wrap so the suffix span lays out inline if it fits
     ("Increase", "Raised") and wraps to a new line if it doesn't ("of Staff
     Time Saved", "of Historical Data") — matching live's behavior. */
  display: flex !important;
  align-items: baseline !important;
  flex-wrap: wrap !important;
  column-gap: 0.35em !important;
  row-gap: 0.1em !important;
  max-width: 100% !important;
}
.block-content [data-block-id="cs-metrics"][data-block-type="metric-cards"] .grid > a > div > div > div span.pc-metric-suffix,
.block-content [data-block-id="cs-metrics"][data-block-type="metric-cards"] .grid > div > div > div > div span.pc-metric-suffix {
  font-size: 0.7em !important;
  font-weight: 600 !important;
  letter-spacing: 0 !important;
  margin-left: 0 !important;
  white-space: normal !important;
  display: inline-block !important;
  vertical-align: baseline !important;
  color: inherit !important;
  flex: 0 1 auto !important;
}
/* Label gets a wider cap so "BY ELIMINATING ADVANCE BADGE PRINTING" fits. */
.block-content [data-block-id="cs-metrics"][data-block-type="metric-cards"] .grid [class*="tracking-[0.15em]"] {
  max-width: 320px !important;
  white-space: normal !important;
}
/* Logo: shrink slightly so it tucks into the 96px reserve. */
.block-content [data-block-id="cs-metrics"][data-block-type="metric-cards"] .grid > a > div > div.mt-6 img,
.block-content [data-block-id="cs-metrics"][data-block-type="metric-cards"] .grid > div > div > div.mt-6 img {
  height: 36px !important;
  max-height: 36px !important;
  max-width: 84px !important;
}
/* Case Study arrow visible (override any color:transparent from solutions tweaks). */
.block-content [data-block-id="cs-metrics"][data-block-type="metric-cards"] .grid a .inline-flex svg {
  color: #0A3A5C !important;
  width: 14px !important;
  height: 14px !important;
  display: inline-block !important;
  margin-left: 4px !important;
}

/* ── cta-footer: keep brand lockup inline now that brandSize='lg' is set ── */
/* The renderer already sizes logo h-12 + wordmark 12px when brandSize='lg'.
   We just need flex-wrap:nowrap (overrides batch28) and slight wordmark-line
   tuning so "POST CAPTAIN" reads bold and "CONSULTING" reads as a smaller subtext.

   The source logoUrl is a wide 520x70 horizontal lockup; cap the rendered img
   to 60px wide and use object-fit:contain to crop down to the boat icon at
   the left of the artwork. */
.block-content [data-block-id="footer-1"] footer .grid > div:first-child a:first-of-type {
  flex-wrap: nowrap !important;
  align-items: center !important;
  gap: 12px !important;
}
.block-content [data-block-id="footer-1"] footer .grid > div:first-child a:first-of-type img {
  width: 60px !important;
  max-width: 60px !important;
  height: 48px !important;
  max-height: 48px !important;
  object-fit: contain !important;
  object-position: left center !important;
  flex-shrink: 0 !important;
}
.block-content [data-block-id="footer-1"] footer .grid > div:first-child a:first-of-type > span {
  display: inline-flex !important;
  flex-direction: column !important;
  flex-shrink: 1 !important;
  min-width: 0 !important;
}
/* Bump the FIRST line ("POST CAPTAIN") to read as the dominant element. */
.block-content [data-block-id="footer-1"] footer .grid > div:first-child a:first-of-type > span > span:nth-child(1) {
  font-size: 14px !important;
  letter-spacing: 0.04em !important;
  font-weight: 700 !important;
  line-height: 1 !important;
}
/* Second line ("CONSULTING") as smaller subtext. */
.block-content [data-block-id="footer-1"] footer .grid > div:first-child a:first-of-type > span > span:nth-child(2) {
  font-size: 9px !important;
  letter-spacing: 0.18em !important;
  font-weight: 600 !important;
  margin-top: 2px !important;
  opacity: 0.8 !important;
}
.block-content [data-block-id="footer-1"] footer .grid > div:first-child > p {
  font-size: 14px !important;
  line-height: 1.55 !important;
  max-width: 280px !important;
}

/* ── hero: pill CTAs + wider subheadline ── */
.block-content [data-block-type="hero"] a[href="/contact"],
.block-content [data-block-type="hero"] a[href="/true-north"] {
  border-radius: 999px !important;
  padding-left: 28px !important;
  padding-right: 28px !important;
}
.block-content [data-block-type="hero"] [data-editable-field="description"] {
  max-width: 720px !important;
  margin-left: auto !important;
  margin-right: auto !important;
}

/* ── audits: tighten the row to a centered group ── */
.block-content [data-block-id="audit-badges"] > div > div {
  max-width: 880px !important;
  margin: 0 auto !important;
  gap: 24px !important;
  justify-content: center !important;
}
.block-content [data-block-id="audit-badges"] [data-col-stacks-md] {
  flex: 0 0 auto !important;
  --col-width: auto !important;
}

/* ── team: widen header band + hide MEET FULL TEAM arrow ── */
.block-content [data-block-id="team-flip-grid-1"] section > div:first-child {
  max-width: 760px !important;
}
.block-content [data-block-id="team-flip-grid-1"] section > div:first-child > p {
  font-size: 17px !important;
  line-height: 1.6 !important;
}
.block-content [data-block-id="team-link"] svg,
.block-content [data-block-id="team-link"] [class*="material-icons"] {
  display: none !important;
}

/* ── portals: subtitle width ── */
.block-content [data-block-id="portals-section"] [data-editable-field="description"],
.block-content [data-block-id="portals-section"] p[class*="text-center"] {
  max-width: 720px !important;
  margin-left: auto !important;
  margin-right: auto !important;
}

/* ── services: active tab pastel-green pill at top, white panel below ── */
/* Per live: the active TAB header (the small pill at the top of the
   sticky-scroll-tabs) is pastel green; the content panel BELOW it stays
   white with a pastel green outline. batch25 already does the panel-side
   correctly — the missing piece is the top tab pill. */
.block-content [data-block-id="svc-scroll-tabs"] .ssct-tab[aria-pressed="true"] {
  background: #A4D2A1 !important;
  color: #0A3A5C !important;
}
.block-content [data-block-id="svc-scroll-tabs"] .ssct-tab[aria-pressed="true"] .ssct-tab-icon {
  color: #0A3A5C !important;
}
/* Inactive tabs: subtle warm gray for visual differentiation. */
.block-content [data-block-id="svc-scroll-tabs"] .ssct-tab[aria-pressed="false"] {
  background: #EAF3EC !important;
}

/* /batch31 */`;

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
  css = stripBlock(css, '/* batch31 — multi-section push toward median vision-score ≥95 */', '/* /batch31 */');
  css = (css ? css + '\n\n' : '') + BATCH31_CSS;

  await db
    .update(posts)
    .set({ customCss: css, updatedAt: new Date() })
    .where(eq(posts.id, 302));

  console.log('post 302 batch31-multi-section-95 applied. customCss length:', css.length);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
