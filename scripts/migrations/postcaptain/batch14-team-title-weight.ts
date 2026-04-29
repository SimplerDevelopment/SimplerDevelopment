/**
 * Batch 14 — narrow CSS-only fixes for team & cta typography weights.
 *
 *   1. Team title "Follow Our Team's Lead" renders bold (700) locally;
 *      live looks lighter (500). Override via customCSS targeted at the
 *      team-flip-grid block's h2.
 *   2. Defensive: also pin the cta heading to 500 via CSS, in case the
 *      JSON-level fontWeight (set in batch13) is overridden by other
 *      cascading rules in the merged stylesheet.
 *
 * Idempotent — strips any prior batch14 marker and rewrites the block.
 *
 * Run with:
 *   bun -r dotenv/config scripts/migrations/postcaptain/batch14-team-title-weight.ts dotenv_config_path=.env.local
 */
import 'dotenv/config';
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const [post] = await db.select().from(posts).where(eq(posts.id, 302));
  if (!post) throw new Error('post 302 not found');

  let css = post.customCss ?? '';
  css = css.replace(
    /\/\* batch14-team-cta-weight[\s\S]*?\/\* \/batch14-team-cta-weight \*\//g,
    '',
  );
  css += `

/* batch14-team-cta-weight — match live's lighter heading weights */
.block-content [data-block-id="team-flip-grid-1"] h2 {
  font-weight: 500 !important;
}
.block-content [data-block-id="cta-heading"] h1,
.block-content [data-block-id="cta-heading"] h2,
.block-content [data-block-id="cta-heading"] h3 {
  font-weight: 500 !important;
}
/* /batch14-team-cta-weight */`;

  await db
    .update(posts)
    .set({ customCss: css, updatedAt: new Date() })
    .where(eq(posts.id, 302));

  console.log('post 302 batch14-team-cta-weight applied. css length:', css.length);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
