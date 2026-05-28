/**
 * Iter 1: Auto Repair industry page (post id 805).
 *
 * Biggest visual gap vs cardiff.co/industries/auto-repair/: the original
 * hero is a 2-column block with photo background of mechanics + a single
 * "Check Eligibility" CTA, blue gradient fading into the photo on the
 * right. The port hero (block[0], a `section` wrapping heading + text +
 * 2-button columns) renders as a flat, centered blue panel with no
 * photo and two ghost-style buttons.
 *
 * Fix: replace block[0] in place with an `html-render` hero modeled on
 * scripts/migrations/cardiff/replace-home-hero.ts (same gradient overlay
 * + grid-template-columns layout + Raleway uppercase title), but tuned
 * for this page: the auto-repair hero photo, the original headline /
 * subtitle copy, and ONE primary "Check Eligibility" CTA (cardiff.co
 * shows only one button on this page, not two).
 *
 * Idempotent: if block[0] is already the replacement html-render hero
 * (id `hero-industries-auto-repair-html`), we re-write it in place.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 805;
const NEW_HERO_ID = 'hero-industries-auto-repair-html';
const OLD_HERO_ID = 'hero-industries-auto-repair';

const HERO_HTML = `
<style>
  .cd-hero { position: relative; overflow: hidden; background: #1c3370; color: #fff; padding: 88px 24px 96px 24px; }
  .cd-hero::before { content: ''; position: absolute; inset: 0; background: linear-gradient(95deg, rgba(28,51,112,0.96) 0%, rgba(28,51,112,0.86) 32%, rgba(37,65,139,0.55) 60%, rgba(37,65,139,0.18) 80%, rgba(37,65,139,0.05) 100%); z-index: 2; pointer-events: none; }
  .cd-hero::after { content: ''; position: absolute; top: 0; right: 0; bottom: 0; width: 65%; background-image: var(--cd-hero-bg); background-size: cover; background-position: center right; z-index: 1; }
  .cd-hero__inner { position: relative; z-index: 3; max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); gap: 48px; align-items: center; min-height: 440px; }
  .cd-hero__copy { max-width: 600px; }
  .cd-hero__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 3.5rem; font-weight: 800; letter-spacing: -0.01em; line-height: 1.05; color: #fff; text-transform: uppercase; margin: 0 0 22px 0; text-shadow: 0 2px 24px rgba(0,0,0,0.42); }
  .cd-hero__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; font-weight: 400; line-height: 1.55; color: rgba(255,255,255,0.92); margin: 0 0 32px 0; max-width: 520px; }
  .cd-hero__ctas { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; }
  .cd-hero__cta { display: inline-block; background: #5ac96f; color: #ffffff; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 700; font-size: 0.875rem; letter-spacing: 0.12em; text-transform: uppercase; padding: 17px 36px; border-radius: 4px; text-decoration: none; box-shadow: 0 14px 36px rgba(90,201,111,0.42); transition: transform 0.2s ease, box-shadow 0.2s ease; }
  .cd-hero__cta:hover { transform: translateY(-1px); box-shadow: 0 18px 42px rgba(90,201,111,0.52); }
  .cd-hero__photo { position: relative; z-index: 3; align-self: stretch; }
  @media (max-width: 900px) {
    .cd-hero { padding: 56px 20px 72px 20px; }
    .cd-hero::after { width: 100%; opacity: 0.32; }
    .cd-hero__inner { grid-template-columns: 1fr; gap: 24px; min-height: auto; text-align: center; }
    .cd-hero__copy { max-width: none; margin: 0 auto; }
    .cd-hero__title { font-size: 2.25rem; }
    .cd-hero__ctas { justify-content: center; }
    .cd-hero__photo { display: none; }
  }
</style>
<section class="cd-hero" style="--cd-hero-bg: url('{{photoUrl}}');">
  <div class="cd-hero__inner">
    <div class="cd-hero__copy">
      <h1 class="cd-hero__title" data-field="title">{{title}}</h1>
      <p class="cd-hero__desc" data-field="description">{{description}}</p>
      <div class="cd-hero__ctas">
        <a class="cd-hero__cta" href="{{ctaUrl}}" data-field="ctaText">{{ctaText}}</a>
      </div>
    </div>
    <div class="cd-hero__photo" aria-hidden="true"></div>
  </div>
</section>
`.trim();

const newHeroBlock = {
  id: NEW_HERO_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  html: HERO_HTML,
  fields: [
    { name: 'title', label: 'Headline', type: 'text' as const, default: 'Small Business Loans for Auto Repair' },
    { name: 'description', label: 'Description', type: 'textarea' as const, default: "Access essential auto repair shop financing and business loans for your shop's needs. Discover how to fund your auto repair business with tailored solutions." },
    { name: 'ctaText', label: 'CTA text', type: 'text' as const, default: 'Check Eligibility' },
    { name: 'ctaUrl', label: 'CTA url', type: 'url' as const, default: 'https://cardiff.co/business/apply' },
    { name: 'photoUrl', label: 'Hero photo', type: 'image' as const, default: 'https://cardiff.co/wp-content/uploads/2025/08/Small-Business-Loans-for-Auto-Repair.jpg' },
  ],
  values: {
    title: 'Small Business Loans for Auto Repair',
    description: "Access essential auto repair shop financing and business loans for your shop's needs. Discover how to fund your auto repair business with tailored solutions.",
    ctaText: 'Check Eligibility',
    ctaUrl: 'https://cardiff.co/business/apply',
    photoUrl: 'https://cardiff.co/wp-content/uploads/2025/08/Small-Business-Loans-for-Auto-Repair.jpg',
  },
};

async function main() {
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
  const head = parsed.blocks[0];
  if (head?.id === NEW_HERO_ID) {
    parsed.blocks[0] = newHeroBlock;
    console.log(`Re-wrote existing ${NEW_HERO_ID} at index 0 (idempotent re-run).`);
  } else if (head?.id === OLD_HERO_ID) {
    parsed.blocks[0] = newHeroBlock;
    console.log(`Replaced legacy section hero (id ${OLD_HERO_ID}) with html-render hero.`);
  } else {
    console.error(`Post ${POST_ID}: expected block[0] id to be '${OLD_HERO_ID}' or '${NEW_HERO_ID}', got '${head?.id}' (type=${head?.type}); aborting`);
    process.exit(1);
  }
  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: block count ${parsed.blocks.length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
