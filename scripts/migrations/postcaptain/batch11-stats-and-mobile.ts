/**
 * Batch 11 — three high-leverage polish items identified in the prior session:
 *
 *   1. Stats card "metric value" wraps incorrectly (e.g. "83% Increase" wraps).
 *      Live lays out number + suffix on a single line via baseline-flex. Force
 *      that on `.cs-metrics .pc-metric-suffix` + the value div via customCSS.
 *
 *   2. Mobile sticky-scroll-tabs carousel uses white/grey active pill (matches
 *      desktop). Live mobile uses mint-green. Set the new universal block
 *      props `mobileActiveTabBackground` + `mobileActiveTabColor` etc. on
 *      `svc-scroll-tabs` so mobile pops mint without touching desktop.
 *
 *   3. (No-op aside) Note: leverage point #1 is screenshot-time only — see
 *      .planning/postcaptain-replication/screenshot.mjs (suppresses the local
 *      announcement bar at capture time).
 *
 * Idempotent: rewrites the marker block on each run; sets data fields by key.
 *
 * Run with:
 *   bun -r dotenv/config scripts/migrations/postcaptain/batch11-stats-and-mobile.ts dotenv_config_path=.env.local
 */
import 'dotenv/config';
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

type Block = Record<string, unknown> & {
  id?: string;
  type?: string;
  blocks?: Block[];
  columns?: Array<Record<string, unknown> & { blocks?: Block[] }>;
};

interface PostContent {
  blocks: Block[];
  version?: string;
}

function findBlockById(blocks: Block[], id: string): Block | null {
  for (const b of blocks) {
    if (b.id === id) return b;
    if (Array.isArray(b.blocks)) {
      const r = findBlockById(b.blocks, id);
      if (r) return r;
    }
    if (Array.isArray(b.columns)) {
      for (const col of b.columns ?? []) {
        if (Array.isArray(col?.blocks)) {
          const r = findBlockById(col.blocks as Block[], id);
          if (r) return r;
        }
      }
    }
  }
  return null;
}

async function main() {
  const [post] = await db.select().from(posts).where(eq(posts.id, 302));
  if (!post) throw new Error('post 302 not found');
  const parsed = JSON.parse(post.content) as PostContent;

  // ── (2) Mobile mint-green pills on the services scroll-tabs ─────────────
  const scrollTabs = findBlockById(parsed.blocks, 'svc-scroll-tabs');
  if (scrollTabs) {
    // Desktop stays white-on-grey (existing values), mobile pops mint-green
    // matching live's mobile.
    scrollTabs.mobileActiveTabBackground = '#A4D2A1';
    scrollTabs.mobileActiveTabColor = '#0A3A5C';
    scrollTabs.mobileInactiveTabBackground = '#EAF3EC';
    scrollTabs.mobileInactiveTabColor = '#0A3A5C';
  }

  // ── (1) Stats CSS — keep number + suffix on one baseline-flex line ──────
  let css = post.customCss ?? '';

  // Strip prior batch11 marker.
  css = css.replace(
    /\/\* batch11-stats-and-mobile[\s\S]*?\/\* \/batch11-stats-and-mobile \*\//g,
    '',
  );

  css += `

/* batch11-stats-and-mobile — fix metric value wrap + mobile-tab pill colors */

/* The metric "value" div contains a big number followed by .pc-metric-suffix.
   Live's behavior: number + suffix lay out as flex-wrap baseline — short
   suffixes ("Increase", "Raised") sit on the same line as the number; long
   suffixes ("of Staff Time Saved", "of Historical Data") wrap to a new line
   underneath. Default rendering treats them as inline text and wraps "Increase"
   mid-string at the wrong place, which is what we're fixing. */
.block-content [data-block-id="cs-metrics"] > section > .grid > a > div > div > div:first-child,
.block-content [data-block-id="cs-metrics"] > section > .grid > div > div > div:first-child {
  display: flex !important;
  align-items: baseline !important;
  flex-wrap: wrap !important;
  column-gap: 0.4rem !important;
  row-gap: 0 !important;
}
.block-content [data-block-id="cs-metrics"] .pc-metric-suffix {
  display: inline-block !important;
  font-size: 0.55em !important;
  font-weight: 300 !important;
  color: #004D80 !important;
  letter-spacing: 0 !important;
  margin-left: 0 !important;
  white-space: nowrap !important;
  flex-shrink: 0 !important;
}

/* /batch11-stats-and-mobile */`;

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), customCss: css, updatedAt: new Date() })
    .where(eq(posts.id, 302));

  console.log('post 302 batch11-stats-and-mobile applied.');
  console.log('  scroll-tabs.mobileActiveTabBackground ->', (scrollTabs as Record<string, unknown> | null)?.mobileActiveTabBackground ?? 'n/a');
  console.log('  css length ->', css.length);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
