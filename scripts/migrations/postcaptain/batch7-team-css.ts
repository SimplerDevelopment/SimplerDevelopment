/**
 * Batch 7 — hide the "+" toggle on team flip cards.
 *
 * Live shows team cards as a static photo+name+title+bio grid. Local uses
 * the team-flip-grid block which renders a "+" button next to the name to
 * trigger flip-to-Q&A. The "+" button is the most visible static-screenshot
 * difference. Hide it with CSS to close the team-section visual gap.
 *
 * Idempotent — re-stamps the marker.
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
    /\/\* team-static-look[\s\S]*?\/\* \/team-static-look \*\//g,
    '',
  );
  css += `

/* team-static-look — hide the "+" flip toggle for static-screenshot parity */
.block-content [data-block-id="team-flip-grid-1"] .pc-flip-card__toggle {
  display: none !important;
}
.block-content [data-block-id="team-flip-grid-1"] .pc-flip-card__name-row,
.block-content [data-block-id="team-flip-grid-1"] [class*="name-row"] {
  justify-content: flex-start !important;
}
/* /team-static-look */`;

  await db
    .update(posts)
    .set({ customCss: css, updatedAt: new Date() })
    .where(eq(posts.id, 302));

  console.log('post 302 batch7 applied (team-static-look CSS).');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
