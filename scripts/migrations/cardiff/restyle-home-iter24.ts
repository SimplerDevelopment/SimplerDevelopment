/**
 * Iter 24 — Scale up the home hero headline to match cardiff.co.
 *
 * Side-by-side review (docs/screenshots/cardiff-{local,co}-hero.png):
 *   - cardiff.co's "BORROW BETTER" is HUGE, font-weight 900, very tight
 *     letter-spacing, stacks onto TWO lines ("BORROW" / "BETTER") because
 *     the words fill the copy column.
 *   - Ours is 4.25rem / weight 800 / -0.02em — renders on ONE line, looks
 *     timid against the photo, reads as a sub-headline. This is the single
 *     biggest remaining visual gap from the hero polish list.
 *
 * Fix: inject a tail-end <style> override (specificity bumped via the
 * existing `.cd-hero-clip` marker class) that:
 *   1. Bumps the title to clamp(3.25rem, 7.2vw, 7rem) — fluid scaling
 *      that hits ~6.5rem on a 1440px viewport, large enough that the
 *      two-word headline wraps naturally inside the ~480px copy column.
 *   2. Cranks font-weight to 900 (Raleway black) and letter-spacing to
 *      -0.035em — tighter than current -0.02em, matches cardiff.co's
 *      compact display feel.
 *   3. Tightens line-height to 0.95 so the two stacked words sit close.
 *   4. Narrows .cd-hero__copy max-width to 480px so the headline is
 *      forced to wrap (otherwise on wider columns it might still fit
 *      on one line at large viewports).
 *   5. Mobile cap: clamp() handles down-scaling but we still hold the
 *      <=900px breakpoint at 3rem (was 2.5rem) to preserve the bigness.
 *
 * The override is appended AFTER the existing hero <style> tag(s) so the
 * later rules win without any specificity gymnastics. Idempotent via a
 * marker comment.
 *
 * No touch to slider, stats, products, trust-badges margin, or the
 * iter20 clip-path. Only the hero title sizing changes.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 793;
const HERO_ID = 'home-hero';

const MARKER = '/* cd-hero-title iter24 */';
const TITLE_STYLE = `<style>${MARKER}
  .cd-hero-clip .cd-hero__copy { max-width: 480px; }
  .cd-hero-clip .cd-hero__title {
    font-size: clamp(3.25rem, 7.2vw, 7rem);
    font-weight: 900;
    letter-spacing: -0.035em;
    line-height: 0.95;
    margin: 0 0 26px 0;
  }
  @media (max-width: 900px) {
    .cd-hero-clip .cd-hero__title {
      font-size: clamp(2.5rem, 9vw, 3.5rem);
      line-height: 0.98;
    }
  }
</style>`;

function ensureTitleStyle(html: string): string {
  if (html.includes(MARKER)) return html;
  // Append at the very end so later rules win over the earlier hero <style>.
  return html + TITLE_STYLE;
}

interface Block {
  id?: string;
  html?: string;
}

async function main() {
  const [row] = await db
    .select()
    .from(posts)
    .where(eq(posts.id, POST_ID))
    .limit(1);
  if (!row) throw new Error(`Post ${POST_ID} not found`);

  const parsed = JSON.parse(row.content) as { blocks: Block[] };
  const hero = parsed.blocks?.find((b) => b.id === HERO_ID);
  if (!hero) throw new Error(`Hero '${HERO_ID}' not found on post ${POST_ID}`);
  if (typeof hero.html !== 'string')
    throw new Error(`Hero '${HERO_ID}' has no html string to mutate`);

  const before = hero.html;
  hero.html = ensureTitleStyle(hero.html);

  if (!hero.html.includes(MARKER))
    throw new Error('iter24: failed to append the title override style');

  const changed = hero.html !== before;

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));

  console.log(
    `iter24: ${changed ? 'appended' : 'already present'} — hero title scaled to clamp(3.25rem, 7.2vw, 7rem) weight 900 on post ${POST_ID}`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
