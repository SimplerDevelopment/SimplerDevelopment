/**
 * Replace the home page (post id 793) hero block with a two-column
 * html-render hero that matches cardiff.co — text + CTAs on the left,
 * photo of the customer on the right, blue gradient background.
 *
 * The stock `hero` block is single-column centered; cardiff.co is a
 * split layout that the stock block can't express. Using html-render
 * with content-managed fields keeps headline/subtitle/CTAs editable.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const HOME_POST_ID = 793;

const HERO_HTML = `
<style>
  .cd-hero { position: relative; overflow: hidden; background: #1c3370; color: #fff; padding: 88px 24px 96px 24px; }
  .cd-hero::before { content: ''; position: absolute; inset: 0; background: linear-gradient(95deg, rgba(28,51,112,0.96) 0%, rgba(28,51,112,0.88) 35%, rgba(37,65,139,0.55) 62%, rgba(37,65,139,0.20) 80%, rgba(37,65,139,0.05) 100%); z-index: 2; pointer-events: none; }
  .cd-hero::after { content: ''; position: absolute; top: 0; right: 0; bottom: 0; width: 60%; background-image: var(--cd-hero-bg); background-size: cover; background-position: center right; z-index: 1; }
  .cd-hero__inner { position: relative; z-index: 3; max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 48px; align-items: center; min-height: 460px; }
  .cd-hero__copy { max-width: 560px; }
  .cd-hero__eyebrow { display: inline-block; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.72rem; letter-spacing: 0.32em; text-transform: uppercase; color: #ffb798; font-weight: 700; margin: 0 0 22px 0; }
  .cd-hero__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 4.25rem; font-weight: 800; letter-spacing: -0.02em; line-height: 1.02; color: #fff; text-transform: uppercase; margin: 0 0 22px 0; text-shadow: 0 2px 24px rgba(0,0,0,0.42); }
  .cd-hero__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.125rem; font-weight: 400; line-height: 1.55; color: rgba(255,255,255,0.92); margin: 0 0 32px 0; max-width: 480px; }
  .cd-hero__ctas { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; }
  .cd-hero__cta { display: inline-block; background: #5ac96f; color: #ffffff; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 700; font-size: 0.875rem; letter-spacing: 0.12em; text-transform: uppercase; padding: 17px 36px; border-radius: 4px; text-decoration: none; box-shadow: 0 14px 36px rgba(90,201,111,0.42); transition: transform 0.2s ease, box-shadow 0.2s ease; }
  .cd-hero__cta:hover { transform: translateY(-1px); box-shadow: 0 18px 42px rgba(90,201,111,0.52); }
  .cd-hero__cta--ghost { background: transparent; color: #ffffff; border: 1.5px solid rgba(255,255,255,0.5); padding: 15.5px 32px; box-shadow: none; backdrop-filter: blur(6px); }
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
  id: 'home-hero',
  type: 'html-render' as const,
  width: 'full' as const,
  html: HERO_HTML,
  fields: [
    { name: 'eyebrow', label: 'Eyebrow', type: 'text', default: 'SMALL BUSINESS FINANCING UP TO $250,000' },
    { name: 'title', label: 'Headline', type: 'text', default: 'Borrow Better' },
    { name: 'description', label: 'Description', type: 'textarea', default: "You wouldn't wait ten minutes for a latte, so why wait longer for business financing?" },
    { name: 'ctaText', label: 'Primary CTA text', type: 'text', default: 'Check Eligibility' },
    { name: 'ctaUrl', label: 'Primary CTA url', type: 'url', default: 'https://cardiff.co/business/apply' },
    { name: 'secondaryCtaText', label: 'Secondary CTA text', type: 'text', default: 'See Loan Options' },
    { name: 'secondaryCtaUrl', label: 'Secondary CTA url', type: 'url', default: '#products' },
    { name: 'photoUrl', label: 'Hero photo', type: 'image', default: 'https://cardiff.b-cdn.net/img/home-header-full.png' },
  ],
  values: {
    eyebrow: 'SMALL BUSINESS FINANCING UP TO $250,000',
    title: 'Borrow Better',
    description: "You wouldn't wait ten minutes for a latte, so why wait longer for business financing?",
    ctaText: 'Check Eligibility',
    ctaUrl: 'https://cardiff.co/business/apply',
    secondaryCtaText: 'See Loan Options',
    secondaryCtaUrl: '#products',
    photoUrl: 'https://cardiff.b-cdn.net/img/home-header-full.png',
  },
};

async function main() {
  const [row] = await db.select().from(posts).where(eq(posts.id, HOME_POST_ID)).limit(1);
  if (!row) {
    console.error(`Post ${HOME_POST_ID} not found`);
    process.exit(1);
  }
  const parsed = JSON.parse(row.content);
  if (!Array.isArray(parsed.blocks)) {
    console.error(`Post ${HOME_POST_ID}: content.blocks is not an array`);
    process.exit(1);
  }
  const oldHero = parsed.blocks[0];
  if (oldHero?.type !== 'hero') {
    console.error(`Post ${HOME_POST_ID}: block[0] is not 'hero' (was ${oldHero?.type}); aborting to avoid clobbering`);
    process.exit(1);
  }
  // Preserve any sub-blocks (feature cards) the hero carried by lifting them
  // into a sibling section so they're not lost.
  const subBlocks = Array.isArray(oldHero.blocks) ? oldHero.blocks : [];
  parsed.blocks[0] = newHeroBlock;
  if (subBlocks.length > 0) {
    // Insert sub-blocks immediately after the new hero so they keep visual
    // adjacency with the hero (these are typically trust/feature bars).
    parsed.blocks.splice(1, 0, ...subBlocks);
    console.log(`Preserved ${subBlocks.length} hero sub-block(s) as siblings after the new hero`);
  }
  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, HOME_POST_ID));
  console.log(`Updated post ${HOME_POST_ID}: replaced hero with html-render. New block count: ${parsed.blocks.length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
