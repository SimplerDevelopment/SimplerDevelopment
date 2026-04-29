/**
 * Batch 41 — solutions section mobile reflow guard.
 *
 * Regression: batch38 (commit 19e3fe75) added a global
 *   `padding: 20px !important` to every solutions-cards grid item.
 * That probe was taken at 1440px desktop, where the prior 28/28/64
 * padding made cards feel cramped relative to live's 20px-all-around.
 * Applied unguarded, the new rule wins the cascade at mobile too —
 * collapsing cards from 28/28/64 (comfortable internal gutter +
 * generous bottom for the arrow CTA) down to a flat 20px box.
 *
 * Effect: mobile pixelmatch fell 74.11 → 69.36 in one round. Mobile
 * solutions specifically scored 71.80, with the body copy now hugging
 * the bottom edge (no breathing room above the arrow).
 *
 * Fix: gate the batch38 padding override to desktop-only via
 * `@media (min-width: 769px)`. Keeps the desktop probe-derived 20px
 * rule but lets mobile fall back to the earlier 28/28/64 cascade.
 *
 * Idempotent: strips prior batch41 marker before re-applying. Run with:
 *   bun -r dotenv/config scripts/migrations/postcaptain/batch41-solutions-mobile-guard.ts dotenv_config_path=.env.local
 */
import 'dotenv/config';
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const BATCH41_CSS = `/* batch41 — solutions card-padding mobile guard */

/* batch38 collapsed solutions cards to a flat 20px on every viewport.
   That probe was taken at 1440px where it matches live. On mobile,
   the same rule wins the cascade against earlier 28/28/64 rules and
   collapses the comfortable interior gutter live keeps even narrow.

   Probe (.planning/postcaptain-replication/_probe-mobile-solutions.mjs)
   confirms live's mobile card geometry:
     card width 350px, padding 36px 28px (single padding profile —
     no separate outer wrapper).

   Local has TWO nesting layers under the cards container:
     <a>                ← transparent wrapper, NO visual chrome
       <div>            ← white bg, rounded, box-shadow — THIS is "the card"
         (content)

   The visual card in local is the inner <div>, so that's where the
   padding should match live's 36/28. We also reset the outer <a>
   padding to 0 on mobile to avoid the double-pad batch38 introduced
   (which makes content area artificially narrow). */
@media (max-width: 768px) {
  /* Inner card div — match live's mobile padding profile. */
  .block-content [data-block-id="solutions-cards"] > div > a > div,
  .block-content [data-block-id="solutions-cards"] .grid > a > div {
    padding: 36px 28px !important;
  }
  /* Outer <a> wrapper — zero padding so content fills the card. */
  .block-content [data-block-id="solutions-cards"] > div > a,
  .block-content [data-block-id="solutions-cards"] .grid > a {
    padding: 0 !important;
  }
}

/* /batch41 */`;

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
    '/* batch41 — solutions card-padding mobile guard */',
    '/* /batch41 */',
  );
  css = (css ? css + '\n\n' : '') + BATCH41_CSS;

  await db
    .update(posts)
    .set({
      customCss: css,
      updatedAt: new Date(),
    })
    .where(eq(posts.id, 302));

  console.log(`post 302 batch41 applied. customCss length: ${css.length}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
