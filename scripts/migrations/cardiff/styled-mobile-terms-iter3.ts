/**
 * Mobile Terms (post id 825) — iteration 3.
 *
 * Iter 1 rebuilt the hero band. Iter 2 forced the body section to pure white
 * and dropped the trailing final-cta. Remaining polish: the H3 section
 * headings inside `sec-1` read as a flat wall of blue text on a long legal
 * page. They ARE the navigation — they need to be scannable.
 *
 * Treatment (mirrors the iter3 privacy-policy treatment for consistency):
 * add a 4px orange left-accent bar + soft blue tint background + generous
 * left padding to every H3 in `sec-1`. Also normalize plain-text paragraph
 * margins so each section reads as a unit under its heading.
 *
 * Targets only `sec-1` children whose `type === 'heading'` and `level === 3`.
 * The H2 ("Mobile Terms and Conditions") and any H4 ("Last updated:") are
 * left alone.
 *
 * Idempotent: re-assigns the same style each run; safe to re-run.
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

  // Style applied to every H3 section heading — matches privacy-policy iter3.
  const h3Style = {
    color: '#1c3370',
    fontFamily: "Raleway, -apple-system, BlinkMacSystemFont, sans-serif",
    fontSize: '1.5rem',
    fontWeight: '700',
    letterSpacing: '-0.005em',
    lineHeight: '1.3',
    margin: '48px 0 18px 0',
    padding: '14px 18px 14px 20px',
    borderLeft: '4px solid #ef6632',
    backgroundColor: '#f6f9fc',
    borderRadius: '0 6px 6px 0',
  };

  // Tighten plain-text paragraph margin so each section reads as a unit.
  const paragraphMargin = '0 0 16px 0';

  let h3Count = 0;
  let pCount = 0;
  for (const b of sec.blocks) {
    if (!b || typeof b !== 'object') continue;
    if (b.type === 'heading' && b.level === 3) {
      b.style = { ...(b.style || {}), ...h3Style };
      h3Count++;
    } else if (b.type === 'text' && typeof b.content === 'string' && !b.content.trim().startsWith('<')) {
      // Only normalize plain-text paragraphs; leave raw-HTML <ul>/<div> alone.
      b.style = { ...(b.style || {}), margin: paragraphMargin };
      pCount++;
    }
  }

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));

  console.log(
    `Updated post ${POST_ID}: restyled ${h3Count} H3 section heading(s) with orange left-accent + soft blue tint; normalized ${pCount} paragraph margin(s).`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
