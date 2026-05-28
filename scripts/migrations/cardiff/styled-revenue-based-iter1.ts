/**
 * Iter 1: Replace the Revenue-Based Business Loans page hero (post 828,
 * block[0] id=hero-revenue-based-business-loans) with a two-column
 * photo-backed html-render hero that matches cardiff.co.
 *
 * Original https://cardiff.co/business-loans/products/revenue-based-business-loans/
 * uses a Divi section with a Revenue-Based-Financing photo as background,
 * a deep blue overlay on the LEFT that fades into the image on the right,
 * uppercase headline, body copy, and a green "APPLY NOW" CTA (with a ghost
 * "Talk to a Specialist" secondary).
 *
 * Our current port is a flat blue centered hero with two stacked buttons —
 * completely different layout, no image. Same pattern as
 * styled-mca-iter1.ts / styled-sba-loans-iter1.ts.
 *
 * Idempotent: refuses to clobber if block[0] is not the original section.
 * Re-running after the swap is a no-op (it will re-write the same html-render).
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 828;
const HERO_BLOCK_ID = 'hero-revenue-based-business-loans';

const HERO_HTML = `
<style>
  .cd-rbf-hero { position: relative; overflow: hidden; background: #1c3370; color: #fff; padding: 110px 24px 130px 24px; min-height: 520px; }
  .cd-rbf-hero::before { content: ''; position: absolute; inset: 0; background-image: var(--cd-rbf-hero-bg); background-size: cover; background-position: center right; z-index: 1; }
  .cd-rbf-hero::after { content: ''; position: absolute; inset: 0; background: linear-gradient(95deg, rgba(28,51,112,0.94) 0%, rgba(28,51,112,0.86) 38%, rgba(37,65,139,0.55) 64%, rgba(37,65,139,0.18) 82%, rgba(37,65,139,0.04) 100%); z-index: 2; pointer-events: none; }
  .cd-rbf-hero__inner { position: relative; z-index: 3; max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 48px; align-items: center; min-height: 360px; }
  .cd-rbf-hero__copy { max-width: 560px; }
  .cd-rbf-hero__eyebrow { display: inline-block; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.72rem; letter-spacing: 0.32em; text-transform: uppercase; color: #ffb798; font-weight: 700; margin: 0 0 20px 0; }
  .cd-rbf-hero__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 3.5rem; font-weight: 800; letter-spacing: -0.02em; line-height: 1.06; color: #fff; text-transform: uppercase; margin: 0 0 22px 0; text-shadow: 0 2px 22px rgba(0,0,0,0.42); }
  .cd-rbf-hero__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; font-weight: 400; line-height: 1.6; color: rgba(255,255,255,0.92); margin: 0 0 32px 0; max-width: 480px; }
  .cd-rbf-hero__ctas { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; }
  .cd-rbf-hero__cta { display: inline-block; background: #5ac96f; color: #ffffff; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 700; font-size: 0.875rem; letter-spacing: 0.12em; text-transform: uppercase; padding: 17px 36px; border-radius: 4px; text-decoration: none; box-shadow: 0 14px 36px rgba(90,201,111,0.42); transition: transform 0.2s ease, box-shadow 0.2s ease; }
  .cd-rbf-hero__cta:hover { transform: translateY(-1px); box-shadow: 0 18px 42px rgba(90,201,111,0.52); }
  .cd-rbf-hero__cta--ghost { background: transparent; color: #ffffff; border: 1.5px solid rgba(255,255,255,0.5); padding: 15.5px 32px; box-shadow: none; backdrop-filter: blur(6px); }
  .cd-rbf-hero__cta--ghost:hover { background: rgba(255,255,255,0.10); box-shadow: none; }
  .cd-rbf-hero__photo { position: relative; z-index: 3; align-self: stretch; }
  @media (max-width: 900px) {
    .cd-rbf-hero { padding: 64px 20px 80px 20px; min-height: auto; }
    .cd-rbf-hero::after { background: linear-gradient(180deg, rgba(28,51,112,0.88) 0%, rgba(28,51,112,0.78) 100%); }
    .cd-rbf-hero__inner { grid-template-columns: 1fr; gap: 24px; min-height: auto; text-align: center; }
    .cd-rbf-hero__copy { max-width: none; margin: 0 auto; }
    .cd-rbf-hero__title { font-size: 2.25rem; }
    .cd-rbf-hero__ctas { justify-content: center; }
    .cd-rbf-hero__photo { display: none; }
  }
</style>
<section class="cd-rbf-hero" style="--cd-rbf-hero-bg: url('{{photoUrl}}');">
  <div class="cd-rbf-hero__inner">
    <div class="cd-rbf-hero__copy">
      <p class="cd-rbf-hero__eyebrow" data-field="eyebrow">{{eyebrow}}</p>
      <h1 class="cd-rbf-hero__title" data-field="title">{{title}}</h1>
      <p class="cd-rbf-hero__desc" data-field="description">{{description}}</p>
      <div class="cd-rbf-hero__ctas">
        <a class="cd-rbf-hero__cta" href="{{ctaUrl}}" data-field="ctaText">{{ctaText}}</a>
        <a class="cd-rbf-hero__cta cd-rbf-hero__cta--ghost" href="{{secondaryCtaUrl}}" data-field="secondaryCtaText">{{secondaryCtaText}}</a>
      </div>
    </div>
    <div class="cd-rbf-hero__photo" aria-hidden="true"></div>
  </div>
</section>
`.trim();

const PHOTO_URL = 'https://cardiff.co/wp-content/uploads/2025/10/Revenue-Based-Financing-at-Cardiff.jpg';

const newHeroBlock = {
  id: HERO_BLOCK_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  html: HERO_HTML,
  fields: [
    { name: 'eyebrow', label: 'Eyebrow', type: 'text', default: 'REVENUE-BASED BUSINESS LOANS' },
    { name: 'title', label: 'Headline', type: 'text', default: 'Unlock Cash Flow Flexibility with Cardiff’s Revenue-Based Business Loans' },
    { name: 'description', label: 'Description', type: 'textarea', default: 'Cardiff offers revenue-based business loans, providing repayment that scales with your company’s income. Click to get capital to manage cash flow.' },
    { name: 'ctaText', label: 'Primary CTA text', type: 'text', default: 'Apply Now' },
    { name: 'ctaUrl', label: 'Primary CTA url', type: 'url', default: 'https://cardiff.co/business/apply' },
    { name: 'secondaryCtaText', label: 'Secondary CTA text', type: 'text', default: 'Talk to a Specialist' },
    { name: 'secondaryCtaUrl', label: 'Secondary CTA url', type: 'url', default: '/contact-us' },
    { name: 'photoUrl', label: 'Hero photo', type: 'image', default: PHOTO_URL },
  ],
  values: {
    eyebrow: 'REVENUE-BASED BUSINESS LOANS',
    title: 'Unlock Cash Flow Flexibility with Cardiff’s Revenue-Based Business Loans',
    description: 'Cardiff offers revenue-based business loans, providing repayment that scales with your company’s income. Click to get capital to manage cash flow.',
    ctaText: 'Apply Now',
    ctaUrl: 'https://cardiff.co/business/apply',
    secondaryCtaText: 'Talk to a Specialist',
    secondaryCtaUrl: '/contact-us',
    photoUrl: PHOTO_URL,
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
  if (oldHero?.id !== HERO_BLOCK_ID) {
    console.error(`Post ${POST_ID}: block[0] is not '${HERO_BLOCK_ID}' (was ${oldHero?.id} / type ${oldHero?.type}); aborting to avoid clobbering`);
    process.exit(1);
  }
  if (oldHero?.type !== 'section' && oldHero?.type !== 'html-render') {
    console.error(`Post ${POST_ID}: block[0] has unexpected type ${oldHero?.type}; aborting`);
    process.exit(1);
  }
  parsed.blocks[0] = newHeroBlock;
  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: replaced '${HERO_BLOCK_ID}' with html-render. Block count: ${parsed.blocks.length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
