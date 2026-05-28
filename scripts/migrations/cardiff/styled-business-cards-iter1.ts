/**
 * BRAIN-iter1 for post 797 (Business Cash Advance Credit Cards).
 * Original cardiff.co hero is a centered headline + short tagline + APPLY NOW
 * button on a full-bleed photo background with deep-blue gradient overlay.
 * The current port hero is a flat blue section. Replace block[0] (a `section`
 * wrapping heading/text/columns) with an html-render hero that paints the
 * photo + gradient and centers the copy/CTA exactly like cardiff.co.
 *
 * Idempotent: re-running just refreshes block[0] to the html-render hero.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 797;

const HERO_HTML = `
<style>
  .cdbc-hero { position: relative; overflow: hidden; min-height: 460px; display: flex; align-items: center; justify-content: center; padding: 120px 24px 132px 24px; color: #fff; }
  .cdbc-hero::before { content: ''; position: absolute; inset: 0; background-image: var(--cdbc-hero-bg); background-size: cover; background-position: center center; z-index: 0; }
  .cdbc-hero::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(37,65,139,0.55) 0%, rgba(28,51,112,0.78) 100%); z-index: 1; }
  .cdbc-hero__inner { position: relative; z-index: 2; max-width: 980px; width: 100%; text-align: center; }
  .cdbc-hero__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 3.25rem; font-weight: 800; letter-spacing: -0.01em; line-height: 1.08; color: #fff; margin: 0 0 18px 0; text-shadow: 0 2px 18px rgba(0,0,0,0.4); }
  .cdbc-hero__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; font-weight: 400; line-height: 1.55; color: rgba(255,255,255,0.92); margin: 0 auto 30px auto; max-width: 640px; text-shadow: 0 1px 8px rgba(0,0,0,0.35); }
  .cdbc-hero__cta { display: inline-block; background: #5ac96f; color: #ffffff; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 700; font-size: 0.875rem; letter-spacing: 0.14em; text-transform: uppercase; padding: 16px 38px; border-radius: 3px; text-decoration: none; box-shadow: 0 14px 32px rgba(90,201,111,0.42); transition: transform 0.2s ease, box-shadow 0.2s ease; }
  .cdbc-hero__cta:hover { transform: translateY(-1px); box-shadow: 0 18px 38px rgba(90,201,111,0.52); }
  @media (max-width: 720px) {
    .cdbc-hero { padding: 80px 20px 92px 20px; min-height: 360px; }
    .cdbc-hero__title { font-size: 2.15rem; }
    .cdbc-hero__desc { font-size: 1rem; }
  }
</style>
<section class="cdbc-hero" style="--cdbc-hero-bg: url('{{photoUrl}}');">
  <div class="cdbc-hero__inner">
    <h1 class="cdbc-hero__title" data-field="title">{{title}}</h1>
    <p class="cdbc-hero__desc" data-field="description">{{description}}</p>
    <a class="cdbc-hero__cta" href="{{ctaUrl}}" data-field="ctaText">{{ctaText}}</a>
  </div>
</section>
`.trim();

const newHeroBlock = {
  id: 'hero-business-cards',
  type: 'html-render' as const,
  width: 'full' as const,
  html: HERO_HTML,
  fields: [
    { name: 'title', label: 'Headline', type: 'text', default: 'Business Cash Advance Credit Cards' },
    { name: 'description', label: 'Description', type: 'textarea', default: 'Cardiff offers great rates, a large credit window, and a generous spending limit.' },
    { name: 'ctaText', label: 'CTA text', type: 'text', default: 'Apply Now' },
    { name: 'ctaUrl', label: 'CTA url', type: 'url', default: 'https://cardiff.co/business/apply' },
    { name: 'photoUrl', label: 'Hero photo', type: 'image', default: 'https://cardiffcompany.wpenginepowered.com/wp-content/uploads/2025/08/business-cash-advance-credit-cards.jpg' },
  ],
  values: {
    title: 'Business Cash Advance Credit Cards',
    description: 'Cardiff offers great rates, a large credit window, and a generous spending limit.',
    ctaText: 'Apply Now',
    ctaUrl: 'https://cardiff.co/business/apply',
    photoUrl: 'https://cardiffcompany.wpenginepowered.com/wp-content/uploads/2025/08/business-cash-advance-credit-cards.jpg',
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
  const old = parsed.blocks[0];
  if (old?.id !== 'hero-business-cards') {
    console.error(`Post ${POST_ID}: block[0].id is '${old?.id}', expected 'hero-business-cards'; aborting`);
    process.exit(1);
  }
  parsed.blocks[0] = newHeroBlock;
  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: replaced hero with html-render. Block count unchanged: ${parsed.blocks.length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
