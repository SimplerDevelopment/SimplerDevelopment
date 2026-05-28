/**
 * Mobile Terms (post id 825) — iteration 4.
 *
 * Side-by-side check of cardiff.co (mobile-terms-and-conditions redirects to
 * /legal-notices/ — the same legal-page treatment as /privacy-policy/) vs the
 * port revealed iter3 OVER-DECORATED the H3 section headings. The port shows
 * each H3 ("Cardiff Updates", "STOP Information", "HELP Information",
 * "Supported carriers are:") as a bordered card (orange 4px left bar +
 * soft-blue tile background + 14/18px padding + rounded corners). The
 * original is plain — computed style on cardiff.co legal H3s is
 * `color: rgb(82, 95, 127)` (muted slate `#525f7f`), `font-size: 20px`,
 * `font-weight: 700`, no background, no border, no padding, no rounded
 * corner, line-height 30px (1.5).
 *
 * Fix mirrors privacy-policy iter4 exactly: strip the iter3 card chrome
 * from every `sec-1` H3 and replace with the original's quiet treatment.
 * Margins are kept (40px top / 14px bottom) so the section rhythm reads —
 * but no bar, no tile, no pad, no radius. Color is toned down from cardiff
 * deep-blue (#1c3370) to the muted slate the original uses (#525f7f).
 *
 * Targets only `sec-1` children whose `type === 'heading'` and
 * `level === 3` (the 4 named sections). H2 and H4 are left alone.
 *
 * Idempotent: replaces the H3 style object outright on every run; safe
 * to re-run.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const POST_ID = 825;
  const SECTION_ID = 'sec-1';

  const [row] = await db.select().from(posts).where(eq(posts.id, POST_ID)).limit(1);
  if (!row) {
    console.error(`Post ${POST_ID} not found`);
    process.exit(1);
  }
  const parsed = JSON.parse(row.content);
  if (!Array.isArray(parsed.blocks)) {
    console.error(`Post ${POST_ID}: content.blocks is not an array`);
    process.exit(1);
  }

  const sec = parsed.blocks.find((b: { id?: string }) => b?.id === SECTION_ID);
  if (!sec || !Array.isArray(sec.blocks)) {
    console.error(`Post ${POST_ID}: section ${SECTION_ID} not found or has no children`);
    process.exit(1);
  }

  // The original cardiff.co treatment — quiet, plain, no decorative
  // chrome. Just bold muted-slate type with vertical rhythm.
  const h3Style = {
    color: '#525f7f',
    fontFamily: "Raleway, -apple-system, BlinkMacSystemFont, sans-serif",
    fontSize: '1.25rem',
    fontWeight: '700',
    letterSpacing: 'normal',
    lineHeight: '1.35',
    margin: '40px 0 14px 0',
    padding: '0',
    borderLeft: 'none',
    backgroundColor: 'transparent',
    borderRadius: '0',
  };

  let h3Count = 0;
  for (const b of sec.blocks) {
    if (!b || typeof b !== 'object') continue;
    if (b.type === 'heading' && b.level === 3) {
      // Replace style object outright — overwrite iter3's chrome keys
      // (borderLeft, backgroundColor, borderRadius, padding) cleanly.
      b.style = { ...(b.style || {}), ...h3Style };
      h3Count++;
    }
  }

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));

  console.log(
    `Updated post ${POST_ID}: reverted ${h3Count} H3 section heading(s) from iter3 card chrome to original-style plain bold slate.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
