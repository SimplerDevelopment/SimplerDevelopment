/**
 * Iter 1: Replace the SBA Loans page hero (post 829, block[0] id=hero-sba-loans)
 * with a two-column photo-backed html-render hero that matches cardiff.co.
 *
 * Original cardiff.co/business-loans/products/sba-loans/ uses a Divi/Elementor
 * section with a real photo of a smiling business owner as background,
 * a deep blue overlay on the LEFT that fades into the image on the right,
 * uppercase headline, body copy, and a single green "GET STARTED" CTA.
 *
 * Our current port is a flat blue-gradient centered hero with an orange
 * button — completely different layout, no image. The stock `section` block
 * can't express a split-overlay+background-image hero cleanly, so we swap
 * the whole hero section for an `html-render` block. Same pattern as
 * replace-home-hero.ts.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const SBA_POST_ID = 829;

const HERO_HTML = `
<style>
  .cd-sba-hero { position: relative; overflow: hidden; background: #1c3370; color: #fff; padding: 110px 24px 130px 24px; min-height: 520px; }
  .cd-sba-hero::before { content: ''; position: absolute; inset: 0; background-image: var(--cd-sba-hero-bg); background-size: cover; background-position: center right; z-index: 1; }
  .cd-sba-hero::after { content: ''; position: absolute; inset: 0; background: linear-gradient(95deg, rgba(28,51,112,0.94) 0%, rgba(28,51,112,0.86) 38%, rgba(37,65,139,0.55) 64%, rgba(37,65,139,0.18) 82%, rgba(37,65,139,0.04) 100%); z-index: 2; pointer-events: none; }
  .cd-sba-hero__inner { position: relative; z-index: 3; max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 48px; align-items: center; min-height: 360px; }
  .cd-sba-hero__copy { max-width: 560px; }
  .cd-sba-hero__eyebrow { display: inline-block; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.72rem; letter-spacing: 0.32em; text-transform: uppercase; color: #ffb798; font-weight: 700; margin: 0 0 20px 0; }
  .cd-sba-hero__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 3.75rem; font-weight: 800; letter-spacing: -0.02em; line-height: 1.04; color: #fff; text-transform: uppercase; margin: 0 0 22px 0; text-shadow: 0 2px 22px rgba(0,0,0,0.42); }
  .cd-sba-hero__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; font-weight: 400; line-height: 1.6; color: rgba(255,255,255,0.92); margin: 0 0 32px 0; max-width: 480px; }
  .cd-sba-hero__ctas { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; }
  .cd-sba-hero__cta { display: inline-block; background: #5ac96f; color: #ffffff; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 700; font-size: 0.875rem; letter-spacing: 0.12em; text-transform: uppercase; padding: 17px 36px; border-radius: 4px; text-decoration: none; box-shadow: 0 14px 36px rgba(90,201,111,0.42); transition: transform 0.2s ease, box-shadow 0.2s ease; }
  .cd-sba-hero__cta:hover { transform: translateY(-1px); box-shadow: 0 18px 42px rgba(90,201,111,0.52); }
  .cd-sba-hero__cta--ghost { background: transparent; color: #ffffff; border: 1.5px solid rgba(255,255,255,0.5); padding: 15.5px 32px; box-shadow: none; backdrop-filter: blur(6px); }
  .cd-sba-hero__cta--ghost:hover { background: rgba(255,255,255,0.10); box-shadow: none; }
  .cd-sba-hero__photo { position: relative; z-index: 3; align-self: stretch; }
  @media (max-width: 900px) {
    .cd-sba-hero { padding: 64px 20px 80px 20px; min-height: auto; }
    .cd-sba-hero::after { background: linear-gradient(180deg, rgba(28,51,112,0.88) 0%, rgba(28,51,112,0.78) 100%); }
    .cd-sba-hero__inner { grid-template-columns: 1fr; gap: 24px; min-height: auto; text-align: center; }
    .cd-sba-hero__copy { max-width: none; margin: 0 auto; }
    .cd-sba-hero__title { font-size: 2.25rem; }
    .cd-sba-hero__ctas { justify-content: center; }
    .cd-sba-hero__photo { display: none; }
  }
</style>
<section class="cd-sba-hero" style="--cd-sba-hero-bg: url('{{photoUrl}}');">
  <div class="cd-sba-hero__inner">
    <div class="cd-sba-hero__copy">
      <p class="cd-sba-hero__eyebrow" data-field="eyebrow">{{eyebrow}}</p>
      <h1 class="cd-sba-hero__title" data-field="title">{{title}}</h1>
      <p class="cd-sba-hero__desc" data-field="description">{{description}}</p>
      <div class="cd-sba-hero__ctas">
        <a class="cd-sba-hero__cta" href="{{ctaUrl}}" data-field="ctaText">{{ctaText}}</a>
        <a class="cd-sba-hero__cta cd-sba-hero__cta--ghost" href="{{secondaryCtaUrl}}" data-field="secondaryCtaText">{{secondaryCtaText}}</a>
      </div>
    </div>
    <div class="cd-sba-hero__photo" aria-hidden="true"></div>
  </div>
</section>
`.trim();

const newHeroBlock = {
  id: 'hero-sba-loans',
  type: 'html-render' as const,
  width: 'full' as const,
  html: HERO_HTML,
  fields: [
    { name: 'eyebrow', label: 'Eyebrow', type: 'text', default: 'SBA LOANS UP TO $500,000' },
    { name: 'title', label: 'Headline', type: 'text', default: 'SBA Business Loan Options in Seconds' },
    { name: 'description', label: 'Description', type: 'textarea', default: 'Find competitive business loans for small businesses, including flexible SBA loan options. Learn how our small business loans can support your company\'s growth.' },
    { name: 'ctaText', label: 'Primary CTA text', type: 'text', default: 'Get Started' },
    { name: 'ctaUrl', label: 'Primary CTA url', type: 'url', default: 'https://cardiff.co/business/apply' },
    { name: 'secondaryCtaText', label: 'Secondary CTA text', type: 'text', default: 'Talk to a Specialist' },
    { name: 'secondaryCtaUrl', label: 'Secondary CTA url', type: 'url', default: '/contact-us' },
    { name: 'photoUrl', label: 'Hero photo', type: 'image', default: 'https://cardiffcompany.wpenginepowered.com/wp-content/smush-webp/2025/06/SBA-Business-Loans.jpg.webp' },
  ],
  values: {
    eyebrow: 'SBA LOANS UP TO $500,000',
    title: 'SBA Business Loan Options in Seconds',
    description: 'Find competitive business loans for small businesses, including flexible SBA loan options. Learn how our small business loans can support your company\'s growth.',
    ctaText: 'Get Started',
    ctaUrl: 'https://cardiff.co/business/apply',
    secondaryCtaText: 'Talk to a Specialist',
    secondaryCtaUrl: '/contact-us',
    photoUrl: 'https://cardiffcompany.wpenginepowered.com/wp-content/smush-webp/2025/06/SBA-Business-Loans.jpg.webp',
  },
};

async function main() {
  const [row] = await db.select().from(posts).where(eq(posts.id, SBA_POST_ID)).limit(1);
  if (!row) {
    console.error(`Post ${SBA_POST_ID} not found`);
    process.exit(1);
  }
  const parsed = JSON.parse(row.content);
  if (!Array.isArray(parsed.blocks)) {
    console.error(`Post ${SBA_POST_ID}: content.blocks is not an array`);
    process.exit(1);
  }
  const oldHero = parsed.blocks[0];
  if (oldHero?.id !== 'hero-sba-loans') {
    console.error(`Post ${SBA_POST_ID}: block[0] is not 'hero-sba-loans' (was ${oldHero?.id} / type ${oldHero?.type}); aborting to avoid clobbering`);
    process.exit(1);
  }
  parsed.blocks[0] = newHeroBlock;
  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, SBA_POST_ID));
  console.log(`Updated post ${SBA_POST_ID}: replaced 'hero-sba-loans' with html-render. Block count: ${parsed.blocks.length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
