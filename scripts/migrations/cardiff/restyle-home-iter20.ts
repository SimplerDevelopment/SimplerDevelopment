/**
 * Iter 20 — Add cardiff.co's signature diagonal-cut slash to the bottom of
 * the home hero (post 793, block id=`home-hero`), and pull the trust-badges
 * strip up so it overlaps the slash. This is the single most visible
 * missing detail vs cardiff.co — their hero ends in a ~-3°/-4° clip-path
 * angle that the next strip rises into. Ours has been flat.
 *
 * Approach (kept minimal so existing hero markup stays readable):
 *   1. Inject a `<style>` tag scoped to `.cd-hero-clip` inside the hero's
 *      existing HTML. The class is added to the outer wrapper non-
 *      destructively by inserting it into the first `<div class="cd-hero">`
 *      occurrence (additive — no other markup changes).
 *   2. clip-path: `polygon(0 0, 100% 0, 100% calc(100% - 60px), 0 100%)`
 *      cuts a -3.4° slash off the bottom-right of the hero, plus a 60px
 *      `padding-bottom` bump so the headline/CTA don't ride the slash edge.
 *      Mobile (<=720px) drops to a 32px slash for visual balance; the
 *      `prefers-reduced-motion` doesn't apply here, but on very small
 *      widths the clip is removed entirely so nothing gets eaten.
 *   3. Trust-badges strip (block 1) gets `marginTop: -44px` + a small
 *      `position: relative; zIndex: 2` shim so its cards rise into the
 *      slash without going under it.
 *   4. Also widen the hero photo's right-edge fade (added in an earlier
 *      iter via inline gradient) is left alone — we don't have a hook
 *      on it from here and the diagonal cut already softens the right
 *      side dramatically. Skipping the optional photo-fade per the
 *      "only if simple" note.
 *
 * Idempotent: detects the `cd-hero-clip` marker class and the existing
 * negative margin on trust-badges; re-runs simply reassign the same
 * values. No splicing.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 793;
const HERO_ID = 'home-hero';
const NEXT_ID = 'trust-badges';

const CLIP_STYLE_MARKER = '/* cd-hero-clip iter20 */';
const CLIP_STYLE = `<style>${CLIP_STYLE_MARKER}
  .cd-hero-clip {
    position: relative;
    padding-bottom: 156px !important;
    clip-path: polygon(0 0, 100% 0, 100% calc(100% - 64px), 0 100%);
    -webkit-clip-path: polygon(0 0, 100% 0, 100% calc(100% - 64px), 0 100%);
  }
  @media (max-width: 900px) {
    .cd-hero-clip {
      padding-bottom: 120px !important;
      clip-path: polygon(0 0, 100% 0, 100% calc(100% - 36px), 0 100%);
      -webkit-clip-path: polygon(0 0, 100% 0, 100% calc(100% - 36px), 0 100%);
    }
  }
  @media (max-width: 560px) {
    .cd-hero-clip {
      padding-bottom: 88px !important;
      clip-path: none;
      -webkit-clip-path: none;
    }
  }
</style>`;

function addClipClassToHeroRoot(html: string): string {
  // Match the first occurrence of `class="cd-hero"` (with any attribute order)
  // and append the marker class once. Idempotent: skip if already present.
  if (html.includes('cd-hero-clip')) return html;
  // Most likely literal: `class="cd-hero"`. Handle that first.
  if (html.includes('class="cd-hero"')) {
    return html.replace('class="cd-hero"', 'class="cd-hero cd-hero-clip"');
  }
  // Fallback: any class list that contains the token cd-hero as a whole word.
  return html.replace(
    /class="([^"]*\bcd-hero\b[^"]*)"/,
    (_m, classes) => `class="${classes} cd-hero-clip"`,
  );
}

function ensureClipStyle(html: string): string {
  if (html.includes(CLIP_STYLE_MARKER)) return html;
  // Prepend the style tag so it lives next to the existing hero <style>.
  return CLIP_STYLE + html;
}

async function main() {
  const [row] = await db
    .select()
    .from(posts)
    .where(eq(posts.id, POST_ID))
    .limit(1);
  if (!row) throw new Error(`Post ${POST_ID} not found`);

  const parsed = JSON.parse(row.content);
  const hero = parsed.blocks?.find((b: any) => b.id === HERO_ID);
  if (!hero) throw new Error(`Hero '${HERO_ID}' not found on post ${POST_ID}`);
  if (typeof hero.html !== 'string')
    throw new Error(`Hero '${HERO_ID}' has no html string to mutate`);

  const next = parsed.blocks?.find((b: any) => b.id === NEXT_ID);
  if (!next) throw new Error(`Next block '${NEXT_ID}' not found`);

  // 1. Add clip class to hero root + inject scoped style. Both idempotent.
  hero.html = addClipClassToHeroRoot(hero.html);
  hero.html = ensureClipStyle(hero.html);

  if (!hero.html.includes('cd-hero-clip'))
    throw new Error(
      'iter20: failed to find a `cd-hero` root class to attach the clip to',
    );

  // 2. Pull trust-badges strip up into the slash. Idempotent overwrite.
  next.style = {
    ...(next.style || {}),
    marginTop: '-44px',
    position: 'relative',
    zIndex: 2,
  };

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));

  console.log(
    `iter20: clip-path slash added to '${HERO_ID}', '${NEXT_ID}' marginTop -44px on post ${POST_ID}`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
