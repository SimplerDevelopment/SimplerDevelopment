/**
 * Iter 1: Replace the Merchant Cash Advance page hero (post 824,
 * block[0] id=hero-merchant-cash-advance) with a two-column photo-backed
 * html-render hero that matches cardiff.co.
 *
 * Original https://cardiff.co/business-loans/products/merchant-cash-advance/
 * uses a Divi section with a hands-on-calculator photo as background,
 * a deep blue overlay on the LEFT that fades into the image on the right,
 * uppercase headline, body copy, and a green "APPLY NOW" CTA (with a ghost
 * "Talk to a Specialist" secondary).
 *
 * Our current port is a flat blue centered hero with two stacked buttons —
 * completely different layout, no image. The stock `section` block can't
 * express a split-overlay+background-image hero cleanly, so we swap the
 * whole hero section for an `html-render` block. Same pattern as
 * styled-sba-loans-iter1.ts.
 *
 * Idempotent: refuses to clobber if block[0] is not the original section.
 * Re-running after the swap is a no-op (it will re-write the same html-render).
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const MCA_POST_ID = 824;
const HERO_BLOCK_ID = 'hero-merchant-cash-advance';

const HERO_HTML = `
<style>
  .cd-mca-hero { position: relative; overflow: hidden; background: #1c3370; color: #fff; padding: 110px 24px 130px 24px; min-height: 520px; }
  .cd-mca-hero::before { content: ''; position: absolute; inset: 0; background-image: var(--cd-mca-hero-bg); background-size: cover; background-position: center right; z-index: 1; }
  .cd-mca-hero::after { content: ''; position: absolute; inset: 0; background: linear-gradient(95deg, rgba(28,51,112,0.94) 0%, rgba(28,51,112,0.86) 38%, rgba(37,65,139,0.55) 64%, rgba(37,65,139,0.18) 82%, rgba(37,65,139,0.04) 100%); z-index: 2; pointer-events: none; }
  .cd-mca-hero__inner { position: relative; z-index: 3; max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 48px; align-items: center; min-height: 360px; }
  .cd-mca-hero__copy { max-width: 560px; }
  .cd-mca-hero__eyebrow { display: inline-block; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.72rem; letter-spacing: 0.32em; text-transform: uppercase; color: #ffb798; font-weight: 700; margin: 0 0 20px 0; }
  .cd-mca-hero__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 3.75rem; font-weight: 800; letter-spacing: -0.02em; line-height: 1.04; color: #fff; text-transform: uppercase; margin: 0 0 22px 0; text-shadow: 0 2px 22px rgba(0,0,0,0.42); }
  .cd-mca-hero__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; font-weight: 400; line-height: 1.6; color: rgba(255,255,255,0.92); margin: 0 0 32px 0; max-width: 480px; }
  .cd-mca-hero__ctas { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; }
  .cd-mca-hero__cta { display: inline-block; background: #5ac96f; color: #ffffff; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 700; font-size: 0.875rem; letter-spacing: 0.12em; text-transform: uppercase; padding: 17px 36px; border-radius: 4px; text-decoration: none; box-shadow: 0 14px 36px rgba(90,201,111,0.42); transition: transform 0.2s ease, box-shadow 0.2s ease; }
  .cd-mca-hero__cta:hover { transform: translateY(-1px); box-shadow: 0 18px 42px rgba(90,201,111,0.52); }
  .cd-mca-hero__cta--ghost { background: transparent; color: #ffffff; border: 1.5px solid rgba(255,255,255,0.5); padding: 15.5px 32px; box-shadow: none; backdrop-filter: blur(6px); }
  .cd-mca-hero__cta--ghost:hover { background: rgba(255,255,255,0.10); box-shadow: none; }
  .cd-mca-hero__photo { position: relative; z-index: 3; align-self: stretch; }
  @media (max-width: 900px) {
    .cd-mca-hero { padding: 64px 20px 80px 20px; min-height: auto; }
    .cd-mca-hero::after { background: linear-gradient(180deg, rgba(28,51,112,0.88) 0%, rgba(28,51,112,0.78) 100%); }
    .cd-mca-hero__inner { grid-template-columns: 1fr; gap: 24px; min-height: auto; text-align: center; }
    .cd-mca-hero__copy { max-width: none; margin: 0 auto; }
    .cd-mca-hero__title { font-size: 2.25rem; }
    .cd-mca-hero__ctas { justify-content: center; }
    .cd-mca-hero__photo { display: none; }
  }
</style>
<section class="cd-mca-hero" style="--cd-mca-hero-bg: url('{{photoUrl}}');">
  <div class="cd-mca-hero__inner">
    <div class="cd-mca-hero__copy">
      <p class="cd-mca-hero__eyebrow" data-field="eyebrow">{{eyebrow}}</p>
      <h1 class="cd-mca-hero__title" data-field="title">{{title}}</h1>
      <p class="cd-mca-hero__desc" data-field="description">{{description}}</p>
      <div class="cd-mca-hero__ctas">
        <a class="cd-mca-hero__cta" href="{{ctaUrl}}" data-field="ctaText">{{ctaText}}</a>
        <a class="cd-mca-hero__cta cd-mca-hero__cta--ghost" href="{{secondaryCtaUrl}}" data-field="secondaryCtaText">{{secondaryCtaText}}</a>
      </div>
    </div>
    <div class="cd-mca-hero__photo" aria-hidden="true"></div>
  </div>
</section>
`.trim();

const PHOTO_URL = 'https://cardiffcompany.wpenginepowered.com/wp-content/smush-webp/2025/08/MCA-business-loans.jpg.webp';

const newHeroBlock = {
  id: HERO_BLOCK_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  html: HERO_HTML,
  fields: [
    { name: 'eyebrow', label: 'Eyebrow', type: 'text', default: 'MERCHANT CASH ADVANCE' },
    { name: 'title', label: 'Headline', type: 'text', default: 'Merchant Cash Advance' },
    { name: 'description', label: 'Description', type: 'textarea', default: 'Get fast MCA business loans with same-day funding and flexible repayment options. Click now to apply for merchant cash advance financing online.' },
    { name: 'ctaText', label: 'Primary CTA text', type: 'text', default: 'Apply Now' },
    { name: 'ctaUrl', label: 'Primary CTA url', type: 'url', default: 'https://cardiff.co/business/apply' },
    { name: 'secondaryCtaText', label: 'Secondary CTA text', type: 'text', default: 'Talk to a Specialist' },
    { name: 'secondaryCtaUrl', label: 'Secondary CTA url', type: 'url', default: '/contact-us' },
    { name: 'photoUrl', label: 'Hero photo', type: 'image', default: PHOTO_URL },
  ],
  values: {
    eyebrow: 'MERCHANT CASH ADVANCE',
    title: 'Merchant Cash Advance',
    description: 'Get fast MCA business loans with same-day funding and flexible repayment options. Click now to apply for merchant cash advance financing online.',
    ctaText: 'Apply Now',
    ctaUrl: 'https://cardiff.co/business/apply',
    secondaryCtaText: 'Talk to a Specialist',
    secondaryCtaUrl: '/contact-us',
    photoUrl: PHOTO_URL,
  },
};

async function main() {
  const [row] = await db.select().from(posts).where(eq(posts.id, MCA_POST_ID)).limit(1);
  if (!row) {
    console.error(`Post ${MCA_POST_ID} not found`);
    process.exit(1);
  }
  const parsed = JSON.parse(row.content);
  if (!Array.isArray(parsed.blocks)) {
    console.error(`Post ${MCA_POST_ID}: content.blocks is not an array`);
    process.exit(1);
  }
  const oldHero = parsed.blocks[0];
  if (oldHero?.id !== HERO_BLOCK_ID) {
    console.error(`Post ${MCA_POST_ID}: block[0] is not '${HERO_BLOCK_ID}' (was ${oldHero?.id} / type ${oldHero?.type}); aborting to avoid clobbering`);
    process.exit(1);
  }
  parsed.blocks[0] = newHeroBlock;
  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, MCA_POST_ID));
  console.log(`Updated post ${MCA_POST_ID}: replaced '${HERO_BLOCK_ID}' with html-render. Block count: ${parsed.blocks.length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
