/**
 * Mobile fix for the home hero (post 793, block `home-hero`).
 *
 * The hero photo is positioned to the right 60% of the hero (`width:60%` on
 * .cd-hero__bgimg, inherited from the original ::after background). On desktop
 * that's the intended copy-left / photo-right split, but on mobile it renders
 * as a half-cut image with the centered copy overlapping it.
 *
 * This appends a max-width:768px media query that, on phones: stacks the hero
 * to a single column, hides the empty photo grid slot, makes the photo a
 * full-width backdrop, strengthens the gradient overlay to a vertical fade for
 * text contrast, and centers the copy/CTAs. Desktop is untouched.
 *
 * Idempotent: skips if the `mobile-hero-fix` marker is already present.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 793;
const HERO_BLOCK_ID = 'home-hero';

const MOBILE_CSS = `<style>/* mobile-hero-fix */
@media (max-width: 768px) {
  .cd-hero-clip { padding-bottom: 64px !important; }
  .cd-hero { padding: 52px 22px 60px 22px !important; }
  .cd-hero__inner { grid-template-columns: 1fr !important; min-height: 0 !important; gap: 0 !important; }
  .cd-hero__photo { display: none !important; }
  .cd-hero__bgimg { width: 100% !important; object-position: center 25% !important; }
  .cd-hero::before { background: linear-gradient(180deg, rgba(28,51,112,0.90) 0%, rgba(28,51,112,0.80) 50%, rgba(28,51,112,0.90) 100%) !important; }
  .cd-hero__copy { max-width: 100% !important; text-align: center !important; margin: 0 auto !important; }
  .cd-hero-clip .cd-hero__title, .cd-hero__title { font-size: clamp(1.9rem, 8vw, 2.9rem) !important; line-height: 1.04 !important; }
  .cd-hero__eyebrow { font-size: 0.66rem !important; }
  .cd-hero__desc { font-size: 1rem !important; }
  .cd-hero__ctas { justify-content: center !important; }
  .cd-hero__cta { width: 100% !important; max-width: 340px !important; text-align: center !important; }
}
</style>`;

async function main() {
  const [row] = await db.select({ content: posts.content }).from(posts).where(eq(posts.id, POST_ID));
  if (!row) throw new Error(`post ${POST_ID} not found`);
  const data = JSON.parse(row.content);
  const hero = (data.blocks || []).find(
    (b: { id?: string; type?: string; html?: string }) => b.id === HERO_BLOCK_ID && b.type === 'html-render',
  );
  if (!hero) throw new Error(`hero block ${HERO_BLOCK_ID} not found`);
  // Idempotent-replace: strip any prior mobile-hero-fix block, then append the
  // current one — so re-running updates the rules rather than no-op'ing.
  hero.html = hero.html.replace(/<style>\/\* mobile-hero-fix \*\/[\s\S]*?<\/style>/g, '');
  hero.html = hero.html + MOBILE_CSS;
  await db.update(posts).set({ content: JSON.stringify(data) }).where(eq(posts.id, POST_ID));
  console.log('Mobile hero fix appended. marker present:', hero.html.includes('mobile-hero-fix'));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
