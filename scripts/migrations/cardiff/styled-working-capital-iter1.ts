/**
 * Working Capital page (post 837) — iter1.
 * Replace the flat blue hero `section` (id "hero-working-capital") with the
 * cardiff.co 2-col html-render hero (copy + CTAs left, product photo right
 * with deep-blue overlay gradient).
 *
 * Single biggest visual gap on this page vs cardiff.co/business-loans/products/working-capital/.
 * Idempotent: only replaces if block[0].type === 'section' AND id starts with 'hero'.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 837;

const HERO_HTML = `
<style>
  .cd-hero { position: relative; overflow: hidden; background: #1c3370; color: #fff; padding: 88px 24px 96px 24px; }
  .cd-hero::before { content: ''; position: absolute; inset: 0; background: linear-gradient(95deg, rgba(28,51,112,0.96) 0%, rgba(28,51,112,0.88) 35%, rgba(37,65,139,0.55) 62%, rgba(37,65,139,0.20) 80%, rgba(37,65,139,0.05) 100%); z-index: 2; pointer-events: none; }
  .cd-hero::after { content: ''; position: absolute; top: 0; right: 0; bottom: 0; width: 58%; background-image: var(--cd-hero-bg); background-size: cover; background-position: center right; z-index: 1; }
  .cd-hero__inner { position: relative; z-index: 3; max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 48px; align-items: center; min-height: 420px; }
  .cd-hero__copy { max-width: 560px; }
  .cd-hero__eyebrow { display: inline-block; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.72rem; letter-spacing: 0.32em; text-transform: uppercase; color: #ffb798; font-weight: 700; margin: 0 0 22px 0; }
  .cd-hero__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 4rem; font-weight: 800; letter-spacing: -0.02em; line-height: 1.02; color: #fff; text-transform: uppercase; margin: 0 0 22px 0; text-shadow: 0 2px 24px rgba(0,0,0,0.42); }
  .cd-hero__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; font-weight: 400; line-height: 1.55; color: rgba(255,255,255,0.92); margin: 0 0 32px 0; max-width: 480px; }
  .cd-hero__ctas { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; }
  .cd-hero__cta { display: inline-block; background: #ef6632; color: #ffffff; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 700; font-size: 0.875rem; letter-spacing: 0.12em; text-transform: uppercase; padding: 17px 36px; border-radius: 4px; text-decoration: none; box-shadow: 0 14px 36px rgba(239,102,50,0.42); transition: transform 0.2s ease, box-shadow 0.2s ease; }
  .cd-hero__cta:hover { transform: translateY(-1px); box-shadow: 0 18px 42px rgba(239,102,50,0.52); }
  .cd-hero__cta--ghost { background: transparent; color: #ffffff; border: 1.5px solid rgba(255,255,255,0.55); padding: 15.5px 32px; box-shadow: none; backdrop-filter: blur(6px); }
  .cd-hero__cta--ghost:hover { background: rgba(255,255,255,0.10); box-shadow: none; }
  .cd-hero__photo { position: relative; z-index: 3; align-self: stretch; }
  @media (max-width: 900px) {
    .cd-hero { padding: 56px 20px 72px 20px; }
    .cd-hero::after { width: 100%; opacity: 0.32; }
    .cd-hero__inner { grid-template-columns: 1fr; gap: 24px; min-height: auto; text-align: center; }
    .cd-hero__copy { max-width: none; margin: 0 auto; }
    .cd-hero__title { font-size: 2.5rem; }
    .cd-hero__ctas { justify-content: center; }
    .cd-hero__photo { display: none; }
  }
</style>
<section class="cd-hero" style="--cd-hero-bg: url('{{photoUrl}}');">
  <div class="cd-hero__inner">
    <div class="cd-hero__copy">
      <p class="cd-hero__eyebrow" data-field="eyebrow">{{eyebrow}}</p>
      <h1 class="cd-hero__title" data-field="title">{{title}}</h1>
      <p class="cd-hero__desc" data-field="description">{{description}}</p>
      <div class="cd-hero__ctas">
        <a class="cd-hero__cta" href="{{ctaUrl}}" data-field="ctaText">{{ctaText}}</a>
        <a class="cd-hero__cta cd-hero__cta--ghost" href="{{secondaryCtaUrl}}" data-field="secondaryCtaText">{{secondaryCtaText}}</a>
      </div>
    </div>
    <div class="cd-hero__photo" aria-hidden="true"></div>
  </div>
</section>
`.trim();

const newHeroBlock = {
  id: 'hero-working-capital',
  type: 'html-render' as const,
  width: 'full' as const,
  html: HERO_HTML,
  fields: [
    { name: 'eyebrow', label: 'Eyebrow', type: 'text', default: 'WORKING CAPITAL FINANCING' },
    { name: 'title', label: 'Headline', type: 'text', default: 'Working Capital' },
    { name: 'description', label: 'Description', type: 'textarea', default: 'Access fast business loans with immediate approval and no collateral business loan options. Get business capital now from trusted online lenders.' },
    { name: 'ctaText', label: 'Primary CTA text', type: 'text', default: 'Apply Now' },
    { name: 'ctaUrl', label: 'Primary CTA url', type: 'url', default: 'https://cardiff.co/business/apply' },
    { name: 'secondaryCtaText', label: 'Secondary CTA text', type: 'text', default: 'Talk to a Specialist' },
    { name: 'secondaryCtaUrl', label: 'Secondary CTA url', type: 'url', default: 'tel:8882340185' },
    { name: 'photoUrl', label: 'Hero photo', type: 'image', default: 'https://cardiffcompany.wpenginepowered.com/wp-content/uploads/2025/06/working-capital-finance.png' },
  ],
  values: {
    eyebrow: 'WORKING CAPITAL FINANCING',
    title: 'Working Capital',
    description: 'Access fast business loans with immediate approval and no collateral business loan options. Get business capital now from trusted online lenders.',
    ctaText: 'Apply Now',
    ctaUrl: 'https://cardiff.co/business/apply',
    secondaryCtaText: 'Talk to a Specialist',
    secondaryCtaUrl: 'tel:8882340185',
    photoUrl: 'https://cardiffcompany.wpenginepowered.com/wp-content/uploads/2025/06/working-capital-finance.png',
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
  if (!oldHero || (oldHero.type !== 'section' && oldHero.type !== 'html-render')) {
    console.error(`Post ${POST_ID}: block[0] is not 'section' or 'html-render' (was ${oldHero?.type}); aborting`);
    process.exit(1);
  }
  if (typeof oldHero.id !== 'string' || !oldHero.id.startsWith('hero')) {
    console.error(`Post ${POST_ID}: block[0].id "${oldHero.id}" does not start with 'hero'; aborting`);
    process.exit(1);
  }
  parsed.blocks[0] = newHeroBlock;
  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: replaced hero with 2-col html-render. Block count: ${parsed.blocks.length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
