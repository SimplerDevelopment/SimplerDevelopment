/**
 * Legal Notices (post id 822) — iteration 4.
 *
 * Side-by-side check of cardiff.co/legal-notices/ vs the port revealed
 * iter3 over-decorated the section H3 headings (REPRESENTATIONS AND
 * WARRANTIES, INDEMNITY OBLIGATION, LIMITATIONS OF USE, etc.). The
 * port renders each H3 as a bordered card (orange 4px left bar + soft
 * blue tile background + 14/18px padding + rounded corners + cardiff
 * deep-blue text). The original is plain — `color: rgb(82, 95, 127)`
 * (muted slate `#525f7f`), `fontSize: 20px`, `fontWeight: 700`, no
 * background, no border, no padding, no rounded corner, and the
 * headings are already ALL-CAPS in the source markup so we leave the
 * text content alone.
 *
 * Fix mirrors `styled-privacy-policy-iter4.ts` exactly so Privacy and
 * Legal read as siblings — strip the iter3 card chrome from every
 * `sec-1` H3, drop color from cardiff deep-blue (#1c3370) to muted
 * slate (#525f7f), reset padding/border/radius/background. Keep the
 * vertical rhythm (40px top / 14px bottom margin) so each section is
 * still legible as a section break.
 *
 * Targets only `sec-1` children whose `type === 'heading'` and
 * `level === 3`. H2 page title and H4 "Last updated" line are left
 * alone.
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

  const POST_ID = 822;
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
    `Updated post ${POST_ID}: reverted ${h3Count} numbered H3 heading(s) from iter3 card chrome to original-style plain bold slate.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
