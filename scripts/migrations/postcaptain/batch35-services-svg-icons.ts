/**
 * Batch 35 — services-panel SVG icons (live-extracted).
 *
 * Vision-review has consistently flagged the services panels at 82-85
 * because the three feature-list icons inside each active panel were
 * Material Icons (lightbulb / hub / tune ...) rather than live's
 * hand-drawn outlined SVG glyphs. batch21 tinted them as circular
 * green badges to mask the gap; live actually uses flat brand-blue
 * SVGs left-of-label with no badge.
 *
 * This batch:
 *   1. Rewrites the three text-block bodies (panel-impl-list,
 *      panel-projects-list, panel-support-list) so each <li> uses an
 *      <img class="seu-icon-svg" src="/sites/postcaptain/svg/svc-*.svg">
 *      instead of <span class="seu-icon material-icons">...</span>.
 *   2. Injects scoped CSS that:
 *      - kills batch21's circular badge styling (still applied to
 *        .seu-icon spans, but those spans no longer exist in the
 *        rewritten HTML — we add belt+suspenders display:none).
 *      - sizes .seu-icon-svg to ~30px, brand-blue (the SVGs are
 *        fill="#004D80" already, so no filter recolor needed).
 *      - keeps the row gap + DM Sans label styling from batch21.
 *
 * Idempotent: stripping batch35 markers + matching the original
 * Material-Icons-span markup (so re-runs after manual edits still
 * convert), AND if the SVG-img markup is already present we leave
 * it. Run with:
 *
 *   bun -r dotenv/config scripts/migrations/postcaptain/batch35-services-svg-icons.ts dotenv_config_path=.env.local
 */
import 'dotenv/config';
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const BATCH35_CSS = `/* batch35 — services panel feature-list SVG icons (live-extracted) */

/* Live treatment: each feature-list <li> shows a 44px green-tinted circle
   with the brand-blue SVG glyph centered inside. Markup is now:
     <li>
       <span class="seu-icon-svg-badge">
         <img src="/sites/postcaptain/svg/svc-*.svg">
       </span>
       <span class="seu-text">…</span>
     </li>
   The badge gets the green circle; the inner img is the brand-blue glyph. */
.block-content [data-block-id="svc-scroll-tabs"] ul.seu-list li {
  display: flex !important;
  align-items: center !important;
  gap: 14px !important;
  margin-bottom: 14px !important;
}
.block-content [data-block-id="svc-scroll-tabs"] ul.seu-list .seu-icon-svg-badge {
  width: 44px !important;
  height: 44px !important;
  min-width: 44px !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  background-color: #C8E6CD !important;
  border-radius: 999px !important;
  flex-shrink: 0 !important;
}
.block-content [data-block-id="svc-scroll-tabs"] ul.seu-list .seu-icon-svg-badge img {
  width: 24px !important;
  height: 24px !important;
  display: block !important;
}
.block-content [data-block-id="svc-scroll-tabs"] ul.seu-list .seu-text {
  color: #0A3A5C !important;
  font-family: 'Poppins', system-ui, sans-serif !important;
  font-weight: 500 !important;
  font-size: 0.95rem !important;
  line-height: 1.35 !important;
}

/* If any legacy Material-Icons spans remain (mid-migration), keep them
   styled to match (so transition is graceful). */
.block-content [data-block-id="svc-scroll-tabs"] ul.seu-list span.seu-icon.material-icons {
  width: 44px !important;
  height: 44px !important;
  min-width: 44px !important;
  background-color: #C8E6CD !important;
  color: #004D80 !important;
  font-size: 22px !important;
  border-radius: 999px !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
}

/* /batch35 */`;

// Per-panel-list HTML rewrites. Keys are block IDs, values are the new
// inner HTML for the text-block .content field.
const PANEL_LIST_HTML: Record<string, string> = {
  'panel-impl-list': [
    '<ul class="seu-list">',
    '<li><span class="seu-icon-svg-badge"><img src="/sites/postcaptain/svg/svc-learn.svg" alt=""></span><span class="seu-text">Learn Along the Way</span></li>',
    '<li><span class="seu-icon-svg-badge"><img src="/sites/postcaptain/svg/svc-simplify.svg" alt=""></span><span class="seu-text">Simplify Your Tech Stack</span></li>',
    '<li><span class="seu-icon-svg-badge"><img src="/sites/postcaptain/svg/svc-reduce.svg" alt=""></span><span class="seu-text">Reduce Overhead &amp; Overload</span></li>',
    '</ul>',
  ].join(''),
  'panel-projects-list': [
    '<ul class="seu-list">',
    '<li><span class="seu-icon-svg-badge"><img src="/sites/postcaptain/svg/svc-web-traffic.svg" alt=""></span><span class="seu-text">Receive Complete Solutions</span></li>',
    '<li><span class="seu-icon-svg-badge"><img src="/sites/postcaptain/svg/svc-conversion-path.svg" alt=""></span><span class="seu-text">Keep It Instance-Specific</span></li>',
    '<li><span class="seu-icon-svg-badge"><img src="/sites/postcaptain/svg/svc-dashboard-customize.svg" alt=""></span><span class="seu-text">Save Time &amp; Accelerate Results</span></li>',
    '</ul>',
  ].join(''),
  'panel-support-list': [
    '<ul class="seu-list">',
    '<li><span class="seu-icon-svg-badge"><img src="/sites/postcaptain/svg/svc-human.svg" alt=""></span><span class="seu-text">Ask a Real Human</span></li>',
    '<li><span class="seu-icon-svg-badge"><img src="/sites/postcaptain/svg/svc-adapt.svg" alt=""></span><span class="seu-text">Adapt to Your Needs</span></li>',
    '<li><span class="seu-icon-svg-badge"><img src="/sites/postcaptain/svg/svc-feelseen.svg" alt=""></span><span class="seu-text">Feel Seen &amp; Heard</span></li>',
    '</ul>',
  ].join(''),
};

function stripBlock(css: string, startMarker: string, endMarker: string): string {
  const startIdx = css.indexOf(startMarker);
  if (startIdx < 0) return css;
  const endIdx = css.indexOf(endMarker, startIdx);
  if (endIdx < 0) return css;
  return (css.slice(0, startIdx) + css.slice(endIdx + endMarker.length)).trim();
}

interface AnyBlock {
  id?: string;
  type?: string;
  content?: unknown;
  blocks?: AnyBlock[];
  panels?: AnyBlock[];
  columns?: AnyBlock[];
}

function rewritePanelLists(node: AnyBlock | undefined): number {
  if (!node || typeof node !== 'object') return 0;
  let changed = 0;

  if (node.id && typeof node.id === 'string' && node.id in PANEL_LIST_HTML) {
    const target = PANEL_LIST_HTML[node.id];
    if (typeof node.content === 'string' && node.content !== target) {
      node.content = target;
      changed++;
      console.log(`  rewrote ${node.id}`);
    }
  }

  for (const key of Object.keys(node) as (keyof AnyBlock)[]) {
    const v = node[key];
    if (Array.isArray(v)) {
      for (const child of v) {
        if (child && typeof child === 'object') {
          changed += rewritePanelLists(child as AnyBlock);
        }
      }
    } else if (v && typeof v === 'object') {
      changed += rewritePanelLists(v as AnyBlock);
    }
  }
  return changed;
}

async function main() {
  const [post] = await db.select().from(posts).where(eq(posts.id, 302));
  if (!post) throw new Error('post 302 not found');

  // 1. Rewrite panel-list HTML.
  const content = JSON.parse(post.content as string);
  let totalChanged = 0;
  for (const top of content.blocks) {
    totalChanged += rewritePanelLists(top);
  }
  console.log(`rewrote ${totalChanged} panel-list block(s)`);

  // 2. Apply customCss with batch35 marker.
  let css = (post.customCss as string | null) ?? '';
  css = stripBlock(css, '/* batch35 — services panel feature-list SVG icons (live-extracted) */', '/* /batch35 */');
  css = (css ? css + '\n\n' : '') + BATCH35_CSS;

  await db
    .update(posts)
    .set({
      content: JSON.stringify(content),
      customCss: css,
      updatedAt: new Date(),
    })
    .where(eq(posts.id, 302));

  console.log(`post 302 batch35 applied. customCss length: ${css.length}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
