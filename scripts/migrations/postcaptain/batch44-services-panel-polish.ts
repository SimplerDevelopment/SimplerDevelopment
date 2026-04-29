/**
 * Batch 44 — services panel heading wrap + feature label color.
 *
 * Indistinguishability scorer voted 0/3 on services. Two fixable gaps
 * surfaced across all three "no" votes:
 *
 *   1. "Live heading wraps to two lines; local renders on one line"
 *      Probe: live's panel heading "Set Everyone Up for Success in Slate"
 *      sits in a column constrained to ~280px, wraps naturally to 2
 *      lines. Local's heading column is wider (~720px on a 60% width
 *      panel-impl-text-col), keeping the heading on one line.
 *
 *   2. "Live feature labels are gray; local labels are blue"
 *      Probe: live label color = rgb(75, 85, 99) (gray-600). Local
 *      label color = rgb(10, 58, 92) (brand navy #0A3A5C).
 *
 * Fix:
 *   - Cap panel heading max-width at 360px so it wraps to 2 lines on
 *     desktop matching live's layout.
 *   - Recolor the feature-list labels to gray-600 (#4B5563) inside the
 *     panel feature-list area. Tightly scoped to seu-list inside the
 *     services scroll-tabs block so we don't recolor any other navy
 *     text on the page.
 *
 * Universal: customCss only, no renderer changes.
 *
 * Idempotent. Run:
 *   bun -r dotenv/config scripts/migrations/postcaptain/batch44-services-panel-polish.ts dotenv_config_path=.env.local
 */
import 'dotenv/config';
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const BATCH44_CSS = `/* batch44 — services panel heading wrap + feature label color */

/* Cap panel heading max-width so it wraps to 2 lines on desktop —
   matches live's narrower-column layout. The heading lives at
   data-block-id="panel-impl-heading" / "panel-proj-heading" /
   "panel-supp-heading"; targeting all three by prefix. */
@media (min-width: 769px) {
  .block-content [data-block-id^="panel-"][data-block-id$="-heading"] > div,
  .block-content [data-block-id^="panel-"][data-block-id$="-heading"] h1,
  .block-content [data-block-id^="panel-"][data-block-id$="-heading"] h2,
  .block-content [data-block-id^="panel-"][data-block-id$="-heading"] h3 {
    max-width: 360px !important;
  }
}

/* Feature list labels: live uses gray-600 (#4B5563), local was rendering
   in brand navy. Scoped tightly to the services scroll-tabs block so no
   other navy text is affected. The label markup is the text node that
   sits next to the .seu-icon-svg-badge inside each li. */
.block-content [data-block-id="svc-scroll-tabs"] ul.seu-list li {
  color: #4B5563 !important;
}
.block-content [data-block-id="svc-scroll-tabs"] ul.seu-list li > span:last-child,
.block-content [data-block-id="svc-scroll-tabs"] ul.seu-list li > a {
  color: #4B5563 !important;
}

/* /batch44 */`;

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
    '/* batch44 — services panel heading wrap + feature label color */',
    '/* /batch44 */',
  );
  css = (css ? css + '\n\n' : '') + BATCH44_CSS;

  await db.update(posts).set({
    customCss: css,
    updatedAt: new Date(),
  }).where(eq(posts.id, 302));

  console.log(`post 302 batch44 applied. customCss length: ${css.length}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
