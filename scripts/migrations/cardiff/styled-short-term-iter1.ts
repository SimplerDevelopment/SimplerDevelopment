/**
 * Iter 1: Replace the Short-Term Working Capital page hero
 * (post 830, block[0] id=hero-short-term-working-capital-loans)
 * with a two-column photo-backed html-render hero matching cardiff.co.
 *
 * Current port is a flat blue-gradient centered hero. The cardiff.co
 * original uses a full-bleed warehouse/business photo
 * (Loans-to-Power-Small-Business-Growth.jpg) behind the headline
 * "Fast-Term Loans to Power Small Business Growth" with a green
 * Apply Now CTA + ghost Talk to a Specialist secondary.
 *
 * Same html-render pattern as styled-equipment-leasing-iter1.ts /
 * styled-sba-loans-iter1.ts so the page matches the other ported
 * product heroes.
 *
 * Idempotent: matches block[0] by id, which is reused for the new
 * html-render block.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 830;
const HERO_ID = 'hero-short-term-working-capital-loans';

const HERO_HTML = `
<style>
  .cd-st-hero { position: relative; overflow: hidden; background: #1c3370; color: #fff; padding: 110px 24px 130px 24px; min-height: 520px; }
  .cd-st-hero::before { content: ''; position: absolute; inset: 0; background-image: var(--cd-st-hero-bg); background-size: cover; background-position: center right; z-index: 1; }
  .cd-st-hero::after { content: ''; position: absolute; inset: 0; background: linear-gradient(95deg, rgba(28,51,112,0.94) 0%, rgba(28,51,112,0.86) 38%, rgba(37,65,139,0.55) 64%, rgba(37,65,139,0.18) 82%, rgba(37,65,139,0.04) 100%); z-index: 2; pointer-events: none; }
  .cd-st-hero__inner { position: relative; z-index: 3; max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 48px; align-items: center; min-height: 360px; }
  .cd-st-hero__copy { max-width: 560px; }
  .cd-st-hero__eyebrow { display: inline-block; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.72rem; letter-spacing: 0.32em; text-transform: uppercase; color: #ffb798; font-weight: 700; margin: 0 0 20px 0; }
  .cd-st-hero__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 3.75rem; font-weight: 800; letter-spacing: -0.02em; line-height: 1.04; color: #fff; text-transform: uppercase; margin: 0 0 22px 0; text-shadow: 0 2px 22px rgba(0,0,0,0.42); }
  .cd-st-hero__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; font-weight: 400; line-height: 1.6; color: rgba(255,255,255,0.92); margin: 0 0 32px 0; max-width: 480px; }
  .cd-st-hero__ctas { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; }
  .cd-st-hero__cta { display: inline-block; background: #5ac96f; color: #ffffff; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 700; font-size: 0.875rem; letter-spacing: 0.12em; text-transform: uppercase; padding: 17px 36px; border-radius: 4px; text-decoration: none; box-shadow: 0 14px 36px rgba(90,201,111,0.42); transition: transform 0.2s ease, box-shadow 0.2s ease; }
  .cd-st-hero__cta:hover { transform: translateY(-1px); box-shadow: 0 18px 42px rgba(90,201,111,0.52); }
  .cd-st-hero__cta--ghost { background: transparent; color: #ffffff; border: 1.5px solid rgba(255,255,255,0.5); padding: 15.5px 32px; box-shadow: none; backdrop-filter: blur(6px); }
  .cd-st-hero__cta--ghost:hover { background: rgba(255,255,255,0.10); box-shadow: none; }
  .cd-st-hero__photo { position: relative; z-index: 3; align-self: stretch; }
  @media (max-width: 900px) {
    .cd-st-hero { padding: 64px 20px 80px 20px; min-height: auto; }
    .cd-st-hero::after { background: linear-gradient(180deg, rgba(28,51,112,0.88) 0%, rgba(28,51,112,0.78) 100%); }
    .cd-st-hero__inner { grid-template-columns: 1fr; gap: 24px; min-height: auto; text-align: center; }
    .cd-st-hero__copy { max-width: none; margin: 0 auto; }
    .cd-st-hero__title { font-size: 2.25rem; }
    .cd-st-hero__ctas { justify-content: center; }
    .cd-st-hero__photo { display: none; }
  }
</style>
<section class="cd-st-hero" style="--cd-st-hero-bg: url('{{photoUrl}}');">
  <div class="cd-st-hero__inner">
    <div class="cd-st-hero__copy">
      <p class="cd-st-hero__eyebrow" data-field="eyebrow">{{eyebrow}}</p>
      <h1 class="cd-st-hero__title" data-field="title">{{title}}</h1>
      <p class="cd-st-hero__desc" data-field="description">{{description}}</p>
      <div class="cd-st-hero__ctas">
        <a class="cd-st-hero__cta" href="{{ctaUrl}}" data-field="ctaText">{{ctaText}}</a>
        <a class="cd-st-hero__cta cd-st-hero__cta--ghost" href="{{secondaryCtaUrl}}" data-field="secondaryCtaText">{{secondaryCtaText}}</a>
      </div>
    </div>
    <div class="cd-st-hero__photo" aria-hidden="true"></div>
  </div>
</section>
`.trim();

const newHeroBlock = {
  id: HERO_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  html: HERO_HTML,
  fields: [
    { name: 'eyebrow', label: 'Eyebrow', type: 'text', default: 'SHORT-TERM WORKING CAPITAL LOANS' },
    { name: 'title', label: 'Headline', type: 'text', default: 'Fast-Term Loans to Power Small Business Growth' },
    { name: 'description', label: 'Description', type: 'textarea', default: 'Short term business loans offer fast funding and fixed payments for cash flow or growth needs. See how Cardiff working capital term loans can help.' },
    { name: 'ctaText', label: 'Primary CTA text', type: 'text', default: 'Apply Now' },
    { name: 'ctaUrl', label: 'Primary CTA url', type: 'url', default: 'https://cardiff.co/business/apply' },
    { name: 'secondaryCtaText', label: 'Secondary CTA text', type: 'text', default: 'Talk to a Specialist' },
    { name: 'secondaryCtaUrl', label: 'Secondary CTA url', type: 'url', default: '/contact-us' },
    { name: 'photoUrl', label: 'Hero photo', type: 'image', default: 'https://cardiff.co/wp-content/uploads/2025/09/Loans-to-Power-Small-Business-Growth.jpg' },
  ],
  values: {
    eyebrow: 'SHORT-TERM WORKING CAPITAL LOANS',
    title: 'Fast-Term Loans to Power Small Business Growth',
    description: 'Short term business loans offer fast funding and fixed payments for cash flow or growth needs. See how Cardiff working capital term loans can help.',
    ctaText: 'Apply Now',
    ctaUrl: 'https://cardiff.co/business/apply',
    secondaryCtaText: 'Talk to a Specialist',
    secondaryCtaUrl: '/contact-us',
    photoUrl: 'https://cardiff.co/wp-content/uploads/2025/09/Loans-to-Power-Small-Business-Growth.jpg',
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
  const oldHero = parsed.blocks[0];
  if (oldHero?.id !== HERO_ID) {
    console.error(`Post ${POST_ID}: block[0] is not '${HERO_ID}' (was ${oldHero?.id} / type ${oldHero?.type}); aborting to avoid clobbering`);
    process.exit(1);
  }
  parsed.blocks[0] = newHeroBlock;
  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: replaced '${HERO_ID}' with html-render. Block count: ${parsed.blocks.length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
