/**
 * Batch 38 — solutions section width + card padding tuning.
 *
 * Probe (.planning/postcaptain-replication/_probe-solutions-width.mjs)
 * confirms the actual rendered geometry:
 *
 *   live  :  section maxWidth 1200, card width 378.6, card padding 20px
 *   local :  section maxWidth 1080, card width 338.6, card padding   0px
 *
 * That extra 40px per card explains why local body copy wraps to 5-6 lines
 * instead of live's 3-4. The decisions.md ACCEPTED entry "solutions sl3" is
 * now CLOSED via this batch.
 *
 * Fix:
 *   1. Bump solutions-section.maxWidth from 1080px → 1200px (JSON-only).
 *   2. Add customCss scoped to [data-block-id="solutions-cards"] giving
 *      each card a 20px inner gutter so the body copy doesn't hug the
 *      card edges.
 *
 * Idempotent: stripping prior batch38 marker before re-applying. Run with:
 *   bun -r dotenv/config scripts/migrations/postcaptain/batch38-solutions-width.ts dotenv_config_path=.env.local
 */
import 'dotenv/config';
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const BATCH38_CSS = `/* batch38 — solutions section width + card padding */

/* Card grid items — pad the inner content so body copy doesn't touch the
   card edge. Live uses 20px all-around. */
.block-content [data-block-id="solutions-cards"] > div > a,
.block-content [data-block-id="solutions-cards"] > div > div,
.block-content [data-block-id="solutions-cards"] .grid > a,
.block-content [data-block-id="solutions-cards"] .grid > div {
  padding: 20px !important;
}

/* /batch38 */`;

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
  maxWidth?: string;
  blocks?: AnyBlock[];
}

async function main() {
  const [post] = await db.select().from(posts).where(eq(posts.id, 302));
  if (!post) throw new Error('post 302 not found');

  // 1. Bump solutions-section.maxWidth.
  const content = JSON.parse(post.content as string);
  const sol = content.blocks.find((b: AnyBlock) => b.id === 'solutions-section');
  if (!sol) throw new Error('solutions-section not found');
  const before = sol.maxWidth;
  sol.maxWidth = '1200px';
  console.log(`solutions-section.maxWidth: ${before} -> ${sol.maxWidth}`);

  // 2. Apply customCss with batch38 marker.
  let css = (post.customCss as string | null) ?? '';
  css = stripBlock(css, '/* batch38 — solutions section width + card padding */', '/* /batch38 */');
  css = (css ? css + '\n\n' : '') + BATCH38_CSS;

  await db
    .update(posts)
    .set({
      content: JSON.stringify(content),
      customCss: css,
      updatedAt: new Date(),
    })
    .where(eq(posts.id, 302));

  console.log(`post 302 batch38 applied. customCss length: ${css.length}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
