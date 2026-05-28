/**
 * Iter 2 — Learn FAQ page (post 820, slug `learn-faq`).
 *
 * Single biggest gap vs cardiff.co/learn/faq/:
 *   The HERO band on the port has (a) a strong 135deg gradient, (b) a 3rem
 *   title, (c) a long marketing subtitle, and (d) two prominent CTA buttons
 *   ("Apply Now" / "Talk to a Specialist") in a columns block — NONE of
 *   which exist on cardiff.co. The original is a compact, flat solid-blue
 *   band (#25418b, ~244px tall, ~57px vertical padding) with just a 32px
 *   white title and a single short subtitle line. The CTAs are a port
 *   invention that makes the page feel like a landing page instead of a
 *   reference/FAQ page.
 *
 * Fix in this iter:
 *   1) Drop the `customCSS` gradient on the hero section — use the flat
 *      `backgroundColor: '#25418b'` only.
 *   2) Reduce hero vertical padding (80/64 → 56/56) to match original height.
 *   3) Reduce the heading from 3rem (48px) to 2rem (32px) — match original.
 *   4) Replace the long marketing subtitle with the original's exact line:
 *      "Find Answers to Frequently Asked Questions about Cardiff small
 *      business loans".
 *   5) Remove the `h-btns` columns block (Apply Now / Talk to a Specialist).
 *
 * NOT changed in this iter (deferred — smaller gaps):
 *   - The accordion body itself already matches the original 1:1 (20 Q&As,
 *     white cards, blue +/– chevrons, light-blue page bg). No edits.
 *   - The dark `final-cta` band at the bottom of the page is a port
 *     addition but is less visually jarring than the hero CTAs and is a
 *     reasonable conversion aid — leaving for a future iter.
 *
 * Idempotent: re-runs only set the explicit fields above; safe to run
 * multiple times.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 820;

async function main() {
  const [row] = await db.select().from(posts).where(eq(posts.id, POST_ID)).limit(1);
  if (!row) throw new Error(`Post ${POST_ID} not found`);

  const parsed = JSON.parse(row.content);
  const blocks = parsed.blocks as any[];
  if (!Array.isArray(blocks)) throw new Error('blocks not an array');

  const hero = blocks[0];
  if (hero?.id !== 'hero-learn-faq') {
    throw new Error(`Expected blocks[0].id === 'hero-learn-faq', got ${hero?.id}`);
  }

  // 1 + 2 — flatten gradient and shrink padding
  hero.style = {
    ...(hero.style || {}),
    backgroundColor: '#25418b',
    // 128 = 72 (fixed nav) + 56 breathing room — original cardiff.co also
    // has a transparent header overlapping the hero with ~57px vertical
    // padding under the nav band.
    paddingTop: '128px',
    paddingBottom: '56px',
    paddingLeft: '24px',
    paddingRight: '24px',
    color: '#ffffff',
  };
  // Explicitly clear the gradient customCSS — re-runs should not re-add it.
  if (hero.style.customCSS) {
    delete hero.style.customCSS;
  }

  // 3 — shrink hero title to match original 32px / w700
  const title = (hero.blocks || []).find((b: any) => b?.id === 'h-title');
  if (!title) throw new Error('h-title not found');
  title.style = {
    ...(title.style || {}),
    color: '#ffffff',
    fontFamily: "Raleway, -apple-system, BlinkMacSystemFont, sans-serif",
    fontSize: '2rem',
    fontWeight: '700',
    letterSpacing: '-0.01em',
    lineHeight: '1.15',
    margin: '0 0 12px 0',
    textAlign: 'center',
  };
  // Drop the heavy text-shadow customCSS if it was set in a prior iter.
  if (title.style.customCSS) {
    delete title.style.customCSS;
  }

  // 4 — match original subtitle line exactly
  const sub = (hero.blocks || []).find((b: any) => b?.id === 'h-sub');
  if (!sub) throw new Error('h-sub not found');
  sub.content =
    'Find Answers to Frequently Asked Questions about Cardiff small business loans';
  sub.style = {
    ...(sub.style || {}),
    color: 'rgba(255,255,255,0.9)',
    fontFamily: "'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif",
    fontSize: '1rem',
    lineHeight: '1.55',
    textAlign: 'center',
    maxWidth: '680px',
    margin: '0 auto',
  };

  // 5 — remove h-btns columns block entirely (no CTAs in the original hero).
  hero.blocks = (hero.blocks || []).filter((b: any) => b?.id !== 'h-btns');

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));

  console.log(
    `Updated post ${POST_ID}: flattened hero gradient, shrank padding/title, replaced subtitle, removed CTA columns.`
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
